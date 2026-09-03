import React, { useState } from "react";
import { Menu } from "@dynatrace/strato-components/navigation";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";

// The 5 Smartscape topology views reachable from a service node's own "Mode"
// dropdown in the Smartscape app — surfaced here per-row/per-node so a user
// doesn't have to open the service in Smartscape manually to reach them.
export const SMARTSCAPE_VIEWS: { label: string; view: string }[] = [
  { label: "Related nodes", view: "all-topology" },
  { label: "Direct calls", view: "horizontal-topology" },
  { label: "Hierarchy", view: "vertical-topology" },
  { label: "Downstream call chain", view: "downstream-call-chain" },
  { label: "Upstream call chain", view: "upstream-call-chain" },
];

export interface ActiveProblemLink {
  role: string; // "Root cause" | "Impacted"
  problemId: string;
  /** The human-readable "P-XXXX" problem identifier — shown to the user
   * instead of the generic role word. Null on the rare row where Davis
   * hasn't populated it yet. */
  problemDisplayId: string | null;
}

interface Props {
  entityId: string;
  /** Shown as a header inside the menu, above the drill-down options, along
   * with this service's own direct upstream/downstream counts (fetched lazily,
   * only while the menu is open). Omit to skip the header entirely. */
  entityName?: string;
  /** Element that opens the menu when clicked. Defaults to the standard "View ▾" button. */
  trigger?: React.ReactNode;
  /** When the entity has an active Davis problem, adds a "Go to problem" item. */
  activeProblem?: ActiveProblemLink | null;
}

function openSmartscapeView(entityId: string, view: string) {
  const envUrl = getEnvironmentUrl().replace(/\/$/, "");
  window.open(`${envUrl}/ui/apps/dynatrace.smartscape/view/dynatrace.smartscape.${view}/${entityId}#from=now()-2h&to=now()`, "_blank");
}

// Shared by every "open this problem" affordance in the Dependencies tab
// (this menu, the topology node labels, the table's problem chips) so the
// URL-building logic — and its gotcha — lives in exactly one place.
export function openProblem(problemId: string) {
  // Problems app takes the internal event.id UUID, NOT the display_id
  // (P-XXXX) — display_id renders a blank page.
  const envUrl = getEnvironmentUrl().replace(/\/$/, "");
  window.open(`${envUrl}/ui/apps/dynatrace.davis.problems/problem/${encodeURIComponent(problemId)}`, "_blank");
}

// Reuses the exact downstream/upstream-count shape from the "4. Smartscape
// Discovery" check and ServiceGoldenSignalsTable, scoped to one known id
// instead of a whole AppCI's tagged services.
const DIRECT_DEP_COUNT_QUERY = (entityId: string) => `fetch dt.entity.service
| filter id == "${entityId}"
| fieldsFlatten calls, prefix:"calls_"
| fieldsAdd downstreamIds = \`calls_dt.entity.service\`
| fieldsAdd downstream = arraySize(downstreamIds)
| lookup [
    fetch dt.entity.service
    | fieldsFlatten calls, prefix:"calls_"
    | fieldsAdd downstreamIds = \`calls_dt.entity.service\`
    | expand downstreamIds
    | summarize upstream = countDistinct(id), by:{callee = downstreamIds}
  ], sourceField:id, lookupField:callee, fields:{upstream}
| fieldsAdd upstream = if(isNull(upstream), 0, else: upstream)
| fieldsAdd downstream = if(isNull(downstream), 0, else: downstream)
| fields downstream, upstream
| limit 1`;

const DEFAULT_TRIGGER = (
  <button
    type="button"
    style={{
      fontSize: 11,
      fontWeight: 600,
      color: "var(--sre-text-link, #1966FF)",
      background: "transparent",
      border: "1px solid var(--sre-border, rgba(0,0,0,0.15))",
      borderRadius: 4,
      padding: "3px 8px",
      cursor: "pointer",
    }}
  >
    View ▾
  </button>
);

export function SmartscapeViewMenu({ entityId, entityName, trigger, activeProblem }: Props) {
  const [open, setOpen] = useState(false);
  // Only fires while the menu is actually open — with potentially dozens of
  // nodes rendered in the topology map, firing this per-node on mount would
  // mean dozens of background queries nobody asked for.
  const { data: countData, isLoading: countsLoading } = useDql({
    query: open && entityName ? DIRECT_DEP_COUNT_QUERY(entityId) : "data record(skip = true) | limit 0",
  });
  const counts = countData?.records?.[0] as Record<string, unknown> | undefined;

  if (!entityId) return null;
  return (
    // Stop propagation so picking a menu item doesn't also fire the
    // trigger's own onClick (e.g. a row/node's click-to-select behavior).
    <div onClick={(e) => e.stopPropagation()}>
      <Menu open={open} onOpenChange={setOpen}>
        {/* Menu.Trigger uses Radix's asChild/Slot pattern — it clones its
            child to attach click/aria/ref behavior, which requires a real
            React element (React.isValidElement), not a bare text string.
            A plain string child silently renders as null. */}
        <Menu.Trigger>{trigger ?? DEFAULT_TRIGGER}</Menu.Trigger>
        {/* data-testid drives a z-index override in theme.css — Menu.Content's
            own zIndex (design-system overlay scale, ~30) renders underneath
            our modal's hand-rolled z-index:10000 portal otherwise. */}
        <Menu.Content alignment="end" data-testid="smartscape-view-menu-content">
          {entityName && (
            <Menu.Label>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{entityName}</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: "var(--sre-text-secondary)" }}>
                {countsLoading ? "Loading dependencies…" : `Upstream: ${Number(counts?.upstream ?? 0)} · Downstream: ${Number(counts?.downstream ?? 0)}`}
              </div>
            </Menu.Label>
          )}
          {SMARTSCAPE_VIEWS.map(({ label, view }) => (
            <Menu.Item key={view} onSelect={() => openSmartscapeView(entityId, view)}>
              {label}
            </Menu.Item>
          ))}
          {activeProblem && (
            <Menu.Item onSelect={() => openProblem(activeProblem.problemId)}>
              Go to problem ({activeProblem.problemDisplayId || activeProblem.role})
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu>
    </div>
  );
}
