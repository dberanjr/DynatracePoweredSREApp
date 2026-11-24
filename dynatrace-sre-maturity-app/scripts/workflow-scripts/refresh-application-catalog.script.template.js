import { queryExecutionClient } from '@dynatrace-sdk/client-query';

// Builds the app's application catalog, /lookups/dtsrepoweredapp/cmdb, from the table your organisation supplies.
//
// The source table can use any column names. This workflow maps them onto the fixed columns the app needs
// (SOURCE_COLUMNS below) and keeps a row only if its application ID has at least one live Smartscape node in this
// tenant. Applications that nothing reports for are left out, so the app's picker, scorecards and leaderboard list
// only applications that can actually be scored. The source table is never modified.
//
// This is the only table you provide. To point the workflow at yours, edit the constants below (source path,
// column names, tag keys); the rest of the app and its other workflows need no changes.
//
// "Live" = a Smartscape node of any type seen in the last WINDOW that carries the application ID as a tag
// (`<key>:<id>` for any key in TAG_KEYS, also as a Kubernetes label). Widen WINDOW to keep applications that
// report less often.

const SRC          = '__SOURCE_PATH__';
const DST          = '__DEST_PATH__';
const WINDOW       = '__WINDOW__';
const ID_MAX       = __ID_MAX__;          // longest application ID kept (a sanity cap on tag values)
const TAG_KEYS     = __TAG_KEYS__;        // Smartscape tag keys that carry the application ID
// Output column -> column in YOUR source table. The first entry is the application ID. '' = your table has no such
// column; the output column is still written (blank) so the app always finds it.
const SOURCE_COLUMNS = __SOURCE_COLUMNS__;
// Extra source columns copied unchanged (the app can show them in the profile banner, see Settings > Extra columns).
const PASS_THROUGH = __PASS_THROUGH__;
const D            = '^';                 // field delimiter; stripped from values below so it can never occur in one

const OUT_COLUMNS = [...Object.keys(SOURCE_COLUMNS), ...PASS_THROUGH.filter((c) => !(c in SOURCE_COLUMNS))];
const ID_OUT = OUT_COLUMNS[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// An empty LD token fails to parse, so an empty value is written as one space.
const clean = (v) => {
  const s = (v === null || v === undefined) ? '' : String(v).replace(/[\r\n\t^]/g, ' ').trim();
  return s === '' ? ' ' : s;
};

async function runDql(query, maxResultRecords) {
  const started = await queryExecutionClient.queryExecute({
    body: { query, maxResultRecords, requestTimeoutMilliseconds: 55000 },
  });
  if (started.result) return started.result.records || [];
  const requestToken = started.requestToken;
  for (let i = 0; i < 200; i++) {
    const p = await queryExecutionClient.queryPoll({ requestToken });
    if (p.state === 'SUCCEEDED') return (p.result && p.result.records) || [];
    if (p.state !== 'NOT_STARTED' && p.state !== 'RUNNING') throw new Error('DQL ended in state ' + p.state);
    await sleep(400);
  }
  throw new Error('DQL poll timed out');
}

export default async function () {
  // 1. Every application ID with live nodes, and how many nodes.
  const tagExprs = TAG_KEYS.flatMap((k) => ['tags[`' + k + '`]', 'tags[`[Kubernetes]' + k + '`]']);
  const activeQuery = [
    'smartscapeNodes "*", from:' + WINDOW + ', to:now()',
    '| fieldsAdd tagValue = coalesce(' + tagExprs.join(', ') + ')',
    '| filter isNotNull(tagValue)',
    '| fieldsAdd appId = lower(trim(arrayFirst(splitString(replaceString(replaceString(replaceString(toString(tagValue), "[", ""), "]", ""), "\\"", ""), ","))))',
    '| filter appId != "" and stringLength(appId) <= ' + ID_MAX,
    '| summarize nodes = count(), by:{appId}',
  ].join('\n');
  const active = await runDql(activeQuery, 20000);
  const nodesById = new Map(active.map((r) => [String(r.appId).toLowerCase(), Number(r.nodes) || 0]));

  // 2. The source table, normalised to the app's columns and kept where its application ID is active.
  const source = await runDql('load "' + SRC + '"\n| limit 50000', 50000);
  const seen = new Set();
  const lines = [];
  let duplicates = 0;
  for (const r of source) {
    const raw = r[SOURCE_COLUMNS[ID_OUT]];
    const id = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
    if (!id || !nodesById.has(id)) continue;
    if (seen.has(id)) { duplicates++; continue; }   // one row per application ID
    seen.add(id);
    const cells = OUT_COLUMNS.map((c) => {
      if (c === ID_OUT) return id;
      const from = c in SOURCE_COLUMNS ? SOURCE_COLUMNS[c] : c;   // pass-through columns keep their own name
      return clean(from ? r[from] : '');
    });
    lines.push([...cells.map(clean), String(nodesById.get(id))].join(D));
  }
  lines.sort();

  // A 0-row lookup exposes no columns, which breaks every query that loads it. If nothing is active (for example
  // the Smartscape query returned nothing), stop and keep the previous table rather than empty it.
  if (lines.length === 0) {
    throw new Error('No source application ID has live nodes (' + active.length + ' active IDs in the tenant, ' + source.length + ' source rows); keeping the existing ' + DST + '.');
  }

  // 3. Publish. The header line is dropped on parse (it cannot match the pattern), so skippedRecords is 0.
  const header = [...OUT_COLUMNS, 'nodes'].join(D);
  const content = header + '\n' + lines.join('\n') + '\n';
  const meta = {
    filePath: DST,
    displayName: 'Application catalog (active applications only)',
    description: 'Rows of ' + SRC + ' whose application ID has live Smartscape nodes (last ' + WINDOW.replace('now()-', '') + '), with columns normalised to what the SRE app needs. Refreshed by the "DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb (application catalog from your AppId source table)" workflow. nodes = live node count.',
    lookupField: ID_OUT,
    parsePattern: [...OUT_COLUMNS, 'nodes'].map((c) => (c === 'nodes' ? 'INT:nodes' : 'LD:' + c)).join(" '^' "),
    skippedRecords: 0,
    autoFlatten: true,
    timezone: 'UTC',
    locale: 'en_US',
    overwrite: true,
  };
  const boundary = '----appcatalog' + Date.now();
  const body =
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="request"\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(meta) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="content"; filename="cmdb"\r\n' +
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
    sourceRows: source.length,
    activeIdsInTenant: active.length,
    kept: lines.length,
    removedNoEntities: source.length - lines.length - duplicates,
    duplicatesSkipped: duplicates,
    bytes: content.length,
  };
}
