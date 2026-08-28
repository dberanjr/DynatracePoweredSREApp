import { getEnvironmentId } from '@dynatrace-sdk/app-environment';
import { usersAndGroupsClient } from '@dynatrace-sdk/client-iam';

interface DocumentEntry {
  id: string;
  name: string;
  owner?: string;
  modificationInfo?: {
    createdTime?: string;
    lastModifiedTime?: string;
  };
}

export interface RunbookDetail {
  runbookName: string;
  runbookId: string;
  createdTime: string;
  lastModifiedTime: string;
  ownerName: string;
}

export interface OtherNotebookEntry {
  notebookName: string;
  reason: string;
}

// Live replacement for the "Refresh /lookups/runbooks" workflow's aggregation.
//
// Why this exists: that workflow runs SUCCESS daily but the /lookups/runbooks
// table contains only the "__none__" sentinel row, so the L3 Runbooks Linked
// check failed for every application with no way to tell "no runbooks exist"
// apart from "the pipeline is broken". Reading the Documents API on demand
// removes the scheduled-refresh failure mode entirely — the same reason
// getGuardianDetail and getDashboardDetail were migrated off lookup tables.
//
// Returns BOTH the matching runbooks and the app's other notebooks that failed
// the naming convention, so the modal can explain a zero result instead of
// rendering an unexplained empty table.
export default async function (input: unknown = undefined) {
  // App-invoked (useAppFunction) passes the payload directly; `dtctl exec
  // function` wraps it as { payload, environmentId, ... }. Accept either.
  const raw = (input && typeof input === 'object' && 'payload' in (input as Record<string, unknown>)
    ? (input as { payload?: unknown }).payload
    : input) as { appCI?: string } | undefined;
  const appCI = String(raw?.appCI || '').trim().toLowerCase();
  if (!appCI) return { runbooks: [], otherNotebooks: [] };

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

  // Naming convention, same as the lookup workflow: the name starts with a
  // 3-letter AppCI token and contains the word "Runbook" (any case).
  const tokenRe = /^[A-Za-z]{3}([^A-Za-z]|$)/;
  const runbookRe = /runbook/i;

  const startsWithAppCI = (name: string) =>
    tokenRe.test(name) && name.slice(0, 3).toLowerCase() === appCI;

  const matches: DocumentEntry[] = [];
  const others: OtherNotebookEntry[] = [];
  for (const d of docs) {
    const name = d.name || '';
    const hasPrefix = startsWithAppCI(name);
    const hasRunbook = runbookRe.test(name);
    if (hasPrefix && hasRunbook) {
      matches.push(d);
    } else if (hasPrefix) {
      // Belongs to this app but isn't named as a runbook — the most useful
      // thing to show a team whose check is failing.
      others.push({ notebookName: name, reason: 'Missing the word "Runbook" in the name' });
    } else if (hasRunbook && name.toLowerCase().includes(appCI)) {
      // Mentions the AppCI and is a runbook, but not as the leading 3-letter token.
      others.push({ notebookName: name, reason: 'AppCI is not the leading 3-letter token' });
    }
  }

  // Resolve owner UUIDs -> display names in one batch call.
  const ownerIds = Array.from(new Set(matches.map((d) => d.owner).filter((o): o is string => !!o)));
  const ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    try {
      const res = await usersAndGroupsClient.getActiveUsersForOrganizationalLevelPost({
        levelType: 'environment',
        levelId: getEnvironmentId(),
        body: ownerIds,
      });
      for (const u of res.results || []) {
        const display = [u.name, u.surname].filter(Boolean).join(' ') || u.email || u.uid;
        ownerNames.set(u.uid, display);
      }
    } catch {
      // Best-effort — a missing scope or deactivated user shouldn't break the list.
    }
  }

  const runbooks: RunbookDetail[] = matches.map((d) => ({
    runbookName: d.name,
    runbookId: d.id,
    createdTime: d.modificationInfo?.createdTime || '',
    lastModifiedTime: d.modificationInfo?.lastModifiedTime || '',
    ownerName: (d.owner && ownerNames.get(d.owner)) || d.owner || 'Unknown',
  }));

  runbooks.sort((a, b) => a.runbookName.localeCompare(b.runbookName));
  others.sort((a, b) => a.notebookName.localeCompare(b.notebookName));
  return { runbooks, otherNotebooks: others.slice(0, 100) };
}
