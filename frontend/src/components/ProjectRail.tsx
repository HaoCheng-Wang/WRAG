/** Left sidebar project list with create/rename/archive/delete. */

import { useState } from "react";
import { Menu, Button, Modal, Input, message, Popconfirm, Space } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined, InboxOutlined } from "@ant-design/icons";
import type { SourceRecord } from "../types";
import { api } from "../lib/api";

interface Props {
  projects: SourceRecord[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onProjectsChange: () => void;
  collapsed: boolean;
  t: (zh: string, en: string) => string;
}

export default function ProjectRail({ projects, activeProjectId, onSelectProject, onProjectsChange, collapsed, t }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const handleCreate = async () => {
    if (!createName.trim()) return;
    try {
      await api.createProject({ name: createName.trim() });
      message.success(t("项目已创建", "Project created"));
      setCreateOpen(false);
      setCreateName("");
      onProjectsChange();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleRename = async () => {
    if (!renameId || !renameName.trim()) return;
    try {
      await api.updateProject(renameId, { name: renameName.trim() });
      message.success(t("已重命名", "Renamed"));
      setRenameId(null);
      onProjectsChange();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await api.archiveProject(id);
      message.success(t("已归档", "Archived"));
      onProjectsChange();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProject(id);
      message.success(t("已删除", "Deleted"));
      if (activeProjectId === id) onSelectProject("");
      onProjectsChange();
    } catch (e: any) { message.error(e.message); }
  };

  const menuItems = projects
    .filter((p) => !p.archived_at)
    .map((p) => ({
      key: p.id,
      icon: <FolderOutlined />,
      label: collapsed ? undefined : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
          <Space size={4} onClick={(e) => e.stopPropagation()}>
            <EditOutlined
              style={{ fontSize: 12, opacity: 0.5 }}
              onClick={() => { setRenameId(p.id); setRenameName(p.name); }}
            />
            <Popconfirm title={t("归档此项目?", "Archive this project?")} onConfirm={() => handleArchive(p.id)}>
              <InboxOutlined style={{ fontSize: 12, opacity: 0.5 }} />
            </Popconfirm>
            <Popconfirm title={t("永久删除?", "Permanently delete?")} onConfirm={() => handleDelete(p.id)}>
              <DeleteOutlined style={{ fontSize: 12, opacity: 0.5, color: "red" }} />
            </Popconfirm>
          </Space>
        </div>
      ),
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 12 }}>
        {!collapsed && (
          <Button type="primary" icon={<PlusOutlined />} block onClick={() => setCreateOpen(true)}>
            {t("新建项目", "New Project")}
          </Button>
        )}
        {collapsed && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} />
        )}
      </div>

      <Menu
        mode="inline"
        selectedKeys={activeProjectId ? [activeProjectId] : []}
        onClick={({ key }) => onSelectProject(key)}
        items={menuItems}
        style={{ flex: 1, borderRight: 0 }}
      />

      {/* Create Modal */}
      <Modal
        open={createOpen}
        title={t("新建项目", "New Project")}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Input
          placeholder={t("项目名称", "Project name")}
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          onPressEnter={handleCreate}
        />
      </Modal>

      {/* Rename Modal */}
      <Modal
        open={!!renameId}
        title={t("重命名", "Rename")}
        onOk={handleRename}
        onCancel={() => setRenameId(null)}
      >
        <Input
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onPressEnter={handleRename}
        />
      </Modal>
    </div>
  );
}
