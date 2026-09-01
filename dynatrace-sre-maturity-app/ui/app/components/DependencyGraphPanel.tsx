import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  Node,
  Edge,
  NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { MaximizeIcon, MinimizeIcon } from "@dynatrace/strato-icons";
import { ChainDirection, DependencyChainResult } from "../hooks/useDependencyChain";
import { DependencyLevelSlider } from "./DependencyLevelSlider";
import { SmartscapeViewMenu, ActiveProblemLink } from "./SmartscapeViewMenu";
import { severityColor, severityRank } from "./dependencyUtils";
import { ErrorBoundary } from "./ErrorBoundary";

type LayoutMode = "horizontal" | "vertical" | "force";
type RenderStyle = "tiles" | "nodes";
type ViewMode = "standard" | "perf" | "critical";

export interface NodeMetrics {
  requestCount: number | null;
  p95Us: number | null;
}

interface NodeData {
  name: string;
  appCIs: string[];
  severity: string | null;
  isRoot?: boolean;
  smartscapeId: string;
  problemRole: string | null;
  problemId: string | null;
  sizeScale: number; // 1 = base size; only varies from 1 in Perf mode
}

const PROBLEM_RED = "#dc3545";
const ROOT_BLUE = "#1966FF";
const BASE_TILE_WIDTH = 190;
const BASE_TILE_HEIGHT = 64;
const BASE_CIRCLE_DIAMETER = 52;
const BASE_CIRCLE_BOX = 88;

function activeProblemOf(data: NodeData): ActiveProblemLink | null {
  return data.problemRole && data.problemId ? { role: data.problemRole, problemId: data.problemId } : null;
}

// "Tiles" node — a small info card. Border priority: an active problem (red)
// always wins over severity coloring, since a live incident is more urgent
// than a static criticality rating; a bold blue halo marks the selected
// service regardless, layered outside so it never fights with the border.
// Card width/height scale with data.sizeScale in Perf mode.
function DependencyNodeCard({ data }: NodeProps<NodeData>) {
  const sevColor = severityColor(data.severity);
  const borderColor = data.problemRole ? PROBLEM_RED : data.isRoot ? ROOT_BLUE : "var(--sre-border, rgba(0,0,0,0.15))";
  const width = Math.round(BASE_TILE_WIDTH * data.sizeScale);
  const height = Math.round(BASE_TILE_HEIGHT * data.sizeScale);
  const card = (
    <div
      style={{
        border: `${data.problemRole || data.isRoot ? 3 : 1}px solid ${borderColor}`,
        boxShadow: data.isRoot ? `0 0 0 4px ${ROOT_BLUE}4d` : "0 1px 3px rgba(0,0,0,0.08)",
        borderRadius: 8,
        padding: "8px 10px",
        background: "var(--sre-surface, #fff)",
        width,
        minHeight: height,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {sevColor && !data.problemRole && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor, flexShrink: 0 }} />
        )}
        <span
          title={data.name}
          style={{
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--sre-text-primary)",
          }}
        >
          {data.name}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {data.appCIs.length > 0 ? (
          data.appCIs.map((a) => (
            <span
              key={a}
              style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "rgba(25,102,255,0.1)", color: ROOT_BLUE }}
            >
              {a}
            </span>
          ))
        ) : (
          <span style={{ fontSize: 10, color: "var(--sre-text-secondary)", fontStyle: "italic" }}>Unresolved AppCI</span>
        )}
      </div>
      {data.problemRole && (
        <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: PROBLEM_RED }}>● {data.problemRole}</div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
  return <SmartscapeViewMenu entityId={data.smartscapeId} trigger={card} activeProblem={activeProblemOf(data)} />;
}

