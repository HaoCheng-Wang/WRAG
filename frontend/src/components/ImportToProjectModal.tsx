/** Import markdown to project dialog. */

import { useState, useEffect } from "react";
import { Modal, Select, Input, message } from "antd";
import { api } from "../lib/api";
import type { SourceRecord } from "../types";

interface Props {
  open: boolean;
  projects: SourceRecord[];
  onClose: () => void;
  onSuccess: () => void;
  fileId: string | null;
  t: (zh: string, en: string) => string;
}

export default function ImportToProjectModal({ open, projects, onClose, onSuccess, fileId, t }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setProjectId(null);
      setDocTitle("");
    }
  }, [open]);

  const handleImport = async () => {
    if (!fileId || !projectId) return;
    setLoading(true);
    try {
      const result = await api.importMdFile(fileId, projectId);
      message.success(t(`导入成功! 文档ID: ${result.document_id}`, `Imported! Doc ID: ${result.document_id}`));
      onSuccess();
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const activeProjects = projects.filter((p) => !p.archived_at);

  return (
    <Modal
      open={open}
      title={t("导入到知识库", "Import to Knowledge Base")}
      onOk={handleImport}
      onCancel={onClose}
      confirmLoading={loading}
      okText={t("导入", "Import")}
      cancelText={t("取消", "Cancel")}
      okButtonProps={{ disabled: !projectId }}
    >
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 4 }}>{t("目标项目", "Target Project")}</label>
        <Select
          showSearch
          placeholder={t("选择项目", "Select a project")}
          value={projectId}
          onChange={setProjectId}
          options={activeProjects.map((p) => ({ value: p.id, label: p.name }))}
          style={{ width: "100%" }}
          filterOption={(input, option) => (option?.label as string ?? "").toLowerCase().includes(input.toLowerCase())}
        />
      </div>
      <div>
        <label style={{ display: "block", marginBottom: 4 }}>{t("文档标题 (可选)", "Document Title (optional)")}</label>
        <Input
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          placeholder={t("留空使用默认", "Leave blank for default")}
        />
      </div>
    </Modal>
  );
}
