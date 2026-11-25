// The naming rule (same as the app's queries, see nameWordsExpr in ui/app/queries/maturityQueries.ts): a name belongs to an
// application when the application's ID is one of its WORDS, ignoring case. Words are separated by whitespace and _ - : / . , ( ) [ ] |
const nameWords = (name: string): string[] => name.toLowerCase().split(/[\s_\-:/.,()[\]|]+/).filter(Boolean);

interface DocumentEntry {
  id: string;
  name: string;
}

// Bulk sibling of getRunbookDetail: same Documents API fetch (it already reads
// every notebook in the tenant before filtering to one application ID), but groups by
// application ID instead of filtering to one — so the portfolio leaderboard can score
// Runbooks Linked for every app in a single call instead of the 0-for-everyone
// placeholder it used before. See getRunbookDetail.function.ts for the
// per-app version this mirrors, including why Documents API reads live rather
// than /lookups/runbooks.
export default async function (_input: unknown = undefined) {
  const docs: DocumentEntry[] = [];
  let pageKey: string | null = null;
  do {
    const params = new URLSearchParams({ filter: "type=='notebook'", 'page-size': '500' });
    if (pageKey) params.set('page-key', pageKey);
    const r = await fetch(`/platform/document/v1/documents?${params.toString()}`);
    if (!r.ok) throw new Error(`Documents read failed: ${r.status} ${await r.text()}`);
    const body = await r.json();
    for (const d of body.documents || []) docs.push(d);
    pageKey = body.nextPageKey || null;
  } while (pageKey);

  // Same naming rule as getRunbookDetail: the name contains the word "Runbook" (any case) and names the application by its ID
  // as a word. Every word of such a name is counted; the app only looks up the IDs it knows, so other words are harmless.
  const runbookRe = /runbook/i;

  const counts: Record<string, number> = {};
  for (const d of docs) {
    const name = d.name || '';
    if (!runbookRe.test(name)) continue;
    for (const word of new Set(nameWords(name))) counts[word] = (counts[word] || 0) + 1;
  }
  return { counts };
}
