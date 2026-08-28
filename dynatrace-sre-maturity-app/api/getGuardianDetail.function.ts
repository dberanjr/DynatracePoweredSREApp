import { settingsObjectsClient } from '@dynatrace-sdk/client-classic-environment-v2';

interface GuardianObjective {
  name?: string;
  objectiveType?: string;
}

interface GuardianSettingsValue {
  name?: string;
  eventKind?: string;
  tags?: string[];
  objectives?: GuardianObjective[];
}

export interface GuardianDetail {
  guardianId: string;
  guardianName: string;
  objectiveCount: number;
  objectives: string[];
  eventKind: string;
}

// Live equivalent of the "Refresh /lookups/guardians" workflow's aggregation logic,
// called on-demand from the modal instead of relying on a scheduled workflow — the
// Automation Engine schedule for that workflow proved unreliable to edit directly
// (edits didn't propagate to the actual trigger; see dql-lookup-table-load-cache-lag
// memory / project notes, 2026-08-26/27).
export default async function (input: unknown = undefined) {
  // App-invoked (useAppFunction) calls with the payload directly as the first
  // argument; `dtctl exec function` wraps it as { payload, environmentId, ... }.
  // Accept either shape so the same function is testable both ways.
  const raw = (input && typeof input === 'object' && 'payload' in (input as Record<string, unknown>)
    ? (input as { payload?: unknown }).payload
    : input) as { appCI?: string } | undefined;
  const appCI = String(raw?.appCI || '').trim().toLowerCase();
  if (!appCI) return { guardians: [] };

  const res = await settingsObjectsClient.getSettingsObjects({
    schemaIds: 'app:dynatrace.site.reliability.guardian:guardians',
    fields: 'objectId,value',
    pageSize: 500,
  });
  const items = res.items || [];

  const guardians: GuardianDetail[] = [];
  for (const obj of items) {
    const v = (obj.value || {}) as GuardianSettingsValue;
    const tags = v.tags || [];
    let matches = false;
    for (const t of tags) {
      const i = String(t).indexOf(':');
      if (i > 0) {
        const k = String(t).slice(0, i).trim().toLowerCase();
        const val = String(t).slice(i + 1).trim().toLowerCase();
        if ((k === 'applicationci' || k === 'appci') && val === appCI) matches = true;
      }
    }
    if (!matches) continue;

    const objectives = Array.isArray(v.objectives) ? v.objectives : [];
    guardians.push({
      guardianId: String((obj as { objectId?: string }).objectId || ''),
      guardianName: String(v.name || 'Unnamed Guardian'),
      objectiveCount: objectives.length,
      objectives: objectives.map((o) => String(o.name || o.objectiveType || '?')),
      eventKind: String(v.eventKind || ''),
    });
  }

  guardians.sort((a, b) => a.guardianName.localeCompare(b.guardianName));
  return { guardians };
}
