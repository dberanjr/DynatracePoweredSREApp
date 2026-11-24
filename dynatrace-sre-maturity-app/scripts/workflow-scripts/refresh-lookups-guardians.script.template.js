import { settingsObjectsClient } from '@dynatrace-sdk/client-classic-environment-v2';
import { queryExecutionClient } from '@dynatrace-sdk/client-query';

__RUNTIME_CONFIG__

// Refreshes the guardians lookup table (appId -> guardianCount) from the
// Site Reliability Guardian settings objects, matching on the application ID tag (the key comes from the run-time config; "appci" is accepted as a shorthand).
export default async function () {
  const cfg = await loadAppConfig();
  const TAG_KEYS = [cfg.appIdKey, cfg.cloudTagKey, 'appci'].map((k) => k.toLowerCase());
  // 1. Read all guardian settings objects
  const res = await settingsObjectsClient.getSettingsObjects({
    schemaIds: 'app:dynatrace.site.reliability.guardian:guardians',
    fields: 'value',
    pageSize: 500,
  });
  const items = res.items || [];

  // 2. Aggregate appId -> distinct guardian count (case-insensitive tag key + value)
  const counts = {};
  for (const obj of items) {
    const tags = (obj.value && obj.value.tags) || [];
    const appIds = new Set();
    for (const t of tags) {
      const i = String(t).indexOf(':');
      if (i > 0) {
        const k = String(t).slice(0, i).trim().toLowerCase();
        const v = String(t).slice(i + 1).trim().toLowerCase();
        if (TAG_KEYS.includes(k) && v) appIds.add(v);
      }
    }
    for (const a of appIds) counts[a] = (counts[a] || 0) + 1;
  }

  // 3. Build CSV (header is skipped on upload via skippedRecords:1)
  const appIds = Object.keys(counts).sort();
  // A 0-row lookup exposes no columns, so every consumer's `lookup`/`fieldsAdd appId` fails with
  // FIELD_DOES_NOT_EXIST. When nothing matches, keep the schema alive with a sentinel row whose
  // appId can never equal a real application ID (it never joins to a scorecard row).
  const rows = appIds.map((a) => `${a},${counts[a]}`);
  if (rows.length === 0) rows.push('__none__,0');
  const csv = 'appId,guardianCount\n' + rows.join('\n') + '\n';

  // 4. Upload as a lookup table (overwrite existing)
  const meta = {
    filePath: '__PATH__',
    displayName: 'Guardians by application ID',
    description: 'Count of Site Reliability Guardians per application ID, refreshed from the guardian Settings API',
    lookupField: 'appId',
    parsePattern: "LD:appId ',' LD:guardianCount",
    skippedRecords: 1,
    autoFlatten: true,
    timezone: 'UTC',
    locale: 'en_US',
    overwrite: true,
  };

  const boundary = '----guardianlookupboundary' + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="request"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="content"; filename="guardians"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n` +
    `${csv}\r\n` +
    `--${boundary}--\r\n`;

  const resp = await fetch('/platform/storage/resource-store/v1/files/tabular/lookup:upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Lookup upload failed: ${resp.status} ${text}`);
  }
  return { guardiansRead: items.length, appIdRows: appIds.length, counts };
}
