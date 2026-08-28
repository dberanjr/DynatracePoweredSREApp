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

export interface DashboardDetail {
  dashboardName: string;
  dashboardId: string;
  createdTime: string;
  lastModifiedTime: string;
  ownerName: string;
}

// Live equivalent of the "Refresh /lookups/slo-dashboards" workflow's aggregation
// logic, called on-demand from the modal instead of relying on a scheduled workflow —
// same reliability issue as getGuardianDetail.function.ts.
export default async function (input: unknown = undefined) {
  // App-invoked (useAppFunction) calls with the payload directly as the first
  // argument; `dtctl exec function` wraps it as { payload, environmentId, ... }.
  // Accept either shape so the same function is testable both ways.
  const raw = (input && typeof input === 'object' && 'payload' in (input as Record<string, unknown>)
    ? (input as { payload?: unknown }).payload
    : input) as { appCI?: string } | undefined;
  const appCI = String(raw?.appCI || '').trim().toLowerCase();
  if (!appCI) return { dashboards: [] };

  const docs: DocumentEntry[] = [];
  let pageKey: string | null = null;
  do {
    const params = new URLSearchParams({ filter: "type=='dashboard'", 'page-size': '500' });
    if (pageKey) params.set('page-key', pageKey);
    const r = await fetch(`/platform/document/v1/documents?${params.toString()}`);
    if (!r.ok) throw new Error(`Documents read failed: ${r.status} ${await r.text()}`);
    const body = await r.json();
    for (const d of body.documents || []) docs.push(d);
    pageKey = body.nextPageKey || null;
  } while (pageKey);

  // Same naming convention as the lookup-table workflow: name starts with a
  // 3-letter AppCI token and contains "SLO" as a standalone uppercase token.
  const tokenRe = /^[A-Za-z]{3}([^A-Za-z]|$)/;
  const sloRe = /(^|[^A-Z])SLO([^A-Z]|$)/;
  const matches = docs.filter((d) => {
    const name = d.name || '';
    return sloRe.test(name) && tokenRe.test(name) && name.slice(0, 3).toLowerCase() === appCI;
  });

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
      // Owner resolution is best-effort — missing iam:users:read scope or a
      // deactivated user shouldn't break the whole dashboard list.
    }
  }

  const dashboards: DashboardDetail[] = matches.map((d) => ({
    dashboardName: d.name,
    dashboardId: d.id,
    createdTime: d.modificationInfo?.createdTime || '',
    lastModifiedTime: d.modificationInfo?.lastModifiedTime || '',
    ownerName: (d.owner && ownerNames.get(d.owner)) || d.owner || 'Unknown',
  }));

  dashboards.sort((a, b) => a.dashboardName.localeCompare(b.dashboardName));
  return { dashboards };
}
