/** Documents page — project document management with stats, upload, and detail views. */

import { useState, useEffect, useCallback } from "react";
import {
  Statistic, List, Button, Tabs, Tag, Table, message, Input,
  Popconfirm, Space, Empty, Descriptions, Card, Row, Col, Spin, Typography,
} from "antd";
import {
  UploadOutlined, ReloadOutlined, InboxOutlined, RestOutlined, DeleteOutlined,
} from "@ant-design/icons";
import { api } from "../lib/api";
import type { DocumentRecord, ProjectStatsRecord, ChunkRecord, EventRecord, EntityRecord, SearchResult } from "../types";
import UploadDialog from "../components/UploadDialog";
import DetailDrawer from "../components/DetailDrawer";

const { Text } = Typography;

interface Props {
  projectId: string;
  onProjectsChange: () => void;
  t: (zh: string, en: string) => string;
}

export default function Documents({ projectId, onProjectsChange, t }: Props) {
  const [stats, setStats] = useState<ProjectStatsRecord | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docTab, setDocTab] = useState("overview");
  const [chunks, setChunks] = useState<ChunkRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailType, setDetailType] = useState<"event" | "entity" | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        api.getProjectStats(projectId),
        api.listDocuments(projectId),
      ]);
      setStats(s.stats);
      setDocuments(d.documents ?? []);
      if (d.documents && d.documents.length > 0 && !selectedDocId) {
        setSelectedDocId(d.documents[0].id);
      }
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [projectId, selectedDocId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load doc detail tabs
  useEffect(() => {
    if (!selectedDocId) return;
    if (docTab === "chunks") api.listChunks(selectedDocId).then((d) => setChunks(d.chunks ?? [])).catch(() => {});
    if (docTab === "events") api.listEvents(selectedDocId).then((d) => setEvents(d.events ?? [])).catch(() => {});
    if (docTab === "entities") api.listEntities(selectedDocId).then((d) => setEntities(d.entities ?? [])).catch(() => {});
  }, [selectedDocId, docTab]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.search({ query: searchQuery.trim(), sourceIds: [projectId] });
      setSearchResults(res);
    } catch (e: any) { message.error(e.message); }
    finally { setSearching(false); }
  };

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 48px)" }}>
      {/* Left panel */}
      <div style={{ width: 340, borderRight: "1px solid #f0f0f0", padding: 16, overflow: "auto" }}>
        {/* Stats */}
        {stats && (
          <Row gutter={8} style={{ marginBottom: 16 }}>
            <Col span={6}><Statistic title={t("文档", "Docs")} value={stats.document_count} /></Col>
            <Col span={6}><Statistic title={t("分块", "Chunks")} value={stats.chunk_count} /></Col>
            <Col span={6}><Statistic title={t("事件", "Events")} value={stats.event_count} /></Col>
            <Col span={6}><Statistic title={t("实体", "Entities")} value={stats.entity_count} /></Col>
          </Row>
        )}

        {/* Actions */}
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
            {t("上传", "Upload")}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadData} />
        </Space>

        {/* Document List */}
        <List
          dataSource={documents.filter((d) => !d.archived_at)}
          renderItem={(doc) => (
            <List.Item
              style={{
                cursor: "pointer",
                padding: "8px 12px",
                background: selectedDocId === doc.id ? "#e6f4ff" : undefined,
                borderRadius: 6,
                marginBottom: 4,
              }}
              onClick={() => setSelectedDocId(doc.id)}
              actions={[
                <Popconfirm key="archive" title={t("归档?", "Archive?")} onConfirm={() => api.archiveDocument(doc.id).then(loadData)}>
                  <Button size="small" type="text" icon={<InboxOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={<Text ellipsis style={{ maxWidth: 200 }}>{doc.title || doc.file_name}</Text>}
                description={<Tag>{doc.parse_status}</Tag>}
              />
            </List.Item>
          )}
          locale={{ emptyText: <Empty description={t("暂无文档", "No documents")} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {!selectedDoc ? (
          <Empty description={t("选择左侧文档查看详情", "Select a document to view details")} />
        ) : (
          <>
            <Descriptions title={selectedDoc.title || selectedDoc.file_name} size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="ID">{selectedDoc.id}</Descriptions.Item>
              <Descriptions.Item label={t("状态", "Status")}><Tag>{selectedDoc.parse_status}</Tag></Descriptions.Item>
              <Descriptions.Item label={t("分块/事件", "Chunks/Events")}>{selectedDoc.chunk_count}/{selectedDoc.event_count}</Descriptions.Item>
            </Descriptions>

            <Tabs
              activeKey={docTab}
              onChange={setDocTab}
              items={[
                {
                  key: "overview",
                  label: t("概览", "Overview"),
                  children: <Card>{t("文档概览内容", "Document overview content.")}</Card>,
                },
                {
                  key: "chunks",
                  label: t("分块", "Chunks"),
                  children: (
                    <Table
                      dataSource={chunks}
                      rowKey="id"
                      size="small"
                      columns={[
                        { title: "ID", dataIndex: "id", width: 100, ellipsis: true },
                        { title: t("内容", "Content"), dataIndex: "content", ellipsis: true },
                      ]}
                      pagination={{ pageSize: 10 }}
                    />
                  ),
                },
                {
                  key: "events",
                  label: t("事件", "Events"),
                  children: (
                    <Table
                      dataSource={events}
                      rowKey="id"
                      size="small"
                      columns={[
                        { title: t("标题", "Title"), dataIndex: "title", ellipsis: true },
                        {
                          title: t("实体", "Entities"),
                          render: (_: any, r: EventRecord) => r.entities?.map((e) => <Tag key={e.id}>{e.name}</Tag>),
                        },
                      ]}
                      onRow={(r) => ({
                        onClick: () => { setDetailType("event"); setDetailData(r); setDetailOpen(true); },
                        style: { cursor: "pointer" },
                      })}
                      pagination={{ pageSize: 10 }}
                    />
                  ),
                },
                {
                  key: "entities",
                  label: t("实体", "Entities"),
                  children: (
                    <Table
                      dataSource={entities}
                      rowKey="id"
                      size="small"
                      columns={[
                        { title: t("名称", "Name"), dataIndex: "name" },
                        { title: t("类型", "Type"), dataIndex: "type", render: (v: string) => <Tag>{v}</Tag> },
                        { title: t("事件数", "Events"), dataIndex: "event_count" },
                      ]}
                      onRow={(r) => ({
                        onClick: () => { setDetailType("entity"); setDetailData(r); setDetailOpen(true); },
                        style: { cursor: "pointer" },
                      })}
                      pagination={{ pageSize: 10 }}
                    />
                  ),
                },
                {
                  key: "search",
                  label: t("搜索", "Search"),
                  children: (
                    <div>
                      <Space style={{ marginBottom: 12 }}>
                        <Input.Search
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onSearch={handleSearch}
                          placeholder={t("搜索事件...", "Search events...")}
                          loading={searching}
                          style={{ width: 300 }}
                        />
                      </Space>
                      {searchResults && (
                        <Table
                          dataSource={searchResults.events ?? []}
                          rowKey="id"
                          size="small"
                          columns={[
                            { title: t("标题", "Title"), dataIndex: "title", ellipsis: true },
                            {
                              title: t("实体", "Entities"),
                              render: (_: any, r: EventRecord) => r.entities?.map((e) => <Tag key={e.id}>{e.name}</Tag>),
                            },
                          ]}
                          pagination={{ pageSize: 10 }}
                        />
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </>
        )}
      </div>

      <UploadDialog open={uploadOpen} projectId={projectId} onClose={() => setUploadOpen(false)} onSuccess={loadData} t={t} />
      <DetailDrawer open={detailOpen} type={detailType} data={detailData} onClose={() => setDetailOpen(false)} t={t} />
    </div>
  );
}
