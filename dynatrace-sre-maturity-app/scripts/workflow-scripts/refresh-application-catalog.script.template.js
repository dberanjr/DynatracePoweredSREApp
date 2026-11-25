import { queryExecutionClient } from '@dynatrace-sdk/client-query';

__RUNTIME_CONFIG__

// Builds the app's application catalog, /lookups/dtsrepoweredapp/cmdb, from the table your organisation supplies.
//
// Everything this workflow needs is read from /lookups/dtsrepoweredapp/config at run time, which the app's Settings page
// writes: your source table, which of its columns holds what, the application ID tag keys, and how recent "live" is.
// The workflow is identical for every customer; there is nothing to edit here.
//
// It maps your columns onto the fixed columns the app needs and keeps a row only if its application ID has at least one
// live Smartscape node in this tenant. Applications that nothing reports for are left out, so the app's picker, scorecards
// and leaderboard list only applications that can actually be scored. The source table is never modified.
//
// "Live" = a Smartscape node of any type seen in the last window that carries the application ID as a tag
// (`<key>:<id>` for any tag key in Settings, also as a Kubernetes label).

const DST          = '__DEST_PATH__';
// Settings field key -> the catalog column it fills (generated from LOOKUP_DEFS.cmdb). The first entry is the application ID.
const FIELD_TO_OUT = __FIELD_TO_OUT__;
const D            = '^';                 // field delimiter; stripped from values below so it can never occur in one

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// An empty LD token fails to parse, so an empty value is written as one space.
const clean = (v) => {
  const s = (v === null || v === undefined) ? '' : String(v).replace(/[\r\n\t^]/g, ' ').trim();
  return s === '' ? ' ' : s;
};

async function uploadLookup(meta, content, filename) {
  const full = { skippedRecords: 0, autoFlatten: true, timezone: 'UTC', locale: 'en_US', overwrite: true, ...meta };
  const boundary = '----appcatalog' + Date.now() + Math.random().toString(36).slice(2);
  const body =
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="request"\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(full) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="content"; filename="' + filename + '"\r\n' +
    'Content-Type: application/octet-stream\r\n\r\n' +
    content + '\r\n' +
    '--' + boundary + '--\r\n';
  const resp = await fetch('/platform/storage/resource-store/v1/files/tabular/lookup:upload', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error('Lookup upload of ' + meta.filePath + ' failed: ' + resp.status + ' ' + text);
}

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
  const cfg = await loadAppConfig();
  const SRC = cfg.text('sourcePath');
  if (!/^\/lookups\/[A-Za-z0-9_\-./]+$/.test(SRC)) throw new Error('No source table is configured. Open the SRE maturity app, go to Settings, enter your lookup table under "Application catalog", and Save.');
  let columns = {};
  try { columns = JSON.parse(cfg.text('sourceColumns') || '{}'); } catch (e) { throw new Error('sourceColumns in ' + APP_CONFIG_PATH + ' is not valid JSON. Save the Settings page again.'); }
  const idColumn = String(columns.appId || '').trim();
  if (!idColumn) throw new Error('No column is mapped to the application ID. Open Settings and map one under "Application catalog".');
  const WINDOW = 'now()-' + (/^\d+[hd]$/.test(cfg.text('activeWindow')) ? cfg.text('activeWindow') : '24h');
  const ID_MAX = cfg.idMaxLength;
  const PASS_THROUGH = cfg.text('passThrough').split(',').map((c) => c.trim()).filter(Boolean);
  // Catalog columns in order: the fixed ones, then the pass-through columns (kept under their own names).
  const OUT_COLUMNS = [...Object.values(FIELD_TO_OUT), ...PASS_THROUGH.filter((c) => !Object.values(FIELD_TO_OUT).includes(c))];
  const ID_OUT = OUT_COLUMNS[0];
  const sourceColumnFor = (outColumn) => {
    const field = Object.keys(FIELD_TO_OUT).find((f) => FIELD_TO_OUT[f] === outColumn);
    return field ? String(columns[field] || '').trim() : outColumn;   // pass-through columns keep their own name
  };

  // 1. Every application ID with live nodes, and how many nodes.
  const tagKeys = Array.from(new Set([...cfg.tagKeys, cfg.cloudTagKey]));
  const tagExprs = tagKeys.flatMap((k) => ['tags[`' + k + '`]', 'tags[`[Kubernetes]' + k + '`]']);
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
    const raw = r[idColumn];
    const id = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
    if (!id || !nodesById.has(id)) continue;
    if (seen.has(id)) { duplicates++; continue; }   // one row per application ID
    seen.add(id);
    const cells = OUT_COLUMNS.map((c) => {
      if (c === ID_OUT) return id;
      const from = sourceColumnFor(c);
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

  // 3. Publish the catalog. The header line is dropped on parse (it cannot match the pattern), so skippedRecords is 0.
  const header = [...OUT_COLUMNS, 'nodes'].join(D);
  const content = header + '\n' + lines.join('\n') + '\n';
  await uploadLookup({
    filePath: DST,
    displayName: 'Application catalog (active applications only)',
    description: 'Rows of ' + SRC + ' whose application ID has live Smartscape nodes (last ' + WINDOW.replace('now()-', '') + '), with columns normalised to what the SRE app needs. Refreshed by the "DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb" workflow. nodes = live node count.',
    lookupField: ID_OUT,
    parsePattern: [...OUT_COLUMNS, 'nodes'].map((c) => (c === 'nodes' ? 'INT:nodes' : 'LD:' + c)).join(" '^' "),
  }, content, 'cmdb');

  return {
    sourceRows: source.length,
    activeIdsInTenant: active.length,
    kept: lines.length,
    removedNoEntities: source.length - lines.length - duplicates,
    duplicatesSkipped: duplicates,
    bytes: content.length,
  };
}
