// CSV reading and writing for the Lookups tab. No imports on purpose, so it can be exercised from plain Node
// (scripts/check-lookup-csv.mjs) without a browser or a bundler.
//
// Export and import are a pair: a file written by `toCsv` must read back through `parseCsv` + `unguardCell`
// unchanged, because the point of exporting is to edit the file elsewhere and import it into another tenant.

/** Minimal RFC 4180 parser: quoted fields, "" escapes, commas/newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
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

// Spreadsheet apps run a cell that starts with one of these as a formula. These files are meant to be opened
// in a spreadsheet, and anyone with write access to a lookup could put `=HYPERLINK(...)` in a name, so export
// prefixes such a cell with an apostrophe (which spreadsheets show as plain text) and import removes it again.
// Matches any run of apostrophes before the formula character, so a value that already starts with one is
// still told apart from a guarded one.
const FORMULA_START = /^'*[=+\-@]/;

// Because of the apostrophe run above, `unguardCell` always removes exactly one apostrophe and the round trip is lossless.
export const guardCell = (v: string): string => (FORMULA_START.test(v) ? `'${v}` : v);

/** Undoes `guardCell`. Only a leading apostrophe that was put there to protect a formula start is removed. */
export const unguardCell = (v: string): string => (v.startsWith("'") && FORMULA_START.test(v) ? v.slice(1) : v);

const quote = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * Header row (the column keys, which is what import matches on) plus one line per row. A BOM is added so Excel
 * reads the file as UTF-8, and lines end in CRLF as RFC 4180 asks. With no rows the result is a header-only
 * template to fill in.
 */
export function toCsv(columns: string[], rows: Array<Record<string, string>>): string {
  const lines = [columns.map(quote).join(",")];
  for (const r of rows) lines.push(columns.map((c) => quote(guardCell(r[c] ?? ""))).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
