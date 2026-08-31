import React, { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, Handle, Position, ReactFlowProvider, Node, Edge, NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { ProgressCircle } from "@dynatrace/strato-components-preview/content";
import { MaximizeIcon, MinimizeIcon } from "@dynatrace/strato-icons";
import { ChainDirection, DependencyChainResult } from "../hooks/useDependencyChain";
import { DependencyLevelSlider } from "./DependencyLevelSlider";
import { severityColor, severityLabel } from "./dependencyUtils";

type LayoutMode = "horizontal" | "vertical" | "force";

interface NodeData {
  name: string;
  appCIs: string[];
  severity: string | null;
  isRoot?: boolean;
  smartscapeId: string;
  smartscapeView: string;
}

function openInSmartscape(entityId: string, view: string) {
  const envUrl = getEnvironmentUrl().replace(/\/$/, "");
  window.open(`${envUrl}/ui/apps/dynatrace.smartscape/view/dynatrace.smartscape.${view}/${entityId}#from=now()-2h&to=now()`, "_blank");
}

function DependencyNodeCard({ data }: NodeProps<NodeData>) {
  const dotColor = severityColor(data.severity);
  return (
    <div
      style={{
        border: data.isRoot ? "2px solid #1966FF" : "1px solid var(--sre-border, rgba(0,0,0,0.15))",
        borderRadius: 8,
        padding: "8px 10px",
        background: "var(--sre-surface, #fff)",
        width: 190,
        fontSize: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {dotColor && (
          <span
            title={`Critical: ${severityLabel(data.severity)}`}
            style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }}
          />
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: data.isRoot ? 0 : 4 }}>
        {data.appCIs.length > 0 ? (
          data.appCIs.map((a) => (
            <span
              key={a}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 10,
                background: "rgba(25,102,255,0.1)",
                color: "#1966FF",
              }}
            >
              {a}
            </span>
          ))
        ) : (
          <span style={{ fontSize: 10, color: "var(--sre-text-secondary)", fontStyle: "italic" }}>Unresolved AppCI</span>
        )}
      </div>
      {!data.isRoot && (
        <button
          type="button"
          onClick={() => openInSmartscape(data.smartscapeId, data.smartscapeView)}
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--sre-text-link, #1966FF)",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          Open in Smartscape ↗
        </button>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { dep: DependencyNodeCard };
const NODE_WIDTH = 190;
const NODE_HEIGHT = 64;

function layoutWithDagre(nodes: Node<NodeData>[], edges: Edge[], rankdir: "LR" | "TB"): Node<NodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep: 30, ranksep: 80 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}

// Force-directed layout: settled once via synchronous ticks rather than an
// animated, ongoing simulation — a static snapshot is simpler to reason
// about and matches how the dagre layouts behave (computed once per render).
function layoutWithForce(nodes: Node<NodeData>[], edges: Edge[]): Node<NodeData>[] {
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
    .force("collide", forceCollide(NODE_WIDTH / 1.6))
    .stop();

  for (let i = 0; i < 300; i++) simulation.tick();

  const posById = new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  return nodes.map((n) => ({ ...n, position: posById.get(n.id) || { x: 0, y: 0 } }));
}

function computeLayout(nodes: Node<NodeData>[], edges: Edge[], mode: LayoutMode): Node<NodeData>[] {
  if (mode === "vertical") return layoutWithDagre(nodes, edges, "TB");
  if (mode === "force") return layoutWithForce(nodes, edges);
  return layoutWithDagre(nodes, edges, "LR");
}

function LayoutSwitcher({ value, onChange }: { value: LayoutMode; onChange: (m: LayoutMode) => void }) {
  const options: { key: LayoutMode; label: string }[] = [
    { key: "horizontal", label: "Horizontal" },
    { key: "vertical", label: "Vertical" },
    { key: "force", label: "Force" },
  ];
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

interface Props {
  direction: ChainDirection;
  originId: string;
  originName: string;
  chain: DependencyChainResult;
  levels: number;
  maxLevels: number;
  onLevelsChange: (n: number) => void;
}

export const DependencyGraphPanel = ({ direction, originId, originName, chain, levels, maxLevels, onLevelsChange }: Props) => {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("horizontal");
  const [isExpanded, setIsExpanded] = useState(false);
  const smartscapeView = direction === "forward" ? "downstream-call-chain" : "upstream-call-chain";

  const { nodes, edges } = useMemo(() => {
    const nodeList: Node<NodeData>[] = [
      {
        id: originId,
        type: "dep",
        data: { name: originName, appCIs: [], severity: null, isRoot: true, smartscapeId: originId, smartscapeView },
        position: { x: 0, y: 0 },
      },
    ];
    const edgeList: Edge[] = [];
    for (let lvl = 1; lvl <= levels; lvl++) {
      const levelNodes = chain.levels[lvl] || [];
      for (const n of levelNodes) {
        nodeList.push({
          id: n.id,
          type: "dep",
          data: { name: n.name, appCIs: n.appCIs, severity: n.severity, smartscapeId: n.id, smartscapeView },
          position: { x: 0, y: 0 },
        });
        // Real-world "calls" direction is always caller -> callee. Forward
        // (downstream) traversal already walks that direction, so
        // parent -> node is correct. Backward (upstream) traversal walks
        // callee -> caller, so the arrow is reversed to preserve semantics.
        const [source, target] = direction === "forward" ? [n.parentId, n.id] : [n.id, n.parentId];
        edgeList.push({ id: `${source}->${target}`, source, target, style: { stroke: "var(--sre-border, #999)" } });
      }
    }
    return { nodes: computeLayout(nodeList, edgeList, layoutMode), edges: edgeList };
  }, [direction, originId, originName, chain, levels, smartscapeView, layoutMode]);

  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DependencyLevelSlider value={levels} max={maxLevels} totalLevels={chain.totalLevels} capped={chain.capped} onChange={onLevelsChange} />
      </div>
      <LayoutSwitcher value={layoutMode} onChange={setLayoutMode} />
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
  } else {
    body = (
      <div style={{ height: canvasHeight, border: "1px solid var(--sre-border, rgba(0,0,0,0.12))", borderRadius: 8, overflow: "hidden" }}>
        <ReactFlowProvider>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} fitView proOptions={{ hideAttribution: true }}>
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    );
  }

  if (isExpanded) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "var(--sre-surface, #fff)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
        }}
      >
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
