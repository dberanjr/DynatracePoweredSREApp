// ── Customer settings, read at run time ───────────────────────────────────────────────────────────────────────────────
// Every DT-SRE APP workflow is identical for all customers. What differs (the application ID tag keys, the cloud tag key,
// the longest ID and, for the catalog workflow, the source table and its column mapping) is read from
// /lookups/dtsrepoweredapp/config, which the app's Settings page writes. Until Settings have been saved, the workflows stop
// with an error that says so.
// The generated queries contain markers and placeholders that applyAppConfig fills in: __TAGHIT__(<tags array>) for
// "this entity carries one of the tag keys", and __APPIDKEY__ (the first tag key), __CLOUDTAGKEY__ and __IDMAX__.
const APP_CONFIG_PATH = '/lookups/dtsrepoweredapp/config';

async function loadAppConfig() {
  let records;
  try {
    const started = await queryExecutionClient.queryExecute({
      body: { query: 'load "' + APP_CONFIG_PATH + '"', maxResultRecords: 100, requestTimeoutMilliseconds: 30000 },
    });
    records = started.result ? started.result.records || [] : null;
    for (let i = 0; records === null && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const p = await queryExecutionClient.queryPoll({ requestToken: started.requestToken });
      if (p.state === 'SUCCEEDED') records = (p.result && p.result.records) || [];
      else if (p.state !== 'NOT_STARTED' && p.state !== 'RUNNING') throw new Error('query ended in state ' + p.state);
    }
    if (records === null) throw new Error('query timed out');
  } catch (e) {
    throw new Error('Cannot read ' + APP_CONFIG_PATH + '. Open the SRE maturity app, go to Settings and Save; that creates it. (' + (e && e.message ? e.message : e) + ')');
  }
  const raw = {};
  for (const r of records) raw[String(r.key)] = String(r.value === undefined || r.value === null ? '' : r.value).trim();
  const text = (k) => (raw[k] && raw[k] !== '-' ? raw[k] : '');
  const keyOk = /^[A-Za-z_][A-Za-z0-9_./-]*$/;
  const tagKeys = Array.from(new Set((text('tagKeys') || text('appIdKey')).split(',').map((k) => k.trim()).filter(Boolean)));
  if (!tagKeys.length || !tagKeys.every((k) => keyOk.test(k))) throw new Error(APP_CONFIG_PATH + ' has no valid tagKeys (found "' + text('tagKeys') + '"). Fix them in the app under Settings.');
  const cloudTagKey = text('cloudTagKey') || tagKeys[0];
  if (!keyOk.test(cloudTagKey)) throw new Error(APP_CONFIG_PATH + ' has an invalid cloudTagKey "' + cloudTagKey + '".');
  const idMaxLength = Number(raw.idMaxLength);
  if (!Number.isInteger(idMaxLength) || idMaxLength < 1 || idMaxLength > 64) throw new Error(APP_CONFIG_PATH + ' has an invalid idMaxLength "' + raw.idMaxLength + '".');
  return { tagKeys, appIdKey: tagKeys[0], cloudTagKey, idMaxLength, raw, text };
}

function applyAppConfig(text, c) {
  const hit = (arr) => {
    const one = (k) => 'matchesPhrase(' + arr + ', "*' + k + '*")';
    return c.tagKeys.length === 1 ? one(c.tagKeys[0]) : '(' + c.tagKeys.map(one).join(' or ') + ')';
  };
  return text
    .replace(/__TAGHIT__\(([^()]*)\)/g, (m, arr) => hit(arr))
    .split('__APPIDKEY__').join(c.appIdKey)
    .split('__CLOUDTAGKEY__').join(c.cloudTagKey)
    .split('__IDMAX__').join(String(c.idMaxLength));
}