/** Graph page — interactive knowledge graph with ReactFlow.
 *
 *  Matches SAG's ProjectGraphWorkspace:
 *  - Entity nodes colored by type, event nodes
 *  - Double-click to fetch and open event/entity detail
 *  - Controls, minimap, background
 */

import { useState, useEffect, useCallback } from "react";
import { Empty, Spin, FloatButton } from "antd";
import { ZoomInOutlined, ZoomOutOutlined, ExpandOutlined } from "@ant-design/icons";
import {
  ReactFlow, Controls, Background, MiniMap, useNodesState, useEdgesState,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "../lib/api";
import type { ProjectGraphRecord } from "../types";

const ENTITY_COLORS: Record<string, string> = {
  person: "#ff7eb6", organization: "#7ec8e3", location: "#8ae08a",
  time: "#f9d856", product: "#c4b5fd", metric: "#fca5a5",
  action: "#93c5fd", work: "#d8b4fe", group: "#6ee7b7",
  subject: "#f9a8d4", tags: "#cbd5e1",
};

function buildFlowData(graph: ProjectGraphRecord): { nodes: Node[]; edges: Edge[] } {
  if (!graph) return { nodes: [], edges: [] };

  const entityMap = new Map(graph.entities.map((e) => [e.id, e]));

  const nodes: Node[] = [
    ...graph.entities.map((e) => ({
      id: e.id,
      type: "default" as const,
      data: { label: e.name, entityType: e.type, kind: "entity" },
      position: { x: Math.random() * 600, y: Math.random() * 400 },
      style: {
        background: ENTITY_COLORS[e.type] ?? "#eee",
        borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 500,
      },
    })),
    ...graph.events.map((ev) => ({
      id: ev.id,
      type: "default" as const,
      data: { label: ev.title, kind: "event", entityIds: ev.entityIds },
      position: { x: Math.random() * 600, y: Math.random() * 400 },
      style: {
        background: "#fff", border: "2px solid #1677ff", borderRadius: 4,
        padding: "6px 12px", fontSize: 12,
      },
    })),
  ];

  const edges: Edge[] = (graph.edges ?? []).map((e) => ({
    id: `${e.entityId}-${e.eventId}`,
    source: e.entityId,
    target: e.eventId,
    style: { stroke: "#d9d9d9" },
  }));

  return { nodes, edges };
}

interface Props {
  projectId: string;
  onOpenEventDetail?: (eventId: string) => void;
  onOpenEntityDetail?: (entityId: string) => void;
  t: (zh: string, en: string) => string;
}

export default function Graph({ projectId, onOpenEventDetail, onOpenEntityDetail, t }: Props) {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.getProjectGraph(projectId)
      .then((data) => {
        const { nodes: n, edges: e } = buildFlowData(data.graph);
        setNodes(n);
        setEdges(e);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, setNodes, setEdges]);

  const onNodeDoubleClick = useCallback(async (_event: any, node: Node) => {
    const kind = node.data?.kind as string;
    const id = node.id;
    if (kind === "event" && onOpenEventDetail) {
      onOpenEventDetail(id);
    } else if (kind === "entity" && onOpenEntityDetail) {
      onOpenEntityDetail(id);
    }
  }, [onOpenEventDetail, onOpenEntityDetail]);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;
  if (nodes.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
        <Empty description={t("暂无图谱数据，上传文档并完成提取后可查看", "No graph data yet. Upload documents and finish extraction.")} />
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "calc(100vh - 48px)" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        attributionPosition="bottom-left"
      >
        <Controls />
        <Background />
        <MiniMap />
      </ReactFlow>
      <FloatButton.Group style={{ right: 24, bottom: 24 }}>
        <FloatButton icon={<ZoomInOutlined />} />
        <FloatButton icon={<ExpandOutlined />} />
      </FloatButton.Group>
    </div>
  );
}
