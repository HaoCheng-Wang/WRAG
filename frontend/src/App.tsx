/** WRAG Main Application — Ant Design layout with 5 tabs + project rail + activity panel.
 *
 *  Central state management matching SAG's AppShell:
 *  - Projects + sessions by project
 *  - MCP chat state (detail, streaming, process steps)
 *  - Upload job tracking with auto-polling
 *  - Model call log syncing
 *  - Detail drawer for events/entities/citations
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Layout, Tabs, Button, ConfigProvider, theme, Tooltip, Spin,
  Card, Tag, Row, Col,
} from "antd";
import {
  MessageOutlined, FileTextOutlined, ShareAltOutlined,
  ApiOutlined, FileMarkdownOutlined, SettingOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useI18n } from "./i18n";
import { api } from "./lib/api";
import { makeStepId } from "./lib/markdown";
import type {
  SourceRecord, McpSessionRecord, McpSessionDetail, ProcessStep,
  RunningMcpSearch, UploadJobRecord, ModelCallLogRecord, DetailDrawer,
} from "./types";
import Chat from "./pages/Chat";
import Documents from "./pages/Documents";
import Graph from "./pages/Graph";
import Mcp from "./pages/Mcp";
import MarkdownFiles from "./pages/MarkdownFiles";
import ProjectRail from "./components/ProjectRail";
import SettingsPanel from "./components/SettingsPanel";
import ActivityPanel from "./components/ActivityPanel";

const { Sider, Content } = Layout;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_LOGS_KEY = "wrag:model-call-logs:v1";
const MODEL_LOG_CURSOR_KEY = "wrag:model-call-log-cursor:v1";
const MAX_BROWSER_MODEL_LOGS = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadModelLogs(): ModelCallLogRecord[] {
  try {
    const raw = localStorage.getItem(MODEL_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_BROWSER_MODEL_LOGS) : [];
  } catch { return []; }
}

function loadModelLogCursor(): number {
  const v = Number(localStorage.getItem(MODEL_LOG_CURSOR_KEY));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function persistModelLogs(logs: ModelCallLogRecord[]) {
  for (const limit of [MAX_BROWSER_MODEL_LOGS, 100, 50, 20]) {
    try { localStorage.setItem(MODEL_LOGS_KEY, JSON.stringify(logs.slice(-limit))); return; }
    catch { /* quota exceeded, try smaller */ }
  }
  try { localStorage.removeItem(MODEL_LOGS_KEY); } catch { /* ignore */ }
}

function mergeModelLogs(current: ModelCallLogRecord[], incoming: ModelCallLogRecord[]): ModelCallLogRecord[] {
  const byId = new Map<string, ModelCallLogRecord>();
  for (const log of [...current, ...incoming]) byId.set(log.id, log);
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence).slice(-MAX_BROWSER_MODEL_LOGS);
}

// ---------------------------------------------------------------------------
// App Shell
// ---------------------------------------------------------------------------

