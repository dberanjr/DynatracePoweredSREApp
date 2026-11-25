// Refreshes the SLO dashboards lookup (appId -> dashboardCount) from dashboard
// documents whose name contains "SLO" as a standalone uppercase token and names an application of the catalog by its ID, as a word.
import { queryExecutionClient } from '@dynatrace-sdk/client-query';

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

export default async function () {
  const catalogIds = await loadCatalogIds();
  // 1. Page through all dashboard documents
  const docs = [];
  let pageKey = null;
  do {
    const params = new URLSearchParams({ filter: "type=='dashboard'", 'page-size': '500' });
    if (pageKey) params.set('page-key', pageKey);
    const r = await fetch(`/platform/document/v1/documents?${params.toString()}`);
    if (!r.ok) {
      throw new Error(`Documents read failed: ${r.status} ${await r.text()}`);
    }
    const body = await r.json();
    for (const d of body.documents || []) docs.push(d);
    pageKey = body.nextPageKey || null;
  } while (pageKey);

  // 2. Keep dashboards that contain "SLO" as a standalone uppercase token (allows SLOs / SLO's, rejects SLOW / OSLO / Slow)
  //    and count each catalog application whose ID is a word of the name.
  const sloRe = /(^|[^A-Z])SLO([^A-Z]|$)/;
  const counts = {};
  for (const d of docs) {
    const name = d.name || '';
    if (!sloRe.test(name)) continue;
    for (const appId of new Set(nameWords(name))) {
      if (catalogIds.has(appId)) counts[appId] = (counts[appId] || 0) + 1;
    }
  }

  // 3. Build CSV (header skipped on upload via skippedRecords:1)
  const appIds = Object.keys(counts).sort();
  // A 0-row lookup exposes no columns, so every consumer's `lookup`/`fieldsAdd appId` fails with
  // FIELD_DOES_NOT_EXIST. When nothing matches, keep the schema alive with a sentinel row whose
  // appId can never equal a real application ID (it never joins to a scorecard row).
  const rows = appIds.map((a) => `${a},${counts[a]}`);
  if (rows.length === 0) rows.push('__none__,0');
  const csv = 'appId,dashboardCount\n' + rows.join('\n') + '\n';

  // 4. Upload as a lookup table (overwrite existing)
  const meta = {
    filePath: '__PATH__',
    displayName: 'SLO dashboards by application ID',
    description: 'Count of dashboards per application whose name contains "SLO" and the application ID as a word',
    lookupField: 'appId',
    parsePattern: "LD:appId ',' LD:dashboardCount",
    skippedRecords: 1,
    autoFlatten: true,
    timezone: 'UTC',
    locale: 'en_US',
    overwrite: true,
  };

  const boundary = '----slodashboardsboundary' + Date.now();
  const upBody =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="request"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="content"; filename="slo-dashboards"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n` +
    `${csv}\r\n` +
    `--${boundary}--\r\n`;

  const up = await fetch('/platform/storage/resource-store/v1/files/tabular/lookup:upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: upBody,
  });
  const upText = await up.text();
  if (!up.ok) {
    throw new Error(`Lookup upload failed: ${up.status} ${upText}`);
  }
  return { dashboardsScanned: docs.length, appIdRows: appIds.length, counts };
}
