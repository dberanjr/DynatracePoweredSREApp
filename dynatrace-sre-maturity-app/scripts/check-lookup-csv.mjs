// Round-trip check for the Lookups tab CSV: what the export writes, the import must read back unchanged.
//
//   node scripts/check-lookup-csv.mjs        (also: npm run check:lookup-csv)
//
// lookupCsv.ts has no imports, so Node can load it directly (type stripping).

import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { toCsv, parseCsv, unguardCell, guardCell } = await import(pathToFileURL(join(root, "ui/app/pages/lookupCsv.ts")).href);

const problems = [];
const columns = ["applicationci", "name", "managed_by.u_vp"];
const rows = [
  { applicationci: "abc", name: "Plain", "managed_by.u_vp": "Jane Roe" },
  { applicationci: "abd", name: 'Has, comma and "quotes"', "managed_by.u_vp": "" },
  { applicationci: "abe", name: "Line\nbreak", "managed_by.u_vp": "Ünïcode ✓" },
  { applicationci: "abf", name: "=HYPERLINK(\"http://x\",\"y\")", "managed_by.u_vp": "-dash" },
  { applicationci: "abg", name: "+1", "managed_by.u_vp": "@handle" },
  { applicationci: "abh", name: "'=already quoted", "managed_by.u_vp": "'plain apostrophe" },
];

const csv = toCsv(columns, rows);
const table = parseCsv(csv);
const [header, ...body] = table;
if (JSON.stringify(header) !== JSON.stringify(columns)) problems.push(`header changed: ${JSON.stringify(header)}`);
if (body.length !== rows.length) problems.push(`expected ${rows.length} rows back, got ${body.length}`);
body.forEach((cells, i) => {
  columns.forEach((c, ci) => {
    const got = unguardCell(cells[ci]);
    if (got !== rows[i][c]) problems.push(`row ${i + 1} ${c}: wrote ${JSON.stringify(rows[i][c])}, read back ${JSON.stringify(got)}`);
  });
});

// The formula-start cells must not be written bare.
for (const line of csv.split("\r\n").slice(1)) {
  for (const cell of line.split(",")) if (/^[=+\-@]/.test(cell)) problems.push(`unguarded formula start in file: ${cell}`);
}
if (!csv.startsWith("﻿")) problems.push("missing BOM");
if (toCsv(columns, []) !== "﻿" + columns.join(",") + "\r\n") problems.push("empty export is not a header-only template");
if (guardCell("safe") !== "safe") problems.push("guardCell changed a safe value");

if (problems.length) {
  console.error("[check-lookup-csv] failed:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`[check-lookup-csv] ok: ${rows.length} rows round-trip, header-only template, formula guard`);
