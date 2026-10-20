import { queryExecutionClient } from '@dynatrace-sdk/client-query';

// Replaces one of the app-managed lookup tables with the rows sent by the "Lookups" tab.
// The tab owns the whole table (it is the system of record), so this is a full replace,
// not a patch: the UI loads the table once, the user edits it, and Save sends the result.
// That also avoids read-modify-write on the server, where a just-uploaded lookup can lag
// behind a DQL `load` and a quick second edit would silently revert the first.

const DELIM = '^'; // commas are common in names/groups; '^' is stripped from values below.
const MAX_ROWS = 20000; // loose safety ceiling, not a design target
const MAX_VALUE_LENGTH = 200;
// Empty fields break the parse pattern (LD needs >= 1 char, and the optional LD? form proved
// unreliable with several empty fields in a row on wide tables), so empty values are stored as a
// single space and trimmed away again on read.
const EMPTY = ' ';
// Letters, digits, underscore, dash: the app compares AppCIs case-insensitively.
const APPCI_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type Row = Record<string, string>;

interface TableDef {
  path: string;
  backupPath: string;
  displayName: string;
  description: string;
  lookupField: string;
  columns: string[]; // file column order
  required: string[];
  appciColumn: string;
  lowercase: string[]; // columns normalised to lower case (consumers compare them lower-cased)
  keyColumns: string[]; // together unique within the table
}

// Keep in sync with LOOKUP_TABLES in ui/app/pages/lookupTables.ts.
const TABLES: Record<string, TableDef> = {
  cmdb: {
    path: '/lookups/dynatrace/cmdb_appci_owner_mapping',
    backupPath: '/lookups/dynatrace/cmdb_appci_owner_mapping_backup',
    displayName: 'CMDB AppCI owner mapping',
    description: 'One row per AppCI: owner, criticality, status and support group. Maintained from the Lookups tab of the SRE maturity app.',
    lookupField: 'applicationci',
    columns: [
      'applicationci',
      'name',
      'operational_status',
      'business_criticality',
      'owned_by',
      'managed_by',
      'u_maintained_by',
      'support_group',
      'managed_by.u_managing_director',
      'managed_by.u_vp',
      'managed_by.u_director',
    ],
    required: ['applicationci', 'name'],
    appciColumn: 'applicationci',
    lowercase: [],
    keyColumns: ['applicationci'],
  },
  entity_severity: {
    // The refresh-lookups-critical-services workflow loads this exact path.
    path: '/lookups/entity_severity',
    backupPath: '/lookups/entity_severity_backup',
    displayName: 'Entity severity (critical services seed)',
    description: 'Services/endpoints considered critical per AppCI. Seed for the critical services workflow. Maintained from the Lookups tab of the SRE maturity app.',
    lookupField: 'appci',
    columns: ['appci', 'entity_name', 'severity', 'business_impact'],
    required: ['appci', 'entity_name', 'severity'],
    appciColumn: 'appci',
    lowercase: ['appci', 'severity'],
    keyColumns: ['appci', 'entity_name'],
  },
};

const clean = (v: unknown): string =>
  (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '').replace(/[\r\n\t^]/g, ' ').trim().slice(0, MAX_VALUE_LENGTH);

function validate(t: TableDef, input: unknown): Row[] {
  if (!Array.isArray(input) || input.length === 0) {
    // An empty lookup has no columns, which breaks every query that loads it, and
    // would be the result of a bug rather than intent. Refuse.
    throw new Error('Refusing to save: no rows supplied.');
  }
  if (input.length > MAX_ROWS) throw new Error(`Too many rows (${input.length}); limit is ${MAX_ROWS}.`);

  const seen = new Map<string, number>();
  const rows: Row[] = [];
  const errors: string[] = [];
  input.forEach((raw, i) => {
    const row: Row = {};
    for (const c of t.columns) {
      const v = clean((raw as Record<string, unknown>)?.[c]);
      row[c] = t.lowercase.includes(c) ? v.toLowerCase() : v;
    }
    const line = i + 1;
    for (const c of t.required) if (!row[c]) errors.push(`Row ${line}: ${c} is required`);
    if (row[t.appciColumn] && !APPCI_PATTERN.test(row[t.appciColumn])) {
      errors.push(`Row ${line}: ${t.appciColumn} "${row[t.appciColumn]}" may only contain letters, digits, _ and -`);
    }
    const key = t.keyColumns.map((c) => row[c].toLowerCase()).join('|');
    if (t.keyColumns.every((c) => row[c])) {
      if (seen.has(key)) errors.push(`Row ${line}: duplicate ${t.keyColumns.join(' + ')} "${t.keyColumns.map((c) => row[c]).join(' / ')}" (also row ${seen.get(key)})`);
      else seen.set(key, line);
    }
    rows.push(row);
  });
  if (errors.length) throw new Error(errors.slice(0, 10).join('; ') + (errors.length > 10 ? `; +${errors.length - 10} more` : ''));

  const sortKey = (r: Row) => t.keyColumns.map((c) => r[c].toLowerCase()).join('|');
  rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return rows;
}

