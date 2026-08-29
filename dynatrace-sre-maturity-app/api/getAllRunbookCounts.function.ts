interface DocumentEntry {
  id: string;
  name: string;
}

// Bulk sibling of getRunbookDetail: same Documents API fetch (it already reads
// every notebook in the tenant before filtering to one AppCI), but groups by
// AppCI instead of filtering to one — so the portfolio leaderboard can score
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

  // Same naming convention as getRunbookDetail: name starts with a 3-letter
  // AppCI token and contains the word "Runbook" (any case).
  const tokenRe = /^[A-Za-z]{3}([^A-Za-z]|$)/;
  const runbookRe = /runbook/i;

  const counts: Record<string, number> = {};
  for (const d of docs) {
    const name = d.name || '';
    if (tokenRe.test(name) && runbookRe.test(name)) {
      const appci = name.slice(0, 3).toLowerCase();
      counts[appci] = (counts[appci] || 0) + 1;
    }
  }
  return { counts };
}
