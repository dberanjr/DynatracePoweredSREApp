// Refreshes the SLOs lookup (/lookups/dtsrepoweredapp/slo; one row per SLO name) from the Gen3 SLO platform API.
// The scorecard derives application ID from the first 3 characters of the name, unless the settings map an Application ID
// column for this table (ID_COL below is then non-empty): the ID is the SLO's `<APP_ID>:<id>` tag, falling back to the
// name up to its first separator when the SLO has no such tag.
// NOTE: the platform SLO API rejects page-size when page-key is set — first
// page uses page-size, subsequent pages use page-key only (confirmed in getSloDetail.function.ts).
const ID_COL = '__SLO_ID_COL__';
const TAG_KEY = '__APP_ID__'.toLowerCase();
const ID_MAX = __ID_MAX__;

function sloAppId(s) {
  const tag = (s.tags || []).find((t) => t.toLowerCase().startsWith(TAG_KEY + ':'));
  if (tag) return tag.slice(TAG_KEY.length + 1).trim().toLowerCase();
  const m = /^([A-Za-z0-9]+)[^A-Za-z0-9]/.exec(s.name || '');
  return m && m[1].length <= ID_MAX ? m[1].toLowerCase() : '';
}

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
      if (s.name) slos.push({ name: s.name.replace(/[\r\n^]/g, ' '), id: sloAppId(s) || '-' });
    }
    pageKey = body.nextPageKey || null;
  } while (pageKey);

  // 2. Build CSV — one row per SLO name, sorted for deterministic diffs
  slos.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // With an ID column the table has two '^'-separated columns (names contain commas); otherwise it is just the names.
  const csv = ID_COL
    ? '__SLO_COL__^' + ID_COL + '\n' + slos.map((s) => s.name + '^' + s.id).join('\n') + '\n'
    : '__SLO_COL__\n' + slos.map((s) => s.name).join('\n') + '\n';

  // 3. Upload as a lookup table (overwrite existing)
  const meta = {
    filePath: '__PATH__',
    displayName: 'SLOs by application ID',
    description: 'One row per SLO name; the application is derived from the first 3 characters of the name, or from the ID column when there is one',
    lookupField: '__SLO_COL__',
    parsePattern: ID_COL ? "LD:__SLO_COL__ '^' LD:" + ID_COL : 'LD:__SLO_COL__',
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
