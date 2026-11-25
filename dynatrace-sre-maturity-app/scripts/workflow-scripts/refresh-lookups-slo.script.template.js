// Refreshes the SLOs lookup (/lookups/dtsrepoweredapp/slo; one row per SLO name) from the Gen3 SLO platform API.
// Each SLO's application ID is its `<tagKey>:<id>` tag (any of the configured tag keys), falling back to the first word of its name that is an
// application ID of the catalog when the SLO has no such tag. The keys come from the run-time config.
// NOTE: the platform SLO API rejects page-size when page-key is set — first
// page uses page-size, subsequent pages use page-key only (confirmed in getSloDetail.function.ts).
import { queryExecutionClient } from '@dynatrace-sdk/client-query';

__RUNTIME_CONFIG__

let TAG_KEYS = [];
let CATALOG_IDS = new Set();

// The application IDs of the catalog (/lookups/dtsrepoweredapp/cmdb), lower case. A name only counts for an application that exists there.
async function loadCatalogIds() {
  const started = await queryExecutionClient.queryExecute({
    body: { query: 'load "/lookups/dtsrepoweredapp/cmdb" | fields appId | limit 50000', maxResultRecords: 50000, requestTimeoutMilliseconds: 55000 },
  });
  let records = started.result ? started.result.records || [] : null;
  for (let i = 0; records === null && i < 100; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const p = await queryExecutionClient.queryPoll({ requestToken: started.requestToken });
    if (p.state === 'SUCCEEDED') records = (p.result && p.result.records) || [];
    else if (p.state !== 'NOT_STARTED' && p.state !== 'RUNNING') throw new Error('Reading the catalog ended in state ' + p.state);
  }
  if (records === null) throw new Error('Reading the catalog timed out');
  return new Set(records.map((r) => String(r.appId || '').trim().toLowerCase()).filter(Boolean));
}

// The naming rule (same as nameWordsExpr in ui/app/queries/maturityQueries.ts): a name belongs to an application when the
// application's ID is one of its WORDS, ignoring case. Words are separated by whitespace and _ - : / . , ( ) [ ] |
const nameWords = (name) => String(name || '').toLowerCase().split(/[\s_\-:/.,()[\]|]+/).filter(Boolean);

function sloAppId(s) {
  for (const key of TAG_KEYS) {
    const tag = (s.tags || []).find((t) => t.toLowerCase().startsWith(key + ':'));
    if (tag) return tag.slice(key.length + 1).trim().toLowerCase();
  }
  // No tag: the first word of the name that is an application ID of the catalog.
  return nameWords(s.name).find((w) => CATALOG_IDS.has(w)) || '';
}

export default async function () {
  const cfg = await loadAppConfig();
  TAG_KEYS = cfg.tagKeys.map((k) => k.toLowerCase());
  CATALOG_IDS = await loadCatalogIds();
  // 1. Page through all SLOs
  const slos = [];
  let pageKey = null;
  do {
    const params = new URLSearchParams(
      pageKey ? { 'page-key': pageKey } : { 'page-size': '500' }
    );
    const r = await fetch(`/platform/slo/v1/slos?${params.toString()}`);
    if (!r.ok) {
      throw new Error(`SLO list read failed: ${r.status} ${await r.text()}`);
    }
    const body = await r.json();
    for (const s of body.slos || []) {
      if (s.name) slos.push({ name: s.name.replace(/[\r\n^]/g, ' '), id: sloAppId(s) || '-' });
    }
    pageKey = body.nextPageKey || null;
  } while (pageKey);

  // 2. Build CSV — one row per SLO name, sorted for deterministic diffs
  slos.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // Two '^'-separated columns (SLO names contain commas).
  const csv = 'slo^appId\n' + slos.map((s) => s.name + '^' + s.id).join('\n') + '\n';

  // 3. Upload as a lookup table (overwrite existing)
  const meta = {
    filePath: '__PATH__',
    displayName: 'SLOs by application ID',
    description: 'One row per SLO name with its application ID (the SLO tag, else the name prefix)',
    lookupField: 'slo',
    parsePattern: "LD:slo '^' LD:appId",
    skippedRecords: 1,
    autoFlatten: true,
    timezone: 'UTC',
    locale: 'en_US',
    overwrite: true,
  };

  const boundary = '----slolookupboundary' + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="request"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="content"; filename="slo"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n` +
    `${csv}\r\n` +
    `--${boundary}--\r\n`;

  const up = await fetch('/platform/storage/resource-store/v1/files/tabular/lookup:upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const upText = await up.text();
  if (!up.ok) {
    throw new Error(`Lookup upload failed: ${up.status} ${upText}`);
  }
  return { slosRead: slos.length };
}
