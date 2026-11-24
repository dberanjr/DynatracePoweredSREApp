interface PlatformSlo {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  criteria?: { target?: number; timeframeFrom?: string; timeframeTo?: string }[];
}

export interface SloDetail {
  sloId: string;
  sloName: string;
  sloType: string;
  target: number | null;
  description: string;
}

// Live equivalent of the "Write SLOs to Lookup" workflow's name list, enriched
// with target/description via the Gen3 SLO platform API (/platform/slo/v1/slos)
// — called on-demand so the modal can link each row straight to its SLO, which
// the lookup-table-based name list can't do without an ID.
export default async function (input: unknown = undefined) {
  const raw = (input && typeof input === 'object' && 'payload' in (input as Record<string, unknown>)
    ? (input as { payload?: unknown }).payload
    : input) as { appId?: string; appCiField?: string; sloIdFromTag?: boolean } | undefined;
  const appId = String(raw?.appId || '').trim().toLowerCase();
  if (!appId) return { slos: [] };

  const slos: PlatformSlo[] = [];
  let pageKey: string | null = null;
  do {
    // The platform SLO API rejects page-size when page-key is set.
    const params = new URLSearchParams(pageKey ? { 'page-key': pageKey } : { 'page-size': '500' });
    const r = await fetch(`/platform/slo/v1/slos?${params.toString()}`);
    if (!r.ok) throw new Error(`SLO list read failed: ${r.status} ${await r.text()}`);
    const body = await r.json();
    for (const s of body.slos || []) slos.push(s);
    pageKey = body.nextPageKey || null;
  } while (pageKey);

  // Settings with an SLO Application ID column identify an SLO by its `<appCiField>:<id>` tag (the same rule the
  // refresh workflow uses); otherwise the application is the first 3 characters of the name.
  const tagKey = String(raw?.appCiField || '').trim().toLowerCase();
  const byTag = raw?.sloIdFromTag === true && tagKey !== '';
  const matches = slos.filter((s) =>
    byTag
      ? (s.tags || []).some((t) => t.toLowerCase() === `${tagKey}:${appId}`)
      : (s.name || '').slice(0, 3).toLowerCase() === appId,
  );

  const details: SloDetail[] = matches.map((s) => {
    const lastToken = s.name.split('-').pop() || s.name;
    const sloType = lastToken.endsWith('SLO') ? lastToken.slice(0, -3) : lastToken;
    const target = s.criteria?.[0]?.target ?? null;
    return {
      sloId: s.id,
      sloName: s.name,
      sloType,
      target,
      description: s.description || '',
    };
  });

  details.sort((a, b) => a.sloName.localeCompare(b.sloName));
  return { slos: details };
}
