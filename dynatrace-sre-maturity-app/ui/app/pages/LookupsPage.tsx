import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { functions } from "@dynatrace-sdk/app-utils";
import { LOOKUP_TABLES, LookupTableConfig } from "./lookupTables";
import {
  INK,
  RAIL,
  ACCENT_SOLID,
  cardStyle,
  noticeStyle,
  subTabStyle,
  tableHeadCellStyle,
  tableHeadRowStyle,
  tableRowBorder,
} from "../components/redesignStyles";

const APPCI_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type Row = Record<string, string>;
type ImportMode = "merge" | "replace";

const emptyRow = (cfg: LookupTableConfig): Row => Object.fromEntries(cfg.columns.map((c) => [c.key, ""]));
// Lookup values are scalars; anything else (object/array) is not data we wrote, so treat as empty.
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v).trim() : "");
const fromRecord = (cfg: LookupTableConfig, rec: Record<string, unknown>): Row => {
  const row = emptyRow(cfg);
  for (const c of cfg.columns) row[c.key] = str(rec[c.key]);
  return row;
};
const serialize = (rows: Row[]) => JSON.stringify(rows);
const rowKey = (cfg: LookupTableConfig, row: Row) => cfg.keyColumns.map((k) => row[k].trim().toLowerCase()).join("|");
const sortRows = (cfg: LookupTableConfig, rows: Row[]) => [...rows].sort((a, b) => rowKey(cfg, a).localeCompare(rowKey(cfg, b)));
// Mirrors the server: trim, and lower-case the columns the table says to.
const normalise = (cfg: LookupTableConfig, row: Row): Row =>
  Object.fromEntries(
    cfg.columns.map((c) => [c.key, cfg.lowercase.includes(c.key) ? row[c.key].trim().toLowerCase() : row[c.key].trim()])
  );

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--line, #E3E6EB)",
  background: "var(--card, transparent)",
  color: INK.text,
};

const buttonStyle = (kind: "primary" | "danger" | "plain", disabled = false): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: 6,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
  border: kind === "plain" ? "1px solid var(--line, #E3E6EB)" : "none",
  background: kind === "primary" ? ACCENT_SOLID : kind === "danger" ? RAIL.fail : "transparent",
  color: kind === "plain" ? INK.text : "#fff",
});

// Returns an error message, or null when the row is acceptable. `others` excludes the row being edited.
function validateRow(cfg: LookupTableConfig, row: Row, others: Row[]): string | null {
  for (const c of cfg.columns) if (c.required && !row[c.key].trim()) return `${c.label.replace(/ \(.*\)$/, "")} is required.`;
  if (!APPCI_PATTERN.test(row[cfg.appciKey].trim())) return "AppCI may only contain letters, digits, _ and -.";
  const key = rowKey(cfg, row);
  if (others.some((r) => rowKey(cfg, r) === key)) return `A row for ${cfg.keyLabel} "${cfg.keyColumns.map((k) => row[k].trim()).join(" / ")}" already exists.`;
  return null;
}

// Minimal RFC 4180 parser: quoted fields, "" escapes, commas/newlines inside quotes, CRLF, BOM.
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) out.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) out.push(row);
  return out;
}

// Turns CSV text into rows, or a list of problems. All-or-nothing: a half-applied file is
// harder to reason about than a rejected one.
function rowsFromCsv(cfg: LookupTableConfig, text: string): { rows: Row[]; errors: string[]; ignoredColumns: string[] } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: ["The file needs a header row and at least one data row."], ignoredColumns: [] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const keyByHeader = new Map(cfg.columns.map((c) => [c.key.toLowerCase(), c.key]));
  const colIndex = header.map((h) => keyByHeader.get(h));
  const ignoredColumns = table[0].filter((_, i) => !colIndex[i]).map((h) => h.trim());
  const missing = cfg.columns.filter((c) => c.required && !colIndex.includes(c.key)).map((c) => c.key);
  if (missing.length) return { rows: [], errors: [`Missing required column(s): ${missing.join(", ")}.`], ignoredColumns };

  const rows: Row[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((cells, i) => {
    const row = emptyRow(cfg);
    colIndex.forEach((key, ci) => {
      if (key) row[key] = str(cells[ci]).replace(/[\r\n\t^]/g, " ");
    });
    const normalised = normalise(cfg, row);
    const err = validateRow(cfg, normalised, rows);
    if (err) errors.push(`Line ${i + 2}: ${err}`);
    rows.push(normalised);
  });
  return { rows, errors, ignoredColumns };
}

