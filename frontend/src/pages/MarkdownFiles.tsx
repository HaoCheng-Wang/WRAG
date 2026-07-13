/** Markdown Files page — list, preview, edit, download, delete, import converted markdown files. */

import { useState, useEffect, useCallback } from "react";
import {
  Table, Button, Tag, Space, Popconfirm, message, Typography, Empty, Input,
} from "antd";
import {
  EyeOutlined, EditOutlined, DownloadOutlined, ImportOutlined,
  DeleteOutlined, ReloadOutlined,
} from "@ant-design/icons";
import { api } from "../lib/api";
import type { MdFileInfo, SourceRecord } from "../types";
import MdPreviewModal from "../components/MdPreviewModal";
import MdEditorModal from "../components/MdEditorModal";
import ImportToProjectModal from "../components/ImportToProjectModal";

const { Text } = Typography;

interface Props {
  projects: SourceRecord[];
  t: (zh: string, en: string) => string;
}

export default function MarkdownFiles({ projects, t }: Props) {
  const [files, setFiles] = useState<MdFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  // Modals
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activeFile, setActiveFile] = useState<MdFileInfo | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listMdFiles();
      setFiles(data.files ?? []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleDelete = async (fileId: string) => {
    try {
      await api.deleteMdFile(fileId);
      message.success(t("Markdown 文件已删除", "Markdown file deleted"));
      loadFiles();
    } catch (e: any) { message.error(e.message); }
  };

  const filtered = searchText
    ? files.filter((f) => f.original_filename.toLowerCase().includes(searchText.toLowerCase()))
    : files;

  const columns = [
    {
      title: t("原始文件名", "Original File"),
      dataIndex: "original_filename",
      width: 200,
      ellipsis: true,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: t("格式", "Format"),
      dataIndex: "original_format",
      width: 80,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: t("大小", "Size"),
      dataIndex: "md_size_bytes",
      width: 100,
      render: (v: number) => {
        if (v > 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
        if (v > 1024) return `${(v / 1024).toFixed(1)} KB`;
        return `${v} B`;
      },
    },
    {
      title: t("创建时间", "Created"),
      dataIndex: "created_at",
      width: 160,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: t("最后修改", "Updated"),
      dataIndex: "updated_at",
      width: 160,
      render: (v: string | null) => v ? new Date(v).toLocaleString() : "-",
    },
    {
      title: t("导入历史", "Imports"),
      dataIndex: "imports",
      width: 200,
      render: (imports: any[]) => (
        <Space wrap>
          {imports?.map((imp, i) => (
            <Tag key={i} color="green">{imp.project_name || imp.project_id?.slice(0, 8)}</Tag>
          ))}
          {(!imports || imports.length === 0) && <Text type="secondary">-</Text>}
        </Space>
      ),
    },
    {
      title: t("操作", "Actions"),
      key: "actions",
      width: 240,
      render: (_: any, record: MdFileInfo) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EyeOutlined />}
            onClick={() => { setActiveFile(record); setPreviewOpen(true); }}
          >
            {t("预览", "View")}
          </Button>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => { setActiveFile(record); setEditOpen(true); }}
          />
          <Button
            size="small"
            type="text"
            icon={<DownloadOutlined />}
            onClick={() => api.downloadMdFile(record.id)}
          />
          <Button
            size="small"
            type="text"
            icon={<ImportOutlined />}
            onClick={() => { setActiveFile(record); setImportOpen(true); }}
          />
          <Popconfirm
            title={t("仅删除 md 文件，不影响已导入知识库内容。确认?", "Only deletes md file, KB content unaffected. Confirm?")}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16, height: "calc(100vh - 48px)", overflow: "auto" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Input.Search
          placeholder={t("搜索文件名...", "Search filename...")}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 300 }}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={loadFiles}>{t("刷新", "Refresh")}</Button>
      </div>

      {/* Table */}
      <Table
        dataSource={filtered}
        rowKey="id"
        columns={columns}
        loading={loading}
        size="middle"
        locale={{ emptyText: <Empty description={t("暂无已转换的 Markdown 文件，上传一个文件开始使用", "No converted Markdown files yet. Upload a file to get started.")} /> }}
        pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (total) => `${t("共", "Total")} ${total} ${t("条", "items")}` }}
      />

      {/* Modals */}
      <MdPreviewModal
        open={previewOpen}
        fileId={activeFile?.id ?? null}
        fileName={activeFile?.original_filename ?? ""}
        fileInfo={activeFile}
        onClose={() => setPreviewOpen(false)}
        onEdit={() => { setPreviewOpen(false); setEditOpen(true); }}
        onImport={() => { setPreviewOpen(false); setImportOpen(true); }}
        onDelete={() => {
          if (activeFile) handleDelete(activeFile.id);
          setPreviewOpen(false);
        }}
        t={t}
      />

      <MdEditorModal
        open={editOpen}
        fileId={activeFile?.id ?? null}
        fileName={activeFile?.original_filename ?? ""}
        onClose={() => setEditOpen(false)}
        onSaved={loadFiles}
        t={t}
      />

      <ImportToProjectModal
        open={importOpen}
        projects={projects}
        fileId={activeFile?.id ?? null}
        onClose={() => setImportOpen(false)}
        onSuccess={loadFiles}
        t={t}
      />
    </div>
  );
}