// "Nodes" (compact circle) view — always-visible label chip below the circle
// (per user preference), AppCI shown inside the circle itself. Same
// problem/selection color priority as the tile card. Circle diameter scales
// with data.sizeScale in Perf mode; the outer bounding box stays a fixed
// size (large enough for the biggest circle) so layout spacing never varies.
function DependencyNodeCircle({ data }: NodeProps<NodeData>) {
  const sevColor = severityColor(data.severity);
  const ringColor = data.problemRole ? PROBLEM_RED : sevColor || "var(--sre-border, rgba(0,0,0,0.25))";
  const primaryAppCI = data.appCIs[0] ? data.appCIs[0].toUpperCase() : "?";
  const extraAppCIs = data.appCIs.length > 1 ? `+${data.appCIs.length - 1}` : "";
  const diameter = Math.round(BASE_CIRCLE_DIAMETER * data.sizeScale);

  const circle = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: BASE_CIRCLE_BOX, cursor: "pointer" }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        title={`${data.name}${data.appCIs.length ? ` — ${data.appCIs.join(", ")}` : ""}${data.problemRole ? ` — ${data.problemRole}` : ""}`}
        style={{
          width: diameter,
          height: diameter,
          borderRadius: "50%",
          border: `${data.problemRole || data.isRoot ? 3 : 2}px solid ${ringColor}`,
          boxShadow: data.isRoot ? `0 0 0 4px ${ROOT_BLUE}4d` : undefined,
          background: sevColor ? `${sevColor}22` : "var(--sre-surface, #fff)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          color: "var(--sre-text-primary)",
        }}
      >
        <span>{primaryAppCI}</span>
        {extraAppCIs && <span style={{ fontSize: 8, opacity: 0.7 }}>{extraAppCIs}</span>}
      </div>
      <span
        style={{
          marginTop: 4,
          fontSize: 9,
          fontWeight: 600,
          color: "var(--sre-text-secondary)",
          maxWidth: BASE_CIRCLE_BOX,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          background: "var(--sre-table-stripe, rgba(0,0,0,0.04))",
          borderRadius: 8,
          padding: "1px 6px",
        }}
      >
        {data.name}
      </span>
      {data.problemRole && <span style={{ fontSize: 8, fontWeight: 700, color: PROBLEM_RED, marginTop: 2 }}>● {data.problemRole}</span>}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
  return <SmartscapeViewMenu entityId={data.smartscapeId} trigger={circle} activeProblem={activeProblemOf(data)} />;
}

const NODE_TYPES = { "dep-tile": DependencyNodeCard, "dep-circle": DependencyNodeCircle };

// Layout footprint is a uniform assumption fed to dagre/force so spacing
// never overlaps — in Perf mode this is deliberately the size of the
// *largest possible* node (rather than tracking real per-node dimensions),
// trading a little wasted whitespace around smaller nodes for zero overlap risk.
function footprintFor(renderStyle: RenderStyle, viewMode: ViewMode): { width: number; height: number } {
  if (renderStyle === "tiles") {
    return viewMode === "perf" ? { width: 270, height: 112 } : { width: BASE_TILE_WIDTH, height: BASE_TILE_HEIGHT };
  }
  return viewMode === "perf" ? { width: 110, height: 110 } : { width: BASE_CIRCLE_BOX, height: BASE_CIRCLE_BOX };
}

function layoutWithDagre(nodes: Node<NodeData>[], edges: Edge[], rankdir: "LR" | "TB", footprint: { width: number; height: number }): Node<NodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep: 30, ranksep: 80 });
  // Dagre writes each node's computed x/y directly onto the label object
  // passed to setNode — a shared `footprint` reference across all nodes
  // means every node's position ends up overwriting the same object, so
  // every node collapses onto the last-processed node's coordinates. Each
  // node needs its own object.
  nodes.forEach((n) => g.setNode(n.id, { ...footprint }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - footprint.width / 2, y: pos.y - footprint.height / 2 } };
  });
}

// Force-directed layout: settled once via synchronous ticks rather than an
// animated, ongoing simulation — a static snapshot is simpler to reason
// about and matches how the dagre layouts behave (computed once per render).
function layoutWithForce(nodes: Node<NodeData>[], edges: Edge[], footprint: { width: number; height: number }): Node<NodeData>[] {
  const simNodes = nodes.map((n, i) => ({
    id: n.id,
    x: Math.cos((i / nodes.length) * Math.PI * 2) * 200 + 300,
    y: Math.sin((i / nodes.length) * Math.PI * 2) * 200 + 200,
  }));
  const simEdges = edges.map((e) => ({ source: e.source, target: e.target }));

  const simulation = forceSimulation(simNodes as any)
    .force(
      "link",
      forceLink(simEdges as any)
        .id((d: any) => d.id)
        .distance(140),
    )
    .force("charge", forceManyBody().strength(-400))
    .force("center", forceCenter(300, 200))
    .force("collide", forceCollide(Math.max(footprint.width, footprint.height) / 1.6))
    .stop();

  for (let i = 0; i < 300; i++) simulation.tick();

  const posById = new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  return nodes.map((n) => ({ ...n, position: posById.get(n.id) || { x: 0, y: 0 } }));
}

function computeLayout(nodes: Node<NodeData>[], edges: Edge[], mode: LayoutMode, footprint: { width: number; height: number }): Node<NodeData>[] {
  if (mode === "vertical") return layoutWithDagre(nodes, edges, "TB", footprint);
  if (mode === "force") return layoutWithForce(nodes, edges, footprint);
  return layoutWithDagre(nodes, edges, "LR", footprint);
}

function SegmentedControl<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--sre-border)", borderRadius: 6, overflow: "hidden" }}>
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "4px 8px",
            border: "none",
            cursor: "pointer",
            background: value === opt.key ? "#1966FF" : "transparent",
            color: value === opt.key ? "#fff" : "var(--sre-text-secondary)",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Re-fits the viewport whenever the node set, layout, or fullscreen state
