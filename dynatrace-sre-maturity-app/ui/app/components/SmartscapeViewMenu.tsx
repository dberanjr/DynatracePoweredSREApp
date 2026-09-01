import React from "react";
import { Menu } from "@dynatrace/strato-components/navigation";
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
}

interface Props {
  entityId: string;
  /** Element that opens the menu when clicked. Defaults to the standard "View ▾" button. */
  trigger?: React.ReactNode;
  /** When the entity has an active Davis problem, adds a "Go to problem" item. */
  activeProblem?: ActiveProblemLink | null;
}

function openSmartscapeView(entityId: string, view: string) {
  const envUrl = getEnvironmentUrl().replace(/\/$/, "");
  window.open(`${envUrl}/ui/apps/dynatrace.smartscape/view/dynatrace.smartscape.${view}/${entityId}#from=now()-2h&to=now()`, "_blank");
}

function openProblem(problemId: string) {
  // Problems app takes the internal event.id UUID, NOT the display_id
  // (P-XXXX) — display_id renders a blank page.
  const envUrl = getEnvironmentUrl().replace(/\/$/, "");
  window.open(`${envUrl}/ui/apps/dynatrace.davis.problems/problem/${encodeURIComponent(problemId)}`, "_blank");
}

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

export function SmartscapeViewMenu({ entityId, trigger, activeProblem }: Props) {
  if (!entityId) return null;
  return (
    // Stop propagation so picking a menu item doesn't also fire the
    // trigger's own onClick (e.g. a row/node's click-to-select behavior).
    <div onClick={(e) => e.stopPropagation()}>
      <Menu>
        {/* Menu.Trigger uses Radix's asChild/Slot pattern — it clones its
            child to attach click/aria/ref behavior, which requires a real
            React element (React.isValidElement), not a bare text string.
            A plain string child silently renders as null. */}
        <Menu.Trigger>{trigger ?? DEFAULT_TRIGGER}</Menu.Trigger>
        {/* data-testid drives a z-index override in theme.css — Menu.Content's
            own zIndex (design-system overlay scale, ~30) renders underneath
            our modal's hand-rolled z-index:10000 portal otherwise. */}
        <Menu.Content alignment="end" data-testid="smartscape-view-menu-content">
          {SMARTSCAPE_VIEWS.map(({ label, view }) => (
            <Menu.Item key={view} onSelect={() => openSmartscapeView(entityId, view)}>
              {label}
            </Menu.Item>
          ))}
          {activeProblem && (
            <Menu.Item onSelect={() => openProblem(activeProblem.problemId)}>
              Go to problem ({activeProblem.role})
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu>
    </div>
  );
}