const toContent = (t: TableDef, rows: Row[]) =>
  t.columns.join(DELIM) + '\n' + rows.map((r) => t.columns.map((c) => r[c] || EMPTY).join(DELIM)).join('\n') + '\n';

async function upload(t: TableDef, filePath: string, displayName: string, description: string, rows: Row[]) {
  const meta = {
    filePath,
    displayName,
    description,
    lookupField: t.lookupField,
    parsePattern: t.columns.map((c) => `LD:${c}`).join(` '${DELIM}' `),
    skippedRecords: 1,
    autoFlatten: true,
    timezone: 'UTC',
    locale: 'en_US',
    overwrite: true,
  };
  const boundary = '----sreapplookup' + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="request"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="content"; filename="${filePath.split('/').pop()}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n` +
    `${toContent(t, rows)}\r\n` +
    `--${boundary}--\r\n`;
  const resp = await fetch('/platform/storage/resource-store/v1/files/tabular/lookup:upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (resp.status === 401 || resp.status === 403) {
    // Platform IAM denied the write: the signed-in user lacks storage:files:write. Nothing was changed
    // (the backup is written first, so this fires before the live table is touched).
    throw new Error(
      `You don't have permission to write lookup tables (storage:files:write). Ask an administrator to add you to the group with the lookup table editor policy. Nothing was changed.`
    );
  }
  if (!resp.ok) throw new Error(`Lookup upload to ${filePath} failed: ${resp.status} ${await resp.text()}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : JSON.stringify(e));

// The current table, to keep one generation back. Null only when it genuinely doesn't exist yet (first
// save) or is empty. Any other failure throws: we never overwrite a table we couldn't back up.
// No `fields` clause: a column that is empty in every row simply isn't in the table.
async function readCurrent(t: TableDef): Promise<Row[] | null> {
  let res: Awaited<ReturnType<typeof queryExecutionClient.queryExecute>>;
  try {
    res = await queryExecutionClient.queryExecute({
      body: { query: `load "${t.path}" | limit ${MAX_ROWS}`, maxResultRecords: MAX_ROWS },
    });
  } catch (e) {
    if (/UNKNOWN_TABULAR_FILE|doesn't exist/i.test(errText(e))) return null; // first save: nothing to back up
    throw new Error(`Could not read the current ${t.path} to back it up (${errText(e)}). Nothing was changed.`);
  }

  // A query that doesn't finish quickly returns a requestToken instead of the result: poll for it.
  let records: Array<Record<string, unknown> | null> | undefined = res.result?.records;
  if (!res.result && res.requestToken) {
    for (let i = 0; i < 60; i++) {
      const p = await queryExecutionClient.queryPoll({ requestToken: res.requestToken });
      if (p.state === 'SUCCEEDED') {
        records = p.result?.records;
        break;
      }
      if (p.state !== 'NOT_STARTED' && p.state !== 'RUNNING') {
        throw new Error(`Reading the current ${t.path} ended in state ${p.state}. Nothing was changed.`);
      }
      await sleep(500);
    }
    if (!records) throw new Error(`Timed out reading the current ${t.path}. Nothing was changed.`);
  }

  if (!records?.length) return null;
  return records.map((rec) => {
    const row: Row = {};
    for (const c of t.columns) row[c] = clean(rec?.[c]);
    return row;
  });
}

export default async function (input: unknown = undefined) {
  // App-invoked calls pass the payload directly; `dtctl exec function` wraps it as { payload }.
  const raw = (input && typeof input === 'object' && 'payload' in (input as Record<string, unknown>)
    ? (input as { payload?: unknown }).payload
    : input) as { table?: string; rows?: unknown } | undefined;

  // Only known tables: the path is never taken from the caller, so this function can't be
  // used to overwrite arbitrary lookups.
  const t = raw?.table ? TABLES[raw.table] : undefined;
  if (!t) throw new Error(`Unknown table "${String(raw?.table)}". Expected one of: ${Object.keys(TABLES).join(', ')}.`);

  const rows = validate(t, raw?.rows);

  const previous = await readCurrent(t);
  let backedUp = 0;
  if (previous) {
    // If the backup can't be written we stop: never overwrite the only copy.
    await upload(t, t.backupPath, `${t.displayName} (backup)`, 'Previous version, written automatically before each save from the app', previous);
    backedUp = previous.length;
  }

  await upload(t, t.path, t.displayName, t.description, rows);
  return { saved: rows.length, backedUp, path: t.path, backupPath: t.backupPath };
}