// changes — must live inside <ReactFlowProvider> to access useReactFlow().
function FlowCanvas({ nodes, edges, isExpanded }: { nodes: Node<NodeData>[]; edges: Edge[]; isExpanded: boolean }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const raf = requestAnimationFrame(() => fitView({ padding: 0.2, duration: 250 }));
    return () => cancelAnimationFrame(raf);
  }, [fitView, nodes, isExpanded]);

  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} proOptions={{ hideAttribution: true }} nodesDraggable={false} nodesConnectable={false}>
      <Background gap={16} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

interface Props {
  direction: ChainDirection;
  originId: string;
  originName: string;
  chain: DependencyChainResult;
  levels: number;
  maxLevels: number;
  onLevelsChange: (n: number) => void;
  rootProblem: ActiveProblemLink | null;
  rootMetrics: NodeMetrics | null;
}

// Keeps a node if it's critical itself, is the root, or sits directly
// adjacent (one edge away) to a critical node — "critical services and
// their direct dependencies."
function filterToCritical(nodeList: Node<NodeData>[], edgeList: Edge[], originId: string): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const criticalIds = new Set(nodeList.filter((n) => severityRank(n.data.severity) <= 3).map((n) => n.id));
  const keep = new Set<string>([originId, ...criticalIds]);
  edgeList.forEach((e) => {
    if (criticalIds.has(e.source)) keep.add(e.target);
    if (criticalIds.has(e.target)) keep.add(e.source);
  });
  return {
    nodes: nodeList.filter((n) => keep.has(n.id)),
    edges: edgeList.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}

