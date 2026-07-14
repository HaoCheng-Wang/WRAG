/** Left sidebar — project list + per-project MCP session list with expand/collapse.
 *
 *  Matches SAG's ProjectRail:
 *  - Projects listed with expand/collapse chevron
 *  - When expanded: shows MCP sessions under that project
 *  - "New chat" button per selected+expanded project
 *  - Create / Rename / Archive / Delete project actions
 *  - Archive toggle checkbox
 *  - Settings button
 */

import { useState } from "react";
import { Button, Input, Modal, message, Popconfirm, Tooltip, Badge } from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined,
  FolderOpenOutlined, InboxOutlined, SettingOutlined,
  RightOutlined, DownOutlined, MessageOutlined,
} from "@ant-design/icons";
import type { SourceRecord, McpSessionRecord } from "../types";
import { api } from "../lib/api";
import { shortId } from "../lib/markdown";

interface Props {
  projects: SourceRecord[];
  activeProjectId: string | null;
  sessionsByProjectId: Record<string, McpSessionRecord[]>;
  expandedProjectIds: Set<string>;
  activeSessionId: string | null;
  isSessionBusy: boolean;
  showArchived: boolean;
  collapsed: boolean;
  isSettingsOpen: boolean;
  onSelectProject: (id: string) => void;
  onProjectsChange: () => void;
  onToggleProjectExpanded: (id: string) => void;
  onSelectSession: (projectId: string, sessionId: string) => void;
  onCreateSession: (projectId: string) => void;
  onToggleArchived: (v: boolean) => void;
  onOpenSettings: () => void;
  t: (zh: string, en: string) => string;
}

