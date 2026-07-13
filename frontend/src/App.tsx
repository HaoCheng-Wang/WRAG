/** WRAG Main Application — Ant Design layout with 5 tabs + project rail + settings. */

import { useState, useEffect, useCallback } from "react";
import {
  Layout, Menu, Tabs, message, Spin, ConfigProvider, theme, Button, Tooltip,
} from "antd";
import {
  MessageOutlined, FileTextOutlined, ShareAltOutlined,
  ApiOutlined, FileMarkdownOutlined, SettingOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useI18n } from "./i18n";
import { api } from "./lib/api";
import type { SourceRecord } from "./types";
import Chat from "./pages/Chat";
import Documents from "./pages/Documents";
import Graph from "./pages/Graph";
import Mcp from "./pages/Mcp";
import MarkdownFiles from "./pages/MarkdownFiles";
import ProjectRail from "./components/ProjectRail";
import SettingsPanel from "./components/SettingsPanel";
import ActivityPanel from "./components/ActivityPanel";

const { Sider, Content } = Layout;

export default function App() {
  const { t, lang, setLang } = useI18n();

  // State
  const [projects, setProjects] = useState<SourceRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("chat");
  const [loading, setLoading] = useState(true);
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  // Activity panel state (search traces / logs from Chat page)
  const [activityMode, setActivityMode] = useState<"trace" | "logs">("trace");
  const [searchTrace, setSearchTrace] = useState<any[]>([]);
  const [rawLogs, setRawLogs] = useState<any[]>([]);

  // Chat session
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Load projects on mount
  const loadProjects = useCallback(async () => {
    try {
      const data = await api.listProjects();
      setProjects(data.projects ?? []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Auto-select first project
  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId]);

  // Theme
  const { token: themeToken } = theme.useToken();

  // i18n helpers
  const tabItems = [
    { key: "chat", label: t("对话", "Chat"), icon: <MessageOutlined /> },
    { key: "docs", label: t("文档", "Docs"), icon: <FileTextOutlined /> },
    { key: "graph", label: t("图谱", "Graph"), icon: <ShareAltOutlined /> },
    { key: "mcp", label: "MCP", icon: <ApiOutlined /> },
    { key: "markdown", label: t("MD文件", "MD Files"), icon: <FileMarkdownOutlined /> },
  ];

  const activeProject = projects.find((p) => p.id === activeProjectId);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" tip={t("加载中...", "Loading...")} />
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff", borderRadius: 6 },
      }}
    >
      <Layout style={{ height: "100vh" }}>
        {/* Left Project Rail */}
        <Sider
          width={220}
          collapsedWidth={60}
          collapsible
          collapsed={siderCollapsed}
          onCollapse={setSiderCollapsed}
          trigger={null}
          style={{ background: themeToken.colorBgContainer, borderRight: `1px solid ${themeToken.colorBorderSecondary}` }}
        >
          <ProjectRail
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
            onProjectsChange={loadProjects}
            collapsed={siderCollapsed}
            t={t}
          />
        </Sider>

        {/* Main Area */}
        <Layout>
          {/* Top Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              height: 48,
              background: themeToken.colorBgContainer,
              borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
            }}
          >
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
              <span style={{ fontSize: 13, color: themeToken.colorTextSecondary }}>
                {activeProject ? activeProject.name : t("未选择项目", "No project")}
              </span>
              <Tooltip title={t("设置", "Settings")}>
                <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} />
              </Tooltip>
            </div>
          </div>

          {/* Content */}
          <Content style={{ overflow: "auto", position: "relative" }}>
            {!activeProjectId ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: themeToken.colorTextSecondary }}>
                {t("请先创建或选择一个项目", "Please create or select a project first")}
              </div>
            ) : (
              <>
                {activeTab === "chat" && (
                  <Chat
                    projectId={activeProjectId}
                    sessionId={activeSessionId}
                    onSessionChange={setActiveSessionId}
                    onTraceUpdate={setSearchTrace}
                    onLogUpdate={setRawLogs}
                    onActivityOpen={setActivityOpen}
                    onActivityMode={setActivityMode}
                    t={t}
                  />
                )}
                {activeTab === "docs" && (
                  <Documents
                    projectId={activeProjectId}
                    onProjectsChange={loadProjects}
                    t={t}
                  />
                )}
                {activeTab === "graph" && (
                  <Graph projectId={activeProjectId} t={t} />
                )}
                {activeTab === "mcp" && (
                  <Mcp projectId={activeProjectId} t={t} />
                )}
                {activeTab === "markdown" && (
                  <MarkdownFiles projects={projects} t={t} />
                )}
              </>
            )}
          </Content>
        </Layout>

        {/* Right Activity Panel */}
        {activityOpen && activeTab === "chat" && (
          <Sider width={360} style={{ background: themeToken.colorBgContainer, borderLeft: `1px solid ${themeToken.colorBorderSecondary}`, overflow: "auto" }}>
            <ActivityPanel
              mode={activityMode}
              trace={searchTrace}
              logs={rawLogs}
              onClose={() => setActivityOpen(false)}
              onModeChange={setActivityMode}
              t={t}
            />
          </Sider>
        )}
      </Layout>

      {/* Settings Drawer */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        t={t}
        lang={lang}
        onLangChange={setLang}
      />
    </ConfigProvider>
  );
}
