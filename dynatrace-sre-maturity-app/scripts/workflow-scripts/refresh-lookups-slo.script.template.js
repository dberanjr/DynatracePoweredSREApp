// Refreshes /lookups/slo (one row per SLO name) from the Gen3 SLO platform API.
// The scorecard derives AppCI via: lower(substring(slo, from:0, to:3)).
// NOTE: the platform SLO API rejects page-size when page-key is set — first
// page uses page-size, subsequent pages use page-key only (confirmed in getSloDetail.function.ts).
export default async function () {
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
      if (s.name) slos.push(s.name);
    }
    pageKey = body.nextPageKey || null;
  } while (pageKey);

  // 2. Build CSV — one row per SLO name, sorted for deterministic diffs
  slos.sort();
  const csv = '__SLO_COL__\n' + slos.join('\n') + '\n';

  // 3. Upload as a lookup table (overwrite existing)
  const meta = {
    filePath: '__PATH__',
    displayName: 'SLOs by AppCI',
    description: 'One row per SLO name; AppCI is derived from the first 3 characters of the name',
    lookupField: '__SLO_COL__',
    parsePattern: 'LD:__SLO_COL__',
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