const LookupEditor = ({ cfg }: { cfg: LookupTableConfig }) => {
  // The table is loaded once into `rows` and edited locally; Save replaces the whole
  // lookup. After a save we deliberately do NOT re-sync from DQL: a freshly uploaded
  // lookup can lag behind `load`, which would make the screen show the old table.
  const dql = useDql({ query: `load "${cfg.path}" | limit 20000` });
  const [rows, setRows] = useState<Row[]>([]);
  const [baseline, setBaseline] = useState<string>(serialize([]));
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current || dql.isLoading) return;
    if (dql.data?.records) {
      const loaded = sortRows(cfg, dql.data.records.map((r) => fromRecord(cfg, r as Record<string, unknown>)));
      setRows(loaded);
      setBaseline(serialize(loaded));
      initialised.current = true;
    } else if (dql.error) {
      // Most likely the lookup doesn't exist yet: start empty, first Save creates it.
      initialised.current = true;
    }
  }, [cfg, dql.data, dql.error, dql.isLoading]);

  const [search, setSearch] = useState("");
  // editor.index: index into `rows` (null = adding). editor === null means the form is closed.
  const [editor, setEditor] = useState<{ index: number | null; draft: Row } | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importNote, setImportNote] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = serialize(rows) !== baseline;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const indexed = rows.map((row, index) => ({ row, index }));
    if (!q) return indexed;
    return indexed.filter(({ row }) => cfg.columns.some((c) => row[c.key].toLowerCase().includes(q)));
  }, [cfg, rows, search]);

  const openEditor = (index: number | null) => {
    setEditorError(null);
    setSaveResult(null);
    setEditor({ index, draft: index === null ? emptyRow(cfg) : { ...rows[index] } });
  };

  const applyEditor = () => {
    if (!editor) return;
    const draft = normalise(cfg, editor.draft);
    const err = validateRow(cfg, draft, rows.filter((_, i) => i !== editor.index));
    if (err) {
      setEditorError(err);
      return;
    }
    const next = editor.index === null ? [...rows, draft] : rows.map((r, i) => (i === editor.index ? draft : r));
    setRows(sortRows(cfg, next));
    setEditor(null);
    setConfirmSave(false);
  };

  const deleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    setConfirmSave(false);
    setSaveResult(null);
  };

  const discard = () => {
    setRows(JSON.parse(baseline) as Row[]);
    setImportNote(null);
    setEditor(null);
    setConfirmSave(false);
    setSaveResult(null);
  };

  const importFile = async (file: File) => {
    setSaveResult(null);
    setEditor(null);
    setConfirmSave(false);
    try {
      const { rows: incoming, errors, ignoredColumns } = rowsFromCsv(cfg, await file.text());
      if (errors.length) {
        setImportNote({
          ok: false,
          lines: [`Nothing imported from ${file.name}:`, ...errors.slice(0, 10), ...(errors.length > 10 ? [`…and ${errors.length - 10} more`] : [])],
        });
        return;
      }
      let added = 0;
      let updated = 0;
      let next: Row[];
      if (importMode === "replace") {
        next = incoming;
        added = incoming.length;
      } else {
        const byKey = new Map(rows.map((r) => [rowKey(cfg, r), r]));
        for (const r of incoming) {
          if (byKey.has(rowKey(cfg, r))) updated++;
          else added++;
          byKey.set(rowKey(cfg, r), r);
        }
        next = [...byKey.values()];
      }
      setRows(sortRows(cfg, next));
      setImportNote({
        ok: true,
        lines: [
          importMode === "replace"
            ? `Staged ${added} rows from ${file.name}, replacing the ${rows.length} currently shown.`
            : `Staged ${added} new and ${updated} updated rows from ${file.name}.`,
          ...(ignoredColumns.length ? [`Ignored unknown column(s): ${ignoredColumns.join(", ")}.`] : []),
          "Review the table, then press Save to apply.",
        ],
      });
    } catch (e) {
      setImportNote({ ok: false, lines: [e instanceof Error ? e.message : String(e)] });
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await functions.call("saveLookup", { data: { table: cfg.id, rows } });
      const body = (await res.json()) as { saved: number; backedUp: number };
      setBaseline(serialize(rows));
      setConfirmSave(false);
      setSaveResult({
        ok: true,
        message: `Saved ${body.saved} rows to ${cfg.path}.${body.backedUp ? ` Previous version (${body.backedUp} rows) kept in ${cfg.backupPath}.` : ""} Other tabs may take a short while to show the change.`,
      });
    } catch (e) {
      setSaveResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const showLoading = dql.isLoading && !initialised.current;
  const missingTable = !!dql.error && rows.length === 0;
  // A denied read looks like a missing table to `useDql`; tell the two apart so people aren't invited to
  // "create" a table they simply can't see.
  const readDenied = missingTable && /permission|forbidden|not authorized|unauthori[sz]ed|\b40[13]\b|files:read/i.test(dql.error?.message ?? "");
  const banner = (ok: boolean): React.CSSProperties => ({ ...noticeStyle(ok ? "pass" : "fail"), marginBottom: 12 });

  return (
    <div>
      <Paragraph style={{ margin: "0 0 12px", fontSize: 13, color: INK.muted }}>
        {cfg.description} Stored in <code>{cfg.path}</code>. Changes stay on this page until you press Save; Save replaces the shared table for everyone.
      </Paragraph>

      {readDenied && (
        <div style={banner(false)}>
          You don't have permission to read lookup tables ({dql.error?.message}). Access to this tab requires the Grail lookup table
          permissions (storage:files:read to view, storage:files:write to edit). Ask an administrator for the lookup table policy.
        </div>
      )}
      {missingTable && !readDenied && (
        <div style={{ ...noticeStyle("neutral"), marginBottom: 12 }}>
          The lookup table could not be loaded ({dql.error?.message ?? "unknown error"}). If it doesn't exist yet, add rows or import a CSV
          below and Save to create it.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          aria-label="Search rows"
          placeholder="Search any column…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 280 }}
        />
        <button type="button" style={buttonStyle("primary")} onClick={() => openEditor(null)}>
          + Add row
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
        <button type="button" style={buttonStyle("plain")} onClick={() => fileInput.current?.click()}>
          Import CSV…
        </button>
        <select aria-label="Import mode" value={importMode} onChange={(e) => setImportMode(e.target.value as ImportMode)} style={{ ...inputStyle, width: "auto" }}>
          <option value="merge">Add / update by {cfg.keyLabel}</option>
          <option value="replace">Replace all rows</option>
        </select>
        <span style={{ fontSize: 12, color: INK.muted }}>
          {visible.length === rows.length ? `${rows.length} rows` : `${visible.length} of ${rows.length}`}
        </span>
        <div style={{ flex: 1 }} />
        {dirty && (
          <>
            <span style={{ fontSize: 12, fontWeight: 600, color: INK.warn }}>Unsaved changes</span>
            <button type="button" style={buttonStyle("plain", saving)} disabled={saving} onClick={discard}>
              Discard
            </button>
            {!confirmSave ? (
              <button type="button" style={buttonStyle("primary", rows.length === 0)} disabled={rows.length === 0} onClick={() => setConfirmSave(true)}>
                Save…
              </button>
            ) : (
              <>
                <span style={{ fontSize: 12 }}>Replace the shared lookup with these {rows.length} rows?</span>
                <button type="button" style={buttonStyle("danger", saving)} disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Confirm save"}
                </button>
                <button type="button" style={buttonStyle("plain", saving)} disabled={saving} onClick={() => setConfirmSave(false)}>
                  Cancel
                </button>
              </>
            )}
          </>
        )}
      </div>

      {importNote && (
        <div role="status" style={banner(importNote.ok)}>
          {importNote.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}

      {saveResult && (
        <div role="status" style={banner(saveResult.ok)}>
          {saveResult.message}
        </div>
      )}

      {editor && (
        <div style={{ ...cardStyle, padding: 14, marginBottom: 14, background: "var(--panel, #F7F8FA)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {editor.index === null ? "Add row" : `Edit ${cfg.keyColumns.map((k) => rows[editor.index as number][k]).join(" / ")}`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {cfg.columns.map((c) => (
              <label key={c.key} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 600 }}>
                {c.label}
                {c.required ? " *" : ""}
                <input
                  style={inputStyle}
                  value={editor.draft[c.key]}
                  maxLength={200}
                  onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, [c.key]: e.target.value } })}
                />
              </label>
            ))}
          </div>
          {editorError && <div style={{ marginTop: 10, fontSize: 12, color: INK.fail }}>{editorError}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" style={buttonStyle("primary")} onClick={applyEditor}>
              {editor.index === null ? "Add" : "Apply"}
            </button>
            <button type="button" style={buttonStyle("plain")} onClick={() => setEditor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showLoading ? (
        <Paragraph>Loading…</Paragraph>
      ) : (
        <div style={{ ...cardStyle, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: INK.text }}>
            <thead>
              <tr style={tableHeadRowStyle}>
                <th style={tableHeadCellStyle} />
                {cfg.columns.map((c) => (
                  <th key={c.key} style={tableHeadCellStyle}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={cfg.columns.length + 1} style={{ padding: 16, textAlign: "center", color: INK.muted }}>
                    {rows.length === 0 ? "No rows yet." : "No rows match the search."}
                  </td>
                </tr>
              )}
              {visible.map(({ row, index }) => (
                <tr key={rowKey(cfg, row)} style={{ borderTop: tableRowBorder }}>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    <button type="button" style={{ ...buttonStyle("plain"), padding: "2px 8px", marginRight: 6 }} onClick={() => openEditor(index)}>
                      Edit
                    </button>
                    <button type="button" style={{ ...buttonStyle("plain"), padding: "2px 8px", color: INK.fail }} onClick={() => deleteRow(index)}>
                      Delete
                    </button>
                  </td>
                  {cfg.columns.map((c) => (
                    <td key={c.key} style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                      {row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const LookupsPage = () => {
  const [activeId, setActiveId] = useState<LookupTableConfig["id"]>(LOOKUP_TABLES[0].id);
  const active = LOOKUP_TABLES.find((t) => t.id === activeId) ?? LOOKUP_TABLES[0];

  return (
    <Flex flexDirection="column" gap={0} padding={16}>
      <div style={{ marginBottom: 12 }}>
        <Heading level={3} style={{ margin: "0 0 4px" }}>{active.title}</Heading>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--line, #E3E6EB)" }}>
        {LOOKUP_TABLES.map((t) => {
          const isActive = t.id === activeId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              style={subTabStyle(isActive)}
            >
              {t.tabLabel}
            </button>
          );
        })}
      </div>

      {/* Every editor stays mounted (hidden when inactive) so unsaved edits survive switching tabs. */}
      {LOOKUP_TABLES.map((t) => (
        <div key={t.id} style={{ display: t.id === activeId ? "block" : "none" }}>
          <LookupEditor cfg={t} />
        </div>
      ))}
    </Flex>
  );
};
