/** Graph page — interactive knowledge graph with ReactFlow. */

import { useState, useEffect, useCallback } from "react";
import { Empty, Spin, FloatButton, Tag, Drawer, Descriptions } from "antd";
import { ZoomInOutlined, ZoomOutOutlined, ExpandOutlined } from "@ant-design/icons";
import {
  ReactFlow, Controls, Background, MiniMap, useNodesState, useEdgesState,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "../lib/api";

const ENTITY_COLORS: Record<string, string> = {
  person: "#ff7eb6", organization: "#7ec8e3", location: "#8ae08a",
  time: "#f9d856", product: "#c4b5fd", metric: "#fca5a5",
  action: "#93c5fd", work: "#d8b4fe", group: "#6ee7b7",
  subject: "#f9a8d4", tags: "#cbd5e1",
};

function buildFlowData(graph: any): { nodes: Node[]; edges: Edge[] } {
  if (!graph) return { nodes: [], edges: [] };
  const nodes: Node[] = (graph.nodes ?? []).map((n: any) => ({
    id: n.id,
    type: "default",
    data: { label: n.label, entityType: n.entityType },
    position: {
      x: Math.random() * 600,
      y: Math.random() * 400,
    },
    style: n.type === "entity"
      ? { background: ENTITY_COLORS[n.entityType ?? ""] ?? "#eee", borderRadius: 8, padding: 8, fontSize: 12 }
      : { background: "#fff", border: "2px solid #1677ff", borderRadius: 4, padding: 8, fontSize: 12 },
  }));
  const edges: Edge[] = (graph.edges ?? []).map((e: any) => ({
    id: e.id, source: e.source, target: e.target,
  }));
  return { nodes, edges };
}

interface Props {
  projectId: string;
  t: (zh: string, en: string) => string;
}

export default function Graph({ projectId, t }: Props) {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [detailOpen, setDetailOpen] = useState(false);

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
    // Could fetch event/entity detail here
    setDetailOpen(true);
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;
  if (nodes.length === 0) return <Empty description={t("暂无图谱数据", "No graph data")} style={{ marginTop: 120 }} />;

  return (
    <div style={{ width: "100%", height: "calc(100vh - 48px)" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
      >
        <Controls />
        <Background />
        <MiniMap />
      </ReactFlow>
      <FloatButton.Group style={{ right: 24, bottom: 24 }}>
        <FloatButton icon={<ZoomInOutlined />} />
        <FloatButton icon={<ExpandOutlined />} />
      </FloatButton.Group>

      <Drawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={t("节点详情", "Node Detail")}
        width={400}
      >
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t("双击节点查看详情", "Double-click node for details")}>
            {t("功能开发中", "Feature in development")}
          </Descriptions.Item>
        </Descriptions>
      </Drawer>
    </div>
  );
}