export const DependencyGraphPanel = ({ direction, originId, originName, chain, levels, maxLevels, onLevelsChange, rootProblem, rootMetrics }: Props) => {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("horizontal");
  const [renderStyle, setRenderStyle] = useState<RenderStyle>("tiles");
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [isExpanded, setIsExpanded] = useState(false);
  const nodeType = renderStyle === "tiles" ? "dep-tile" : "dep-circle";

  const { nodes, edges } = useMemo(() => {
    type RawNode = { id: string; isRoot?: boolean; name: string; appCIs: string[]; severity: string | null; problemRole: string | null; problemId: string | null; requestCount: number | null; p95Us: number | null };
    const rawNodes: RawNode[] = [
      {
        id: originId,
        isRoot: true,
        name: originName,
        appCIs: [],
        severity: null,
        problemRole: rootProblem?.role || null,
        problemId: rootProblem?.problemId || null,
        requestCount: rootMetrics?.requestCount ?? null,
        p95Us: rootMetrics?.p95Us ?? null,
      },
    ];
    let rawEdges: { source: string; target: string; throughput: number | null }[] = [];
    for (let lvl = 1; lvl <= levels; lvl++) {
      const levelNodes = chain.levels[lvl] || [];
      for (const n of levelNodes) {
        rawNodes.push({
          id: n.id,
          name: n.name,
          appCIs: n.appCIs,
          severity: n.severity,
          problemRole: n.problemRole,
          problemId: n.problemId,
          requestCount: n.requestCount,
          p95Us: n.p95Us,
        });
        // Real-world "calls" direction is always caller -> callee. Forward
        // (downstream) traversal already walks that direction, so
        // parent -> node is correct. Backward (upstream) traversal walks
        // callee -> caller, so the arrow is reversed to preserve semantics.
        const [source, target] = direction === "forward" ? [n.parentId, n.id] : [n.id, n.parentId];
        // Edge throughput proxy: the dependency (non-root) endpoint's own
        // total request volume — a true caller->callee edge metric isn't
        // available as a simple dimensional lookup, so this approximates
        // "how much traffic touches this path" via the node it leads to.
        rawEdges.push({ source, target, throughput: n.requestCount });
      }
    }

    let nodeList: Node<NodeData>[] = rawNodes.map((n) => ({
      id: n.id,
      type: nodeType,
      data: {
        name: n.name,
        appCIs: n.appCIs,
        severity: n.severity,
        isRoot: n.isRoot,
        smartscapeId: n.id,
        problemRole: n.problemRole,
        problemId: n.problemId,
        sizeScale: 1,
      },
      position: { x: 0, y: 0 },
    }));
    // Each level is fetched as its own independent, async query against a
    // *dynamic* (live-observed, not static) "calls" edge set — two levels
    // can occasionally see slightly different topology snapshots a moment
    // apart, leaving a child's recorded parentId pointing at a node that
    // isn't actually in this render's node set. React Flow throws ("node
    // not found") on a dangling edge reference, so this is filtered
    // defensively rather than trusted blindly.
    const knownNodeIds = new Set(rawNodes.map((n) => n.id));
    let edgeList: Edge[] = rawEdges
      .filter((e) => knownNodeIds.has(e.source) && knownNodeIds.has(e.target))
      .map((e) => ({
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        style: { stroke: "var(--sre-border, #999)" },
      }));

    if (viewMode === "critical") {
      const filtered = filterToCritical(nodeList, edgeList, originId);
      nodeList = filtered.nodes;
      edgeList = filtered.edges;
    }

    if (viewMode === "perf") {
      const p95ById = new Map(rawNodes.map((n) => [n.id, n.p95Us]));
      const trafficById = new Map(rawNodes.map((n) => [n.id, n.requestCount]));
      const maxP95 = Math.max(1, ...rawNodes.map((n) => n.p95Us || 0));
      const maxTraffic = Math.max(1, ...rawEdges.map((e) => e.throughput || 0));

      nodeList = nodeList.map((n) => {
        const p95 = p95ById.get(n.id) || 0;
        const scale = 0.75 + Math.min(1, p95 / maxP95) * 0.95; // ~[0.75, 1.7]
        return { ...n, data: { ...n.data, sizeScale: scale } };
      });
      edgeList = edgeList.map((e) => {
        const throughput = trafficById.get(e.target) || 0;
        const strokeWidth = 1 + Math.min(1, throughput / maxTraffic) * 6; // [1, 7]
        return { ...e, style: { ...e.style, strokeWidth } };
      });
    }

    const footprint = footprintFor(renderStyle, viewMode);
    return { nodes: computeLayout(nodeList, edgeList, layoutMode, footprint), edges: edgeList };
  }, [direction, originId, originName, chain, levels, layoutMode, nodeType, renderStyle, viewMode, rootProblem, rootMetrics]);

  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <DependencyLevelSlider value={levels} max={maxLevels} totalLevels={chain.totalLevels} capped={chain.capped} onChange={onLevelsChange} />
      </div>
      <SegmentedControl<RenderStyle>
        value={renderStyle}
        onChange={setRenderStyle}
        options={[
          { key: "tiles", label: "Tiles" },
          { key: "nodes", label: "Nodes" },
        ]}
      />
      <SegmentedControl<LayoutMode>
        value={layoutMode}
        onChange={setLayoutMode}
        options={[
          { key: "horizontal", label: "Horizontal" },
          { key: "vertical", label: "Vertical" },
          { key: "force", label: "Force" },
        ]}
      />
      <SegmentedControl<ViewMode>
        value={viewMode}
        onChange={setViewMode}
        options={[
          { key: "standard", label: "Standard" },
          { key: "perf", label: "Perf" },
          { key: "critical", label: "Critical" },
        ]}
      />
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        title={isExpanded ? "Exit full screen" : "Full screen"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          border: "1px solid var(--sre-border)",
          borderRadius: 6,
          background: "transparent",
          cursor: "pointer",
          color: "var(--sre-text-secondary)",
          flexShrink: 0,
        }}
      >
        {isExpanded ? <MinimizeIcon /> : <MaximizeIcon />}
      </button>
    </div>
  );

  const canvasHeight = isExpanded ? "calc(100vh - 120px)" : 360;

  let body: React.ReactNode;
  if (chain.isLoading && chain.totalLevels === 0) {
    body = (
      <div style={{ height: canvasHeight, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ProgressCircle size="small" />
      </div>
    );
  } else if (chain.totalLevels === 0) {
    body = (
      <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6 }}>
          No {direction === "forward" ? "downstream" : "upstream"} dependencies found
        </Paragraph>
      </div>
    );
  } else if (nodes.length <= 1) {
    body = (
      <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Paragraph style={{ color: "var(--sre-text-secondary)", opacity: 0.6 }}>No critical services in this chain</Paragraph>
      </div>
    );
  } else {
    body = (
      <div style={{ height: canvasHeight, border: "1px solid var(--sre-border, rgba(0,0,0,0.12))", borderRadius: 8, overflow: "hidden" }}>
        {/* Scoped locally so a rendering failure (React Flow/dagre/d3-force)
            only replaces this one panel, not the whole page — the shared
            ErrorBoundary wrapping the route would otherwise take out the
            table, header, and the other direction's panel too. */}
        <ErrorBoundary compact>
          <ReactFlowProvider>
            <FlowCanvas nodes={nodes} edges={edges} isExpanded={isExpanded} />
          </ReactFlowProvider>
        </ErrorBoundary>
      </div>
    );
  }

  if (isExpanded) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "var(--sre-surface, #fff)", padding: 20, display: "flex", flexDirection: "column" }}>
        {toolbar}
        {body}
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      {body}
    </div>
  );
};
