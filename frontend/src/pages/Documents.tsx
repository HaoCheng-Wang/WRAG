/** Documents page — project document management with stats, upload jobs, and detail views.
 *
 *  Matches SAG's ProjectDocumentsWorkspace:
 *  - Left panel: stats, upload jobs panel (progress bars), document list
 *  - Right panel: Overview / Chunks / Events / Entities / Search tabs
 *  - Archive/restore toggle, document rename, search mode toggle
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Statistic, Button, Tabs, Tag, Table, message, Input, Card,
  Popconfirm, Space, Empty, Descriptions, Row, Col, Spin, Typography, Progress, Switch,
} from "antd";
import {
  UploadOutlined, ReloadOutlined, InboxOutlined, SearchOutlined,
  FileTextOutlined, DownOutlined, UpOutlined, LoadingOutlined,
} from "@ant-design/icons";
import { api } from "../lib/api";
import type {
  DocumentRecord, ProjectStatsRecord, ChunkRecord, EventRecord, EntityRecord,
  SearchResult, UploadJobRecord, SourceRecord, SearchMode, EmbeddingPreview,
} from "../types";
import { formatDate, formatBytes, shortId } from "../lib/markdown";
import UploadDialog from "../components/UploadDialog";
import DetailDrawer from "../components/DetailDrawer";

const { Text, Paragraph } = Typography;

type ResultView = "overview" | "chunks" | "events" | "entities" | "search";
const PAGE_SIZE = 10;

interface Props {
  projectId: string;
  project: SourceRecord | null;
  uploadJobs: UploadJobRecord[];
  onUploadJobsChange: (jobs: UploadJobRecord[]) => void;
  onProjectsChange: () => void;
  onOpenEventDetail?: (eventId: string) => void;
  onOpenEntityDetail?: (entityId: string) => void;
  t: (zh: string, en: string) => string;
}

export default function Documents(props: Props) {
  const { projectId, project, uploadJobs, t } = props;
  const [stats, setStats] = useState<ProjectStatsRecord | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [resultView, setResultView] = useState<ResultView>("overview");
  const [chunks, setChunks] = useState<ChunkRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailType, setDetailType] = useState<"event" | "entity" | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("fast");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [uploadQueueExpanded, setUploadQueueExpanded] = useState(false);
  const [resultFilter, setResultFilter] = useState("");
  const [resultPage, setResultPage] = useState(1);

  // Auto-expand upload queue when jobs are active
  const hasActiveUploads = useMemo(
    () => uploadJobs.some((j) => j.status === "QUEUED" || j.status === "RUNNING"),
    [uploadJobs],
  );

  useEffect(() => {
    if (hasActiveUploads) setUploadQueueExpanded(true);
  }, [hasActiveUploads]);

  // Load project data
  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        api.getProjectStats(projectId),
        api.listDocuments(projectId, showArchived),
      ]);
      setStats(s.stats);
      setDocuments(d.documents ?? []);
      if (d.documents?.length && !d.documents.some((doc) => doc.id === selectedDocId)) {
        setSelectedDocId(d.documents[0].id);
      }
      if (!d.documents?.length) setSelectedDocId(null);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [projectId, showArchived]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load chunks/events/entities — always load all three when document
  // changes so Overview shows correct counts immediately.
  useEffect(() => {
    if (!selectedDocId) { setChunks([]); setEvents([]); setEntities([]); return; }
    api.listChunks(selectedDocId).then((d) => setChunks(d.chunks ?? [])).catch(() => {});
    api.listEvents(selectedDocId).then((d) => setEvents(d.events ?? [])).catch(() => {});
    api.listEntities(selectedDocId).then((d) => setEntities(d.entities ?? [])).catch(() => {});
  }, [selectedDocId]);

  // Reset result page on filter/view change
  useEffect(() => { setResultPage(1); }, [resultFilter, resultView, selectedDocId]);

  // Search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      await api.streamSearch(
        { query: searchQuery.trim(), sourceIds: [projectId], searchMode },
        (event) => {
          if (event.type === "done") setSearchResult(event.result);
          if (event.type === "error") message.error(event.message);
        },
      );
    } catch (e: any) { message.error(e.message); }
    finally { setSearching(false); }
  };

  // Document actions
  const handleRename = async (doc: DocumentRecord) => {
    const title = window.prompt(t("请输入新的文档名称", "Enter a new document name"), doc.title)?.trim();
    if (!title || title === doc.title) return;
    try {
      await api.updateDocument(doc.id, { title });
      loadData();
    } catch (e: any) { message.error(e.message); }
  };

  const handleArchive = async (doc: DocumentRecord) => {
    try {
      if (doc.archivedAt) await api.restoreDocument(doc.id);
      else await api.archiveDocument(doc.id);
      loadData();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDelete = async (doc: DocumentRecord) => {
    try {
      await api.deleteDocument(doc.id);
      message.success(t("已永久删除", "Permanently deleted"));
      if (selectedDocId === doc.id) setSelectedDocId(null);
      loadData();
    } catch (e: any) { message.error(e.message); }
  };

  // Open detail
  const openEventDetail = async (eventId: string) => {
    try {
      const detail = await api.getEvent(eventId);
      setDetailType("event"); setDetailData(detail); setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  const openEntityDetail = async (entityId: string) => {
    try {
      const detail = await api.getEntity(entityId);
      setDetailType("entity"); setDetailData(detail); setDetailOpen(true);
    } catch (e: any) { message.error(e.message); }
  };

  // Filter helpers
  const filterKeyword = resultFilter.trim().toLowerCase();
  const filteredChunks = filterKeyword ? chunks.filter((c) => (c.heading ?? "").toLowerCase().includes(filterKeyword)) : chunks;
  const filteredEvents = filterKeyword ? events.filter((e) => e.title.toLowerCase().includes(filterKeyword)) : events;
  const filteredEntities = filterKeyword ? entities.filter((e) => e.name.toLowerCase().includes(filterKeyword)) : entities;

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 48px)" }}>
      {/* Left panel */}
      <div style={{ width: 340, borderRight: "1px solid #f0f0f0", padding: 12, overflow: "auto", flexShrink: 0 }}>
        {/* Stats */}
        <Row gutter={8} style={{ marginBottom: 12 }}>
          {[
            { label: t("文档", "Docs"), value: stats?.documentCount ?? 0 },
            { label: t("切片", "Chunks"), value: stats?.chunkCount ?? 0 },
            { label: t("事件", "Events"), value: stats?.eventCount ?? 0 },
            { label: t("实体", "Entities"), value: stats?.entityCount ?? 0 },
          ].map((m) => (
            <Col span={6} key={m.label}>
              <Card size="small" style={{ textAlign: "center", background: "#fafafa" }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{m.value}</div>
                <div style={{ fontSize: 10, color: "#999" }}>{m.label}</div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Upload queue */}
        {uploadJobs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button
              style={{
                width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 10px", border: "1px solid #f0f0f0", borderRadius: 6,
                background: "none", cursor: "pointer", fontSize: 12,
              }}
              onClick={() => setUploadQueueExpanded(!uploadQueueExpanded)}
            >
              <span>
                <Text type="secondary" style={{ fontSize: 11 }}>{t("处理队列", "Processing queue")}</Text>
                {hasActiveUploads
                  ? <Text style={{ fontSize: 11, marginLeft: 8 }}>{t(`${uploadJobs.filter(j => j.status === "QUEUED" || j.status === "RUNNING").length} 个处理中`, `${uploadJobs.filter(j => j.status === "QUEUED" || j.status === "RUNNING").length} active`)}</Text>
                  : null}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {hasActiveUploads && <LoadingOutlined style={{ fontSize: 12 }} />}
                <Tag style={{ fontSize: 10 }}>{uploadQueueExpanded ? t("收起", "Hide") : t("展开", "Show")}</Tag>
              </span>
            </button>
            {uploadQueueExpanded && uploadJobs.map((job) => (
              <Card key={job.id} size="small" style={{ marginTop: 4 }}
                bodyStyle={{ padding: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {job.title || job.fileName}
                  </Text>
                  <Tag color={job.status === "FAILED" ? "red" : job.status === "COMPLETED" ? "green" : "blue"} style={{ fontSize: 10 }}>
                    {job.status === "QUEUED" ? t("排队中", "Queued") :
                     job.status === "RUNNING" ? t("处理中", "Processing") :
                     job.status === "COMPLETED" ? t("完成", "Completed") : t("失败", "Failed")}
                  </Tag>
                </div>
                <Progress
                  percent={Math.round(job.progress)}
                  size="small"
                  status={job.status === "FAILED" ? "exception" : job.status === "COMPLETED" ? "success" : "active"}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999" }}>
                  <span>{job.stage} · {job.message}</span>
                  <span>{Math.round(job.progress)}%</span>
                </div>
                {job.status === "COMPLETED" && (
                  <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                    {t(`已生成 ${job.chunkCount ?? 0} 切片, ${job.eventCount ?? 0} 事件`, `${job.chunkCount ?? 0} chunk(s), ${job.eventCount ?? 0} event(s)`)}
                  </div>
                )}
                {job.error && <div style={{ fontSize: 10, color: "red", marginTop: 2 }}>{job.error}</div>}
              </Card>
            ))}
          </div>
        )}

        {/* Actions */}
        <Space style={{ marginBottom: 10 }}>
          <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
            {t("添加文档", "Add document")}
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={loadData} />
        </Space>

        {/* Archive toggle */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "#999", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)} />
            {t("显示已归档", "Show archived")}
          </label>
        </div>

        {/* Document list */}
        <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>
          {t(`文档列表 (${documents.length})`, `Documents (${documents.length})`)}
        </div>
        {documents.length === 0 ? (
          <Empty description={t("暂无文档", "No documents")} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ fontSize: 12 }} />
        ) : documents.map((doc) => (
          <div key={doc.id} style={{
            padding: "6px 8px", borderRadius: 4, marginBottom: 2, cursor: "pointer",
            background: doc.id === selectedDocId ? "rgba(22,119,255,0.08)" : undefined,
            border: "1px solid transparent",
          }}
            onClick={() => setSelectedDocId(doc.id)}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <FileTextOutlined style={{ marginTop: 2, color: "#999", fontSize: 12 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {doc.title || doc.fileName}
                </div>
                <div style={{ fontSize: 10, color: "#999" }}>
                  {doc.archivedAt ? t("已归档", "Archived") : `${doc.parseStatus ?? doc.status} · ${doc.createdAt ? formatDate(doc.createdAt) : ""}`}
                </div>
              </div>
            </div>
            {doc.id === selectedDocId && (
              <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
                <Button size="small" type="link" style={{ fontSize: 10, padding: 0 }} onClick={(e) => { e.stopPropagation(); handleRename(doc); }}>
                  {t("重命名", "Rename")}
                </Button>
                <Button size="small" type="link" style={{ fontSize: 10, padding: 0 }} onClick={(e) => { e.stopPropagation(); handleArchive(doc); }}>
                  {doc.archivedAt ? t("恢复", "Restore") : t("归档", "Archive")}
                </Button>
                <Popconfirm
                  title={t("永久删除此文档？此操作不可恢复。", "Permanently delete? This cannot be undone.")}
                  onConfirm={() => handleDelete(doc)}
                  okText={t("删除", "Delete")}
                  cancelText={t("取消", "Cancel")}
                >
                  <Button size="small" type="link" danger style={{ fontSize: 10, padding: 0 }}
                    onClick={(e) => e.stopPropagation()}>
                    {t("删除", "Delete")}
                  </Button>
                </Popconfirm>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {!selectedDoc ? (
          <Empty description={t("选择左侧文档查看详情", "Select a document to view details")} style={{ marginTop: 80 }} />
        ) : (
          <>
            {/* Result view tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
              {(["overview", "chunks", "events", "entities", "search"] as ResultView[]).map((v) => (
                <Button
                  key={v}
                  size="small"
                  type={resultView === v ? "primary" : "default"}
                  ghost={resultView !== v}
                  onClick={() => setResultView(v)}
                >
                  {v === "overview" ? t("概览", "Overview") :
                   v === "chunks" ? t("切片", "Chunks") :
                   v === "events" ? t("事件", "Events") :
                   v === "entities" ? t("实体", "Entities") : t("检索", "Search")}
                </Button>
              ))}
            </div>

            {/* Overview */}
            {resultView === "overview" && selectedDoc && (
              <div>
                <Descriptions size="small" column={3} bordered>
                  <Descriptions.Item label={t("标题", "Title")}>{selectedDoc.title || selectedDoc.fileName}</Descriptions.Item>
                  <Descriptions.Item label={t("状态", "Status")}><Tag>{selectedDoc.parseStatus ?? selectedDoc.status}</Tag></Descriptions.Item>
                  <Descriptions.Item label={t("创建时间", "Created")}>{selectedDoc.createdAt ? formatDate(selectedDoc.createdAt) : "-"}</Descriptions.Item>
                </Descriptions>
                <Row gutter={8} style={{ marginTop: 12 }}>
                  <Col span={6}><Card size="small"><Statistic title={t("切片", "Chunks")} value={chunks.length} /></Card></Col>
                  <Col span={6}><Card size="small"><Statistic title={t("事件", "Events")} value={events.length} /></Card></Col>
                  <Col span={6}><Card size="small"><Statistic title={t("实体", "Entities")} value={entities.length} /></Card></Col>
                  <Col span={6}><Card size="small"><Statistic title={t("有向量", "Vectors")} value={chunks.filter(c => c.embedding).length} /></Card></Col>
                </Row>
              </div>
            )}

            {/* Chunks */}
            {resultView === "chunks" && (
              <div>
                <Input.Search
                  placeholder={t("按标题搜索切片...", "Search chunk titles...")}
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  style={{ width: 280, marginBottom: 12 }}
                  allowClear
                />
                {filteredChunks.length === 0 ? (
                  <Empty description={t("暂无切片", "No chunks")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : filteredChunks.slice((resultPage - 1) * PAGE_SIZE, resultPage * PAGE_SIZE).map((chunk) => (
                  <Card key={chunk.id} size="small" style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text strong>{chunk.heading || t("未命名切片", "Untitled chunk")}</Text>
                      {chunk.rank != null && <Tag>Rank {chunk.rank}</Tag>}
                    </div>
                    <Paragraph ellipsis={{ rows: 5, expandable: true, symbol: t("展开", "more") }}
                      style={{ fontSize: 12, whiteSpace: "pre-wrap", margin: 0 }}>
                      {chunk.content}
                    </Paragraph>
                  </Card>
                ))}
                <Pagination page={resultPage} total={filteredChunks.length} onChange={setResultPage} />
              </div>
            )}

            {/* Events */}
            {resultView === "events" && (
              <div>
                <Input.Search
                  placeholder={t("按标题搜索事件...", "Search event titles...")}
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  style={{ width: 280, marginBottom: 12 }}
                  allowClear
                />
                {filteredEvents.length === 0 ? (
                  <Empty description={t("暂无事件", "No events")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : filteredEvents.slice((resultPage - 1) * PAGE_SIZE, resultPage * PAGE_SIZE).map((event) => (
                  <Card key={event.id} size="small" style={{ marginBottom: 8 }}>
                    <Button type="link" style={{ padding: 0, fontWeight: 600 }}
                      onClick={() => openEventDetail(event.id)}>
                      {event.title}
                    </Button>
                    <Paragraph ellipsis={{ rows: 2 }} style={{ fontSize: 12, margin: "4px 0" }}>
                      {event.summary || event.content}
                    </Paragraph>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(event.entities ?? []).map((e) => (
                        <Tag key={e.id} style={{ cursor: "pointer" }}
                          onClick={() => openEntityDetail(e.id)}>
                          {e.name}
                        </Tag>
                      ))}
                      {(!event.entities || event.entities.length === 0) && (
                        <Tag>{t(`${event.entityCount ?? 0} 个实体`, `${event.entityCount ?? 0} entities`)}</Tag>
                      )}
                    </div>
                  </Card>
                ))}
                <Pagination page={resultPage} total={filteredEvents.length} onChange={setResultPage} />
              </div>
            )}

            {/* Entities */}
            {resultView === "entities" && (
              <div>
                <Input.Search
                  placeholder={t("按名称搜索实体...", "Search entity names...")}
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  style={{ width: 280, marginBottom: 12 }}
                  allowClear
                />
                {filteredEntities.length === 0 ? (
                  <Empty description={t("暂无实体", "No entities")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : filteredEntities.slice((resultPage - 1) * PAGE_SIZE, resultPage * PAGE_SIZE).map((entity) => (
                  <Card key={entity.id} size="small" style={{ marginBottom: 8, cursor: "pointer" }}
                    onClick={() => openEntityDetail(entity.id)}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <Text strong>{entity.name}</Text>
                        <Tag style={{ marginLeft: 6 }}>{entity.type}</Tag>
                      </div>
                      <Tag>{t(`${entity.eventCount ?? 0} 事件`, `${entity.eventCount ?? 0} events`)}</Tag>
                    </div>
                    {entity.description && (
                      <Paragraph ellipsis={{ rows: 1 }} style={{ fontSize: 12, margin: "4px 0", color: "#999" }}>
                        {entity.description}
                      </Paragraph>
                    )}
                  </Card>
                ))}
                <Pagination page={resultPage} total={filteredEntities.length} onChange={setResultPage} />
              </div>
            )}

            {/* Search */}
            {resultView === "search" && (
              <div>
                {/* Mode toggle */}
                <Card size="small" style={{ marginBottom: 12, background: "#fafafa" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <Text strong style={{ fontSize: 12 }}>{t("检索模式", "Search mode")}</Text>
                    <Space.Compact size="small">
                      {(["fast", "standard"] as SearchMode[]).map((mode) => (
                        <Button
                          key={mode}
                          size="small"
                          type={searchMode === mode ? "primary" : "default"}
                          ghost={searchMode !== mode}
                          onClick={() => setSearchMode(mode)}
                        >
                          {mode === "fast" ? t("极速", "Fast") : t("标准", "Standard")}
                        </Button>
                      ))}
                    </Space.Compact>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {searchMode === "fast"
                        ? t("实体匹配 + rerank，不走 LLM", "Entity matching + rerank, no LLM")
                        : t("LLM 抽取实体 + LLM 重排", "LLM entity extraction + LLM rerank")}
                    </Text>
                  </div>
                </Card>

                <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onPressEnter={handleSearch}
                    placeholder={t("输入检索问题", "Enter a search question")}
                  />
                  <Button icon={<SearchOutlined />} loading={searching} onClick={handleSearch}>
                    {t("搜索", "Search")}
                  </Button>
                </Space.Compact>

                {searchResult ? (
                  <div>
                    {searchResult.sections.map((section) => (
                      <Card key={section.chunkId} size="small" style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <Text strong>{section.heading || t("结果切片", "Result chunk")}</Text>
                          <Tag>{section.score.toFixed(3)}</Tag>
                        </div>
                        <Paragraph ellipsis={{ rows: 5, expandable: true, symbol: t("展开", "more") }}
                          style={{ fontSize: 12, whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                          {section.content}
                        </Paragraph>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Empty description={t("还没有检索结果", "No search results yet")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        projectId={projectId}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => { loadData(); props.onProjectsChange(); }}
        t={t}
      />

      <DetailDrawer
        open={detailOpen}
        type={detailType}
        data={detailData}
        onClose={() => setDetailOpen(false)}
        t={t}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini pagination
// ---------------------------------------------------------------------------

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid #f0f0f0", marginTop: 8 }}>
      <Text type="secondary" style={{ fontSize: 11 }}>
        {from}-{to} / {total}
      </Text>
      <Space size={4}>
        <Button size="small" disabled={page <= 1} onClick={() => onChange(Math.max(1, page - 1))}>
          { "←" }
        </Button>
        <Button size="small" disabled={page >= totalPages} onClick={() => onChange(Math.min(totalPages, page + 1))}>
          { "→" }
        </Button>
      </Space>
    </div>
  );
}
