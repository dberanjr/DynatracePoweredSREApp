import { queryExecutionClient } from '@dynatrace-sdk/client-query';

__RUNTIME_CONFIG__

// GENERATED PARTS: APP_ID_FROM_SERVICE_TAGS and LOAD_CMDB are produced by scripts/generate-snapshot-workflow.mjs from
// ui/app/queries/maturityQueries.ts, so an application ID is resolved here exactly as in the app. Edit that module and run
// `npm run generate:workflows`; the template for this script is scripts/workflow-scripts/seed-entity-severity.script.template.js.
//
// Builds a STARTER list of critical services, for a customer that has not supplied one yet: for each top-tier application
// (cmdb business_criticality == "Yes"), its services that are
//   - called by a real-user application (web, mobile or custom)  -> severity "high"
//   - web entry points that no other service calls               -> severity "medium"
// and writes them to /lookups/dtsrepoweredapp/entity_severity, which the "critical_services" workflow resolves to entity IDs.
// It is a guess from topology, not knowledge of the business: review it and replace it with the customer's real list.
//
// SAFE TO RE-RUN: the table is only (re)written when it is missing, empty, holds just the "__none__" placeholder, or holds
// nothing but rows this workflow wrote earlier (their business_impact starts with "user-facing:"). A table that has any
// other row is the customer's own list and is left untouched.

const DST          = '__SEED_PATH__';
const MAX_PER_APP  = 10;        // services kept per application, most real-user-called first
const D            = '^';
const WINDOW       = 'now()-7d';
const IMPACT_RUM   = 'user-facing: called by a real-user application';
const IMPACT_ENTRY = 'user-facing: web entry point (no calling service)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s === null || s === undefined) ? '' : String(s).replace(/[\r\n\t^]/g, ' ').trim();

let CFG = null;   // run-time config, loaded in main()

async function runDql(rawQuery, maxResultRecords) {
  const query = CFG ? applyAppConfig(rawQuery, CFG) : rawQuery;
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

__APP_ID_RESOLVER__

const SEED_QUERY = [
  'fetch dt.entity.service, from:' + WINDOW,
  '| fieldsAdd byApp = coalesce(called_by[dt.entity.application], called_by[dt.entity.mobile_application], called_by[dt.entity.custom_application])',
  '| fieldsAdd calledByService = called_by[dt.entity.service]',
  '| filter serviceType == "WEB_REQUEST_SERVICE" and (isNotNull(byApp) or isNull(calledByService))',
  APP_ID_FROM_SERVICE_TAGS,
  '| expand appId',
  '| filter stringLength(appId) <= __IDMAX__',
  '| lookup [',
  '    ' + LOAD_CMDB,
  '    | filter business_criticality == "Yes"',
  '    | fields appId, name',
  '  ], sourceField:appId, lookupField:appId, fields:{appName = name}',
  '| filter isNotNull(appName)',
  '| summarize userFacing = countIf(isNotNull(byApp)), by:{appId, entity_name = entity.name}',
  '| sort appId asc, userFacing desc',
].join('\n');

// null when the table does not exist; otherwise its rows.
async function readExisting() {
  try {
    return await runDql('load "' + DST + '"', 10000);
  } catch (e) {
    return null;
  }
}

export default async function () {
  CFG = await loadAppConfig();

  // 1. do not overwrite a list the customer maintains
  const existing = await readExisting();
  if (existing) {
    const custom = existing.filter((r) => {
      const id = String(r.appId === undefined || r.appId === null ? '' : r.appId).trim();
      if (id === '' || id === '__none__') return false;
      return !String(r.business_impact || '').startsWith('user-facing:');
    });
    if (custom.length) {
      return { skipped: true, reason: DST + ' already holds ' + custom.length + ' row(s) that were not written by this workflow; it is left as it is.' };
    }
  }

  // 2. derive the starter list
  const recs = await runDql(SEED_QUERY, 20000);
  const perApp = new Map();
  for (const r of recs) {
    const appId = clean(r.appId).toLowerCase();
    const name = clean(r.entity_name);
    if (!appId || !name) continue;
    const list = perApp.get(appId) || [];
    if (list.length >= MAX_PER_APP) continue;
    list.push({ appId, name, rum: Number(r.userFacing) > 0 });
    perApp.set(appId, list);
  }
  const seen = new Set();
  const lines = [];
  for (const list of perApp.values()) {
    for (const s of list) {
      const key = s.appId + '|' + s.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push([s.appId, s.name, s.rum ? 'high' : 'medium', s.rum ? IMPACT_RUM : IMPACT_ENTRY, key].join(D));
    }
  }
  if (!lines.length) {
    throw new Error('No user-facing services found for any top-tier application (cmdb business_criticality == "Yes"). Nothing written. Check that the cmdb table has top-tier rows and that services carry the application ID tag.');
  }

  // 3. publish: row_key is the lookup field because Grail keeps one row per lookup value (see the runbook)
  const content = ['appId', 'entity_name', 'severity', 'business_impact', 'row_key'].join(D) + '\n' + lines.join('\n') + '\n';
  const meta = {
    filePath: DST,
    displayName: 'Entity severity (starter seed)',
    description: 'STARTER list of critical services derived from topology: services of top-tier applications that real-user applications call, or that are web entry points. Replace with the real list.',
    lookupField: 'row_key',
    parsePattern: "LD:appId '^' LD:entity_name '^' LD:severity '^' LD:business_impact '^' LD:row_key",
    skippedRecords: 1,
    autoFlatten: true,
    timezone: 'UTC',
    locale: 'en_US',
    overwrite: true,
  };
  const boundary = '----entityseverity' + Date.now();
  const body =
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="request"\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(meta) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="content"; filename="entity_severity"\r\n' +
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
    applications: perApp.size,
    servicesWritten: lines.length,
    userFacingCalledByRum: lines.filter((l) => l.includes(IMPACT_RUM)).length,
    webEntryPoints: lines.filter((l) => l.includes(IMPACT_ENTRY)).length,
    next: 'Run "DT-SRE APP: Refresh /lookups/dtsrepoweredapp/critical_services" to resolve these to entity IDs.',
  };
}