export default function ProjectRail(props: Props) {
  const {
    projects, activeProjectId, sessionsByProjectId, expandedProjectIds,
    activeSessionId, isSessionBusy, showArchived, collapsed, isSettingsOpen, t,
  } = props;

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SourceRecord | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);

  const canCreate = createName.trim().length > 0 && !creating;
  const canRename = renameTarget && renameName.trim().length > 0 && renameName.trim() !== renameTarget.name && !renaming;

  // -- Create project --
  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      await api.createProject({ name: createName.trim() });
      message.success(t("项目已创建", "Project created"));
      setCreateOpen(false);
      setCreateName("");
      props.onProjectsChange();
    } catch (e: any) { message.error(e.message); }
    finally { setCreating(false); }
  };

  // -- Rename --
  const handleRename = async () => {
    if (!canRename || !renameTarget) return;
    setRenaming(true);
    try {
      await api.updateProject(renameTarget.id, { name: renameName.trim() });
      message.success(t("已重命名", "Renamed"));
      setRenameTarget(null);
      props.onProjectsChange();
    } catch (e: any) { message.error(e.message); }
    finally { setRenaming(false); }
  };

  // -- Archive --
  const handleArchive = async (project: SourceRecord) => {
    try {
      if (project.archivedAt) {
        await api.restoreProject(project.id);
      } else {
        await api.archiveProject(project.id);
      }
      props.onProjectsChange();
    } catch (e: any) { message.error(e.message); }
  };

  // -- Delete --
  const handleDelete = async (project: SourceRecord) => {
    try {
      await api.deleteProject(project.id);
      message.success(t("已永久删除", "Permanently deleted"));
      props.onProjectsChange();
    } catch (e: any) { message.error(e.message); }
  };

  const activeProjects = projects.filter((p) => !p.archivedAt);
  const visibleProjects = showArchived ? projects : activeProjects;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: "#1677ff",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <MessageOutlined style={{ color: "#fff", fontSize: 14 }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>WRAG</div>
                <div style={{ fontSize: 10, color: "#999", lineHeight: 1.2 }}>
                  {t("多格式 RAG 知识库", "Multi-Format RAG KB")}
                </div>
              </div>
            </div>
          )}
          <Tooltip title={t("全局设置", "Global settings")}>
            <Button
              type={isSettingsOpen ? "default" : "text"}
              size="small"
              icon={<SettingOutlined />}
              onClick={props.onOpenSettings}
            />
          </Tooltip>
        </div>
      </div>

      {/* Projects label + archive toggle */}
      {!collapsed && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px" }}>
          <span style={{ fontSize: 11, color: "#999", fontWeight: 500 }}>{t("项目", "Projects")}</span>
          <label style={{ fontSize: 11, color: "#999", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={showArchived}
              onChange={(e) => props.onToggleArchived(e.target.checked)} />
            {t("归档", "Archived")}
          </label>
        </div>
      )}

      {/* New project button */}
      <div style={{ padding: collapsed ? "4px" : "4px 12px" }}>
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          block
          onClick={() => { setCreateName(""); setCreateOpen(true); }}
        >
          {!collapsed && t("新建项目", "New project")}
        </Button>
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px 8px" }}>
        {visibleProjects.length === 0 ? (
          <div style={{ padding: "8px 12px", fontSize: 12, color: "#999" }}>
            {t("暂无项目", "No projects yet")}
          </div>
        ) : visibleProjects.map((project) => {
          const selected = project.id === activeProjectId;
          const expanded = expandedProjectIds.has(project.id);
          const sessions = sessionsByProjectId[project.id] ?? [];
          return (
            <div key={project.id} style={{
              borderRadius: 6, marginBottom: 2,
              background: selected ? "rgba(22,119,255,0.08)" : undefined,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 4px" }}>
                {/* Expand chevron */}
                <Button
                  type="text"
                  size="small"
                  style={{ width: 24, height: 28, padding: 0, color: "#999", flexShrink: 0 }}
                  icon={expanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                  onClick={(e) => { e.stopPropagation(); props.onToggleProjectExpanded(project.id); }}
                />
                {/* Project button */}
                <button
                  style={{
                    flex: 1, display: "flex", alignItems: "center", gap: 6,
                    background: "none", border: "none", cursor: "pointer",
                    padding: "4px 4px", borderRadius: 4, textAlign: "left",
                    fontSize: 13, minWidth: 0,
                  }}
                  onClick={() => { setMenuProjectId(null); props.onSelectProject(project.id); }}
                >
                  {expanded || selected
                    ? <FolderOpenOutlined style={{ color: "#999", fontSize: 14, flexShrink: 0 }} />
                    : <FolderOutlined style={{ color: "#999", fontSize: 14, flexShrink: 0 }} />}
                  {!collapsed && (
                    <span style={{ minWidth: 0, lineHeight: 1.3 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                        {project.name}
                      </span>
                      <span style={{ fontSize: 10, color: "#999" }}>
                        {project.archivedAt ? t("已归档", "Archived") : shortId(project.id)}
                      </span>
                    </span>
                  )}
                </button>
                {/* Actions button (hover-visible) */}
                {!collapsed && (
                  <Popconfirm
                    title={null}
                    description={
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <Button type="text" size="small" onClick={() => {
                          setRenameTarget(project); setRenameName(project.name);
                        }}>{t("重命名", "Rename")}</Button>
                        <Button type="text" size="small" onClick={() => handleArchive(project)}>
                          {project.archivedAt ? t("恢复", "Restore") : t("归档", "Archive")}
                        </Button>
                        <Popconfirm
                          title={t("永久删除此项目？此操作不可恢复。", "Permanently delete? This cannot be undone.")}
                          onConfirm={() => handleDelete(project)}
                          okText={t("删除", "Delete")}
                          cancelText={t("取消", "Cancel")}
                        >
                          <Button type="text" size="small" danger>
                            {t("永久删除", "Delete forever")}
                          </Button>
                        </Popconfirm>
                      </div>
                    }
                    icon={null}
                    okButtonProps={{ style: { display: "none" } }}
                    cancelButtonProps={{ style: { display: "none" } }}
                  >
                    <Button type="text" size="small" style={{ width: 22, height: 22, padding: 0, color: "#999", opacity: 0.5 }}>⋯</Button>
                  </Popconfirm>
                )}
              </div>

              {/* Session list (when expanded) */}
              {expanded && !collapsed && (
                <div style={{ paddingLeft: 28, paddingRight: 4, paddingBottom: 4 }}>
                  {selected && (
                    <Button
                      type="text"
                      size="small"
                      icon={<PlusOutlined style={{ fontSize: 11 }} />}
                      style={{ fontSize: 11, color: "#999", padding: "2px 8px", marginBottom: 2 }}
                      disabled={isSessionBusy}
                      onClick={() => props.onCreateSession(project.id)}
                    >
                      {t("新建对话", "New chat")}
                    </Button>
                  )}
                  {sessions.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#ccc", padding: "2px 8px" }}>
                      {t("暂无对话", "No chats")}
                    </div>
                  ) : sessions.map((session) => {
                    const sSelected = session.id === activeSessionId;
                    return (
                      <button
                        key={session.id}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          background: sSelected ? "rgba(22,119,255,0.06)" : "none",
                          border: "none", cursor: "pointer", borderRadius: 4,
                          padding: "4px 8px", fontSize: 12, color: sSelected ? "#1677ff" : "#666",
                          marginBottom: 1,
                        }}
                        disabled={isSessionBusy}
                        onClick={() => props.onSelectSession(project.id, session.id)}
                        title={session.title}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {session.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      <Modal
        open={createOpen}
        title={t("新建项目", "New project")}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText={t("确定", "Confirm")}
        cancelText={t("取消", "Cancel")}
        okButtonProps={{ disabled: !canCreate }}
      >
        <Input
          autoFocus
          placeholder={t("项目名称", "Project name")}
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          onPressEnter={handleCreate}
          disabled={creating}
        />
      </Modal>

      {/* Rename Modal */}
      <Modal
        open={!!renameTarget}
        title={t("重命名项目", "Rename project")}
        onOk={handleRename}
        onCancel={() => setRenameTarget(null)}
        okText={t("确定", "Confirm")}
        cancelText={t("取消", "Cancel")}
        okButtonProps={{ disabled: !canRename }}
      >
        <Input
          autoFocus
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onPressEnter={handleRename}
          disabled={renaming}
        />
      </Modal>
    </div>
  );
}
