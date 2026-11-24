// Refreshes the SLO dashboards lookup (appId -> dashboardCount) from dashboard
// documents whose name starts with a 3-letter application ID token and contains "SLO".
export default async function () {
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

  // 2. Keep dashboards starting with a 3-letter token that also contain "SLO"
  //    as a standalone uppercase token (allows SLOs / SLO's, rejects SLOW / OSLO / Slow).
  const tokenRe = /^[A-Za-z]{3}([^A-Za-z]|$)/;
  const sloRe = /(^|[^A-Z])SLO([^A-Z]|$)/;
  const counts = {};
  for (const d of docs) {
    const name = d.name || '';
    if (!sloRe.test(name)) continue;
    if (!tokenRe.test(name)) continue;
    const appId = name.slice(0, 3).toLowerCase();
    counts[appId] = (counts[appId] || 0) + 1;
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
    description: 'Count of dashboards per application whose name starts with a 3-letter application token and contains "SLO"',
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