export default function App() {
  const { t, lang, preference: langPref, setPreference: setLangPref } = useI18n();

  // -- Core state --
  const [projects, setProjects] = useState<SourceRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("chat");
  const [loading, setLoading] = useState(true);
  const [siderCollapsed, setSiderCollapsed] = useState(false);

  // -- Settings --
  const [settingsOpen, setSettingsOpen] = useState(false);

  // -- Activity panel (right sidebar) --
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityMode, setActivityMode] = useState<"trace" | "logs">("trace");
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]);
  const [modelLogs, setModelLogs] = useState<ModelCallLogRecord[]>(() => loadModelLogs());
  const [modelLogCursor, setModelLogCursor] = useState(() => loadModelLogCursor());
  const modelLogCursorRef = useRef(modelLogCursor);

  // -- MCP Session state --
  const [sessionsByProjectId, setSessionsByProjectId] = useState<Record<string, McpSessionRecord[]>>({});
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [mcpDetail, setMcpDetail] = useState<McpSessionDetail | null>(null);
  const [isMcpRunning, setIsMcpRunning] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState("");
  const [streamingAssistantText, setStreamingAssistantText] = useState("");
  const [runningMcpSearches, setRunningMcpSearches] = useState<RunningMcpSearch[]>([]);

  // -- Upload jobs --
  const [uploadJobs, setUploadJobs] = useState<UploadJobRecord[]>([]);
  const uploadJobIntervalRef = useRef<number | null>(null);

  // -- Detail drawer --
  const [drawer, setDrawer] = useState<DetailDrawer>(null);

  // -- Show archived --
  const [showArchived, setShowArchived] = useState(false);

  // -----------------------------------------------------------------------
  // Bootstrap
  // -----------------------------------------------------------------------

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.listProjects(showArchived);
      setProjects(data.projects ?? []);
    } catch (e: any) { /* silent */ }
    finally { setLoading(false); }
  }, [showArchived]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Auto-select first project
  useEffect(() => {
    if (!activeProjectId && projects.length > 0 && !loading) {
      const first = projects.find((p) => !p.archivedAt);
      if (first) setActiveProjectId(first.id);
    }
  }, [projects, activeProjectId, loading]);

  // Expand selected project
  useEffect(() => {
    if (!activeProjectId) return;
    setExpandedProjectIds((prev) => {
      if (prev.has(activeProjectId)) return prev;
      const next = new Set(prev);
      next.add(activeProjectId);
      return next;
    });
  }, [activeProjectId]);

  // Persist model log cursor
  useEffect(() => {
    modelLogCursorRef.current = modelLogCursor;
    localStorage.setItem(MODEL_LOG_CURSOR_KEY, String(modelLogCursor));
  }, [modelLogCursor]);

  // Persist model logs
  useEffect(() => { persistModelLogs(modelLogs); }, [modelLogs]);

  // -----------------------------------------------------------------------
  // Load sessions for active project
  // -----------------------------------------------------------------------

  const loadSessions = useCallback(async (projectId: string) => {
    try {
      const data = await api.listMcpSessions(projectId);
      setSessionsByProjectId((prev) => ({ ...prev, [projectId]: data.sessions ?? [] }));
      // Auto-load first session
      const sessions = data.sessions ?? [];
      if (sessions.length > 0 && !mcpDetail) {
        const detail = await api.getMcpSession(sessions[0].id);
        setMcpDetail(detail);
        setActiveSessionId(sessions[0].id);
      }
    } catch { /* silent */ }
  }, [mcpDetail]);

  useEffect(() => {
    if (activeProjectId) loadSessions(activeProjectId);
  }, [activeProjectId]);

  // -----------------------------------------------------------------------
  // Upload job polling
  // -----------------------------------------------------------------------

  useEffect(() => {
    const activeJobs = uploadJobs.filter((j) => j.status === "QUEUED" || j.status === "RUNNING");
    if (activeJobs.length === 0) return;

    const timer = window.setInterval(async () => {
      try {
        const responses = await Promise.all(activeJobs.map((j) => api.getUploadJob(j.id)));
        const latestJobs = responses.map((r) => r.job);
        setUploadJobs((prev) =>
          prev.map((job) => latestJobs.find((l) => l.id === job.id) ?? job)
        );
        // If all completed, refresh project
        if (latestJobs.every((j) => j.status === "COMPLETED" || j.status === "FAILED")) {
          loadProjects();
        }
      } catch { /* polling errors are ok */ }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [uploadJobs.filter(j => j.status === "QUEUED" || j.status === "RUNNING").length]);

  // -----------------------------------------------------------------------
  // Model log syncing
  // -----------------------------------------------------------------------

  const syncModelLogs = useCallback(async () => {
    try {
      const res = await api.listModelCallLogs(modelLogCursorRef.current);
      if (res.latestSequence < modelLogCursorRef.current) {
        // Server restarted — reset
        modelLogCursorRef.current = 0;
        setModelLogCursor(0);
        setModelLogs([]);
        if (res.latestSequence === 0) return;
        const fresh = await api.listModelCallLogs(0);
        if (fresh.logs.length > 0) setModelLogs(fresh.logs.slice(-MAX_BROWSER_MODEL_LOGS));
        modelLogCursorRef.current = fresh.latestSequence;
        setModelLogCursor(fresh.latestSequence);
        return;
      }
      if (res.logs.length > 0) {
        setModelLogs((prev) => mergeModelLogs(prev, res.logs));
      }
      if (res.latestSequence > modelLogCursorRef.current) {
        modelLogCursorRef.current = res.latestSequence;
        setModelLogCursor(res.latestSequence);
      }
    } catch { /* logs are best-effort */ }
  }, []);

  const clearModelLogs = useCallback(async () => {
    try {
      const res = await api.listModelCallLogs(modelLogCursorRef.current);
      if (res.latestSequence !== modelLogCursorRef.current) {
        modelLogCursorRef.current = res.latestSequence;
        setModelLogCursor(res.latestSequence);
      }
    } catch { /* ignore */ }
    setModelLogs([]);
    localStorage.removeItem(MODEL_LOGS_KEY);
    localStorage.setItem(MODEL_LOG_CURSOR_KEY, String(modelLogCursorRef.current));
  }, []);

  // Auto-sync logs when activity panel is open on logs tab
  useEffect(() => {
    if (activityMode !== "logs" && !isMcpRunning) return;
    const timer = window.setInterval(() => { syncModelLogs(); }, 2000);
    return () => window.clearInterval(timer);
  }, [activityMode, isMcpRunning, syncModelLogs]);

  // -----------------------------------------------------------------------
  // Session actions
  // -----------------------------------------------------------------------

  const handleCreateSession = useCallback(async (projectId: string) => {
    try {
      const res = await api.createMcpSession({ sourceIds: [projectId] });
      setActiveTab("chat");
      loadSessions(projectId);
      const detail = await api.getMcpSession(res.session.id);
      setMcpDetail(detail);
      setActiveSessionId(res.session.id);
    } catch (e: any) { /* silent */ }
  }, [loadSessions]);

  const handleSelectSession = useCallback(async (projectId: string, sessionId: string) => {
    setActiveTab("chat");
    if (activeProjectId !== projectId) {
      setActiveProjectId(projectId);
    }
    try {
      const detail = await api.getMcpSession(sessionId);
      setMcpDetail(detail);
      setActiveSessionId(sessionId);
    } catch { /* silent */ }
  }, [activeProjectId]);

  const toggleProjectExpanded = useCallback((projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Detail drawer
  // -----------------------------------------------------------------------

  const openCitationDetail = useCallback((citation: any) => {
    setDrawer({ type: "citation", citation });
  }, []);

  const openEventDetail = useCallback(async (eventId: string) => {
    try {
      const detail = await api.getEvent(eventId);
      setDrawer({ type: "event", detail });
    } catch { /* silent */ }
  }, []);

  const openEntityDetail = useCallback(async (entityId: string) => {
    try {
      const detail = await api.getEntity(entityId);
      setDrawer({ type: "entity", detail });
    } catch { /* silent */ }
  }, []);

  // -----------------------------------------------------------------------
  // Theme token
  // -----------------------------------------------------------------------

  const { token: themeToken } = theme.useToken();

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const showActivityPanel = activeTab === "chat" && activityOpen;

  // -----------------------------------------------------------------------
  // Tabs
  // -----------------------------------------------------------------------

  const tabItems = [
    { key: "chat", label: t("对话", "Chat"), icon: <MessageOutlined /> },
    { key: "docs", label: t("文档", "Docs"), icon: <FileTextOutlined /> },
    { key: "graph", label: t("图谱", "Graph"), icon: <ShareAltOutlined /> },
    { key: "mcp", label: "MCP", icon: <ApiOutlined /> },
    { key: "markdown", label: t("MD文件", "MD Files"), icon: <FileMarkdownOutlined /> },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" tip={t("加载中...", "Loading...")} />
      </div>
    );
  }

  return (
    <ConfigProvider theme={{
      algorithm: theme.defaultAlgorithm,
      token: { colorPrimary: "#1677ff", borderRadius: 6 },
    }}>
      <Layout style={{ height: "100vh" }}>
        {/* Left Rail */}
        <Sider
          width={220}
          collapsedWidth={60}
          collapsible
          collapsed={siderCollapsed}
          onCollapse={setSiderCollapsed}
          trigger={null}
          style={{
            background: themeToken.colorBgContainer,
            borderRight: `1px solid ${themeToken.colorBorderSecondary}`,
          }}
        >
          <ProjectRail
            projects={projects}
            activeProjectId={activeProjectId}
            sessionsByProjectId={sessionsByProjectId}
            expandedProjectIds={expandedProjectIds}
            activeSessionId={activeSessionId}
            isSessionBusy={isMcpRunning}
            showArchived={showArchived}
            collapsed={siderCollapsed}
            isSettingsOpen={settingsOpen}
            onSelectProject={(id) => { setActiveProjectId(id); }}
            onProjectsChange={loadProjects}
            onToggleProjectExpanded={toggleProjectExpanded}
            onSelectSession={handleSelectSession}
            onCreateSession={handleCreateSession}
            onToggleArchived={setShowArchived}
            onOpenSettings={() => setSettingsOpen(true)}
            t={t}
          />
        </Sider>

        {/* Main Area */}
        <Layout>
          {/* Top Bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", height: 48, flexShrink: 0,
            background: themeToken.colorBgContainer,
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button
                type="text"
                icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setSiderCollapsed(!siderCollapsed)}
              />
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                style={{ marginBottom: 0 }}
                tabBarStyle={{ marginBottom: 0 }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#999" }}>
                {activeProject ? activeProject.name : t("未选择项目", "No project")}
              </span>
              <Tooltip title={t("设置", "Settings")}>
                <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} />
              </Tooltip>
            </div>
          </div>

          {/* Content */}
          <Content style={{ overflow: "hidden", position: "relative" }}>
            {!activeProjectId ? (
              <div style={{
                display: "flex", justifyContent: "center", alignItems: "center",
                height: "100%", color: "#999",
              }}>
                {t("请先创建或选择一个项目", "Please create or select a project first")}
              </div>
            ) : (
              <>
                {activeTab === "chat" && (
                  <Chat
                    projectId={activeProjectId}
                    project={activeProject}
                    mcpDetail={mcpDetail}
                    isMcpRunning={isMcpRunning}
                    pendingUserMessage={pendingUserMessage}
                    streamingAssistantText={streamingAssistantText}
                    runningMcpSearches={runningMcpSearches}
                    processSteps={processSteps}
                    onMcpDetailChange={setMcpDetail}
                    onIsMcpRunningChange={setIsMcpRunning}
                    onPendingUserMessageChange={setPendingUserMessage}
                    onStreamingAssistantTextChange={setStreamingAssistantText}
                    onRunningMcpSearchesChange={setRunningMcpSearches}
                    onProcessStepsChange={setProcessSteps}
                    onTraceUpdate={() => {}}
                    onLogUpdate={(newLogs) => {
                      if (newLogs.length > 0) {
                        setModelLogs((prev) => mergeModelLogs(prev, newLogs as any));
                      }
                    }}
                    onActivityOpen={setActivityOpen}
                    onActivityMode={setActivityMode}
                    onSessionCreated={(sid) => {
                      setActiveSessionId(sid);
                      loadSessions(activeProjectId);
                    }}
                    t={t}
                  />
                )}
                {activeTab === "docs" && (
                  <Documents
                    projectId={activeProjectId}
                    project={activeProject}
                    uploadJobs={uploadJobs}
                    onUploadJobsChange={setUploadJobs}
                    onProjectsChange={loadProjects}
                    onOpenEventDetail={openEventDetail}
                    onOpenEntityDetail={openEntityDetail}
                    t={t}
                  />
                )}
                {activeTab === "graph" && (
                  <Graph
                    projectId={activeProjectId}
                    onOpenEventDetail={openEventDetail}
                    onOpenEntityDetail={openEntityDetail}
                    t={t}
                  />
                )}
                {activeTab === "mcp" && (
                  <Mcp
                    projectId={activeProjectId}
                    project={activeProject}
                    projects={projects}
                    onProjectsChange={loadProjects}
                    t={t}
                  />
                )}
                {activeTab === "markdown" && (
                  <MarkdownFiles projects={projects} t={t} />
                )}
              </>
            )}
          </Content>
        </Layout>

        {/* Right Activity Panel */}
        {showActivityPanel && (
          <Sider width={360} style={{
            background: "#fff",
            borderLeft: "1px solid #f0f0f0",
            overflow: "auto",
          }}>
            <ActivityPanel
              mode={activityMode}
              processSteps={processSteps}
              modelLogs={modelLogs}
              onClose={() => setActivityOpen(false)}
              onModeChange={setActivityMode}
              onSyncLogs={syncModelLogs}
              onClearLogs={clearModelLogs}
              t={t}
            />
          </Sider>
        )}

        {/* Detail Drawer */}
        {drawer && (
          <DetailDrawerWrapper
            drawer={drawer}
            onClose={() => setDrawer(null)}
            onOpenEvent={openEventDetail}
            onOpenEntity={openEntityDetail}
            t={t}
          />
        )}
      </Layout>

      {/* Settings Drawer */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        t={t}
        lang={lang}
        langPref={langPref}
        onLangPrefChange={setLangPref}
      />
    </ConfigProvider>
  );
}

// ---------------------------------------------------------------------------
// Detail Drawer Wrapper
// ---------------------------------------------------------------------------

function DetailDrawerWrapper(props: {
  drawer: Exclude<DetailDrawer, null>;
  onClose: () => void;
  onOpenEvent: (id: string) => void;
  onOpenEntity: (id: string) => void;
  t: (zh: string, en: string) => string;
}) {
  const { drawer, onClose, onOpenEvent, onOpenEntity, t } = props;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 20, background: "rgba(0,0,0,0.2)" }}
      onClick={onClose}>
      <aside style={{
        position: "absolute", right: 0, top: 0, bottom: 0,
        width: "100%", maxWidth: 440, background: "#fff",
        borderLeft: "1px solid #f0f0f0", boxShadow: "-2px 0 8px rgba(0,0,0,0.08)",
        display: "flex", flexDirection: "column",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: "1px solid #f0f0f0",
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {drawer.type === "event" ? drawer.detail.event.title :
               drawer.type === "entity" ? drawer.detail.entity.name :
               t(`引用 ${drawer.citation.index}`, `Citation ${drawer.citation.index}`)}
            </div>
            <div style={{ fontSize: 11, color: "#999" }}>
              {drawer.type === "event" ? t("事件详情", "Event details") :
               drawer.type === "entity" ? t("实体详情", "Entity details") :
               t("引用原文", "Source citation")}
            </div>
          </div>
          <Button type="text" size="small" onClick={onClose}>{t("关闭", "Close")}</Button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {drawer.type === "event" && <EventDetailContent detail={drawer.detail} onOpenEntity={onOpenEntity} t={t} />}
          {drawer.type === "entity" && <EntityDetailContent detail={drawer.detail} onOpenEvent={onOpenEvent} t={t} />}
          {drawer.type === "citation" && <CitationDetailContent citation={drawer.citation} t={t} />}
        </div>
      </aside>
    </div>
  );
}

function EventDetailContent({ detail, onOpenEntity, t }: {
  detail: any; onOpenEntity: (id: string) => void; t: (zh: string, en: string) => string;
}) {
  return (
    <div>
      <InfoRow label={t("所属文档", "Source document")} value={detail.document?.title ?? t("未知", "Unknown")} />
      <InfoRow label={t("事件内容", "Event content")} value={detail.event.content || detail.event.summary} multiline />
      {detail.entities?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{t("关联实体", "Related entities")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {detail.entities.map((e: any) => (
              <Tag key={e.id} style={{ cursor: "pointer" }} onClick={() => onOpenEntity(e.id)}>{e.name}</Tag>
            ))}
          </div>
        </div>
      )}
      {detail.chunk && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{t("关联切片", "Related chunk")}</div>
          <Card size="small">
            <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{detail.chunk.heading}</div>
            <p style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{detail.chunk.content}</p>
          </Card>
        </div>
      )}
    </div>
  );
}

function EntityDetailContent({ detail, onOpenEvent, t }: {
  detail: any; onOpenEvent: (id: string) => void; t: (zh: string, en: string) => string;
}) {
  return (
    <div>
      <InfoRow label={t("类型", "Type")} value={detail.entity.type} />
      <InfoRow label={t("描述", "Description")} value={detail.entity.description || detail.entity.normalizedName} multiline />
      {detail.events?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>
            {t(`关联事件（${detail.events.length}）`, `Related events (${detail.events.length})`)}
          </div>
          {detail.events.map((ev: any) => (
            <Card key={ev.id} size="small" style={{ marginBottom: 6, cursor: "pointer" }}
              onClick={() => onOpenEvent(ev.id)}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{ev.title}</div>
              <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>{ev.summary || ev.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CitationDetailContent({ citation, t }: {
  citation: any; t: (zh: string, en: string) => string;
}) {
  return (
    <div>
      <InfoRow label={t("切片标题", "Chunk title")} value={citation.heading || `[${citation.index}]`} />
      <Row gutter={8}>
        <Col span={12}><InfoRow label={t("排序", "Rank")} value={citation.rank != null ? String(citation.rank) : "-"} /></Col>
        <Col span={12}><InfoRow label={t("得分", "Score")} value={citation.score != null ? citation.score.toFixed(4) : "-"} /></Col>
      </Row>
      {citation.query && <InfoRow label={t("搜索语句", "Search query")} value={citation.query} multiline />}
      <InfoRow label={t("切片 ID", "Chunk ID")} value={citation.chunkId} />
      {citation.documentId && <InfoRow label={t("文档 ID", "Document ID")} value={citation.documentId} />}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{t("原文块", "Original chunk")}</div>
        <Card size="small">
          <p style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6, wordBreak: "break-word" }}>
            {citation.content}
          </p>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: multiline ? "pre-wrap" : undefined, wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

// Detail content components are defined above — no additional imports needed at bottom.
