// ── Customer values, read at run time ─────────────────────────────────────────────────────────────────────────────
// Every DT-SRE APP workflow except "Build /lookups/dtsrepoweredapp/cmdb" is identical for all customers. The few values
// that differ (the application ID tag key, the cloud tag key, the longest ID) are written to
// /lookups/dtsrepoweredapp/config by that workflow from its constants, and read here. Run it first.
// The generated queries contain the placeholders __APPIDKEY__, __CLOUDTAGKEY__ and __IDMAX__; applyAppConfig fills them in.
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
    throw new Error('Cannot read ' + APP_CONFIG_PATH + '. Run the "DT-SRE APP: Build /lookups/dtsrepoweredapp/cmdb" workflow first, which writes it. (' + (e && e.message ? e.message : e) + ')');
  }
  const raw = {};
  for (const r of records) raw[String(r.key)] = String(r.value === undefined || r.value === null ? '' : r.value).trim();
  const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (!ident.test(raw.appIdKey || '')) throw new Error(APP_CONFIG_PATH + ' has no valid appIdKey (found "' + raw.appIdKey + '").');
  const cloudTagKey = raw.cloudTagKey || raw.appIdKey;
  if (!ident.test(cloudTagKey)) throw new Error(APP_CONFIG_PATH + ' has an invalid cloudTagKey "' + cloudTagKey + '".');
  const idMaxLength = Number(raw.idMaxLength);
  if (!Number.isInteger(idMaxLength) || idMaxLength < 1 || idMaxLength > 64) throw new Error(APP_CONFIG_PATH + ' has an invalid idMaxLength "' + raw.idMaxLength + '".');
  return { appIdKey: raw.appIdKey, cloudTagKey, idMaxLength };
}

function applyAppConfig(text, c) {
  return text.split('__APPIDKEY__').join(c.appIdKey).split('__CLOUDTAGKEY__').join(c.cloudTagKey).split('__IDMAX__').join(String(c.idMaxLength));
}
