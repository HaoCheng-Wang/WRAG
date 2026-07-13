/** Markdown content preview modal with formatted rendering. */

import { useState, useEffect } from "react";
import { Modal, Button, Spin, Space, Typography } from "antd";
import { EditOutlined, DownloadOutlined, ImportOutlined, DeleteOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";

const { Text } = Typography;

interface Props {
  open: boolean;
  fileId: string | null;
  fileName: string;
  fileInfo: any;
  onClose: () => void;
  onEdit: () => void;
  onImport: () => void;
  onDelete: () => void;
  t: (zh: string, en: string) => string;
}

export default function MdPreviewModal({ open, fileId, fileName, fileInfo, onClose, onEdit, onImport, onDelete, t }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && fileId) {
      setLoading(true);
      api.getMdFileContent(fileId)
        .then(setContent)
        .catch(() => setContent("Failed to load"))
        .finally(() => setLoading(false));
    }
  }, [open, fileId]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width="90%"
      style={{ top: 20 }}
      title={
        <Space>
          <Text strong>{fileName}</Text>
          {fileInfo?.original_format && <Text type="secondary">({fileInfo.original_format} → .md)</Text>}
        </Space>
      }
      footer={
        <Space>
          <Button icon={<EditOutlined />} onClick={onEdit}>{t("编辑", "Edit")}</Button>
          <Button icon={<DownloadOutlined />} onClick={() => fileId && api.downloadMdFile(fileId)}>{t("下载", "Download")}</Button>
          <Button icon={<ImportOutlined />} onClick={onImport}>{t("导入到项目", "Import")}</Button>
          <Button danger icon={<DeleteOutlined />} onClick={onDelete}>{t("删除", "Delete")}</Button>
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : (
        <div style={{ maxHeight: "70vh", overflow: "auto", padding: 16, background: "#fafafa", borderRadius: 8 }}>
          <ReactMarkdown>{content ?? ""}</ReactMarkdown>
        </div>
      )}
    </Modal>
  );
}
