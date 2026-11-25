import { queryExecutionClient } from '@dynatrace-sdk/client-query';

__RUNTIME_CONFIG__

// GENERATED PARTS: the three APP_ID_FROM_* constants below are produced by scripts/generate-snapshot-workflow.mjs
// from ui/app/queries/maturityQueries.ts, so an application ID is resolved here exactly as in the app (an
// `<appIdKey>:<code>` tag, or an `Application:<Name>` tag mapped through the application ID map table). Edit that
// module and run `npm run generate:workflows`; the template for this script is
// workflows/refresh-lookups-critical-services.script.template.js.
//
// Builds the critical services lookup: every row of the entity_severity seed table resolved to the
// Dynatrace entity ID(s) it refers to, over a rolling 24h window.
//
// Covers every appId in the source list. Runs them in chunks rather than one appId at a time:
// a per-appId loop would be ~362 queries (~40 min) and blow the 120s JS task timeout, while an
// unchunked estate-wide query fails with JOIN_RIGHT_TABLE_SIZE. Chunks of 100 keep the
// Smartscape subquery bounded and finish in ~6s each.

const SRC    = '__SEED_PATH__';
const SEED_ID = 'appId';           // the seed table's application ID column (fixed name)
const DST    = '__PATH__';
const CHUNK  = 100;        // appIds per query
const D      = '^';        // field delimiter - verified to appear 0 times in the source data
const WINDOW = 'now()-24h';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const qt    = (s) => '"' + String(s).replace(/"/g, '\\"') + '"';
const clean = (s) => (s === null || s === undefined) ? '' : String(s).replace(/[\r\n\t^]/g, ' ').trim();

let CFG = null;   // run-time config, loaded in main()

async function runDql(rawQuery, maxResultRecords) {
  const query = CFG ? applyAppConfig(rawQuery, CFG) : rawQuery;
  const started = await queryExecutionClient.queryExecute({
    body: { query, maxResultRecords, requestTimeoutMilliseconds: 55000 },
  });
  if (started.result) return started.result.records || [];
  const requestToken = started.requestToken;
  for (let i = 0; i < 200; i++) {
    const p = await queryExecutionClient.queryPoll({ requestToken });
    if (p.state === 'SUCCEEDED') return (p.result && p.result.records) || [];
    if (p.state !== 'NOT_STARTED' && p.state !== 'RUNNING') {
      throw new Error('DQL ended in state ' + p.state);
    }
    await sleep(400);
  }
  throw new Error('DQL poll timed out');
}

__APP_ID_RESOLVER__

let TAG_KEYS_RT = [];   // application ID tag keys, set from the run-time config

// Where a Smartscape node can carry the application ID: its tags map (also as a Kubernetes label), AWS tags, custom metadata.
function smartscapeTagExprs() {
  const keys = [...TAG_KEYS_RT, ...(CFG && CFG.cloudTagKey && !TAG_KEYS_RT.includes(CFG.cloudTagKey) ? [CFG.cloudTagKey] : [])];
  const maps = ['tags', '`tags:aws`', 'custom_metadata', 'host.custom.metadata'];
  return [
    ...keys.flatMap((k) => maps.map((m) => m + '[`' + k + '`]')),
    ...TAG_KEYS_RT.map((k) => '`aws.tags.' + k + '`'),
  ];
}

function buildQuery(appIds) {
  const inFilter = 'in(appId, array(' + appIds.map(qt).join(',') + '))';
  return [
    'load "' + SRC + '"',
    '| fieldsAdd appId = ' + SEED_ID,
    '| fieldsAdd e_join = concat(appId, "_", entity_name)',
    '| filter ' + inFilter,
    '| join [',
    '      fetch spans, from:' + WINDOW + ', to:now(), samplingRatio:1000',
    '      | fields endpoint.name, dt.smartscape.service',
    '      | summarize count(), by:{endpoint.name, dt.smartscape.service}',
    '    ],',
    '    kind: leftOuter,',
    '    on: { left[entity_name] == right[endpoint.name]}, fields:{id_3 = dt.smartscape.service}',
    '| fieldsAdd id_tags = entityAttr(toString(id_3),"tags",type:"dt.entity.service")',
    APP_ID_FROM_SPAN_SERVICE_TAGS,
    '| filter arraySize(id_appIds) == 0 OR in(appId, id_appIds)',
    '| join [',
    '      fetch dt.entity.service, from:' + WINDOW + ', to:now()',
    APP_ID_FROM_SERVICE_TAGS,
    '      | expand appId',
    '      | filter ' + inFilter,
    '      | fieldsAdd e_join = concat(appId, "_", entity.name)',
    '    ],',
    '    kind: leftOuter,',
    '    on: { left[e_join] == right[e_join]}, fields:{id_1 = id}',
    '| join [',
    '      smartscapeNodes "*", from:' + WINDOW + ', to:now()',
    '      | fields name, id, tags, `tags:aws`, ' + TAG_KEYS_RT.map((k) => '`aws.tags.' + k + '`').join(', ') + ', custom_metadata, host.custom.metadata',
    APP_ID_FROM_TAG_MAP,
    '      | fieldsAdd appId = coalesce(' + smartscapeTagExprs().join(', ') + ', lower(smapMapped))',
    '      | filter ' + inFilter,
    '      | fieldsAdd e_join = concat(appId, "_", name)',
    '    ],',
    '    kind: leftOuter,',
    '    on: { left[e_join] == right[e_join]}, fields:{id_2 = id}',
    '| fieldsAdd id = coalesce(id_1,id_2,id_3)',
    '| fieldsRemove e_join, id_1, id_2, id_3, id_tags, id_appIds',
    '| summarize id = collectDistinct(id), by:{appId, entity_name, severity, business_impact}',
  ].join('\n');
}

export default async function () {
  CFG = await loadAppConfig();
  TAG_KEYS_RT = CFG.tagKeys;
  // 1. every appId present in the source list
  const appIdRows = await runDql(
    'load "' + SRC + '" | fieldsAdd appId = ' + SEED_ID + ' | summarize n = count(), by:{appId} | fields appId | sort appId asc', 5000);
  const appIds = appIdRows
    .map((r) => r.appId)
    .filter((a) => a !== null && a !== undefined && String(a).trim() !== '');
  if (!appIds.length) throw new Error('No appId values found in ' + SRC);

  // 2. resolve, chunk by chunk, accumulating every row
  const rows = [];
  const chunkStats = [];
  for (let i = 0; i < appIds.length; i += CHUNK) {
    const chunk = appIds.slice(i, i + CHUNK);
    const recs = await runDql(buildQuery(chunk), 20000);
    chunkStats.push({ appIds: chunk.length, first: chunk[0], last: chunk[chunk.length - 1], rows: recs.length });
    for (const r of recs) rows.push(r);
  }

  // 3. flatten to delimited text; strip the nulls collectDistinct leaves on unresolved rows
  let resolved = 0;
  let unresolved = 0;
  let rowId = 0;
  const lines = [];
  const dash = (v) => (v === '' ? '-' : v);   // no field may be empty: an empty LD token fails to parse
  for (const r of rows) {
    const raw = Array.isArray(r.id) ? r.id : (r.id ? [r.id] : []);
    const ids = Array.from(new Set(
      raw.filter((x) => x !== null && x !== undefined && String(x) !== '').map(String)));
    if (ids.length) resolved++; else unresolved++;
    rowId += 1;
    lines.push([
      String(rowId),
      dash(clean(r.appId)),
      dash(clean(r.entity_name)),
      dash(clean(r.severity).toLowerCase()),
      dash(ids.join(' ')),
      String(ids.length),
      dash(clean(r.business_impact)),
    ].join(D));
  }

  const header = ['row_id', 'appId', 'entity_name', 'severity', 'entity_ids', 'id_count', 'business_impact'].join(D);
  const content = header + '\n' + lines.join('\n') + '\n';

  // 4. publish the lookup table
  const meta = {
    filePath: DST,
    displayName: 'Critical Services (resolved)',
    description: 'Critical services and endpoints from ' + SRC + ', resolved to Dynatrace entity IDs over a rolling 24h window. One row per source entry (row_id). entity_ids is space-separated; id_count = 0 means the row did not resolve; \'-\' means empty.',
    lookupField: 'row_id',
    parsePattern: "INT:row_id '^' LD:appId '^' LD:entity_name '^' LD:severity '^' LD:entity_ids '^' INT:id_count '^' LD:business_impact",
    // 0, not 1: the header line starts with 'row_id', which can't match INT:row_id, so it is already
    // dropped as an unparseable record. skippedRecords: 1 then also discarded the first real row.
    skippedRecords: 0,
    autoFlatten: true,
    timezone: 'UTC',
    locale: 'en_US',
    overwrite: true,
  };

  const boundary = '----criticalservices' + Date.now();
  const body =
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="request"\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(meta) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="content"; filename="critical_services"\r\n' +
    'Content-Type: application/octet-stream\r\n\r\n' +
    content + '\r\n' +
    '--' + boundary + '--\r\n';

  const resp = await fetch('/platform/storage/resource-store/v1/files/tabular/lookup:upload', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error('Lookup upload failed: ' + resp.status + ' ' + text);

  return {
    appIds: appIds.length,
    chunks: chunkStats.length,
    chunkStats,
    rowsWritten: lines.length,
    resolved,
    unresolved,
    bytes: content.length,
  };
}
