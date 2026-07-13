/** File upload dialog — drag-and-drop with format info and SSE progress. */

import { useState, useEffect } from "react";
import { Modal, Upload, Switch, Tag, Progress, message, Typography, Space } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import { api } from "../lib/api";
import type { FormatsInfo } from "../types";

const { Dragger } = Upload;
const { Text } = Typography;

interface Props {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
  t: (zh: string, en: string) => string;
}

type Stage = "idle" | "converting" | "converted" | "saving_md" | "md_saved" | "ingesting" | "ingested" | "done" | "error";

export default function UploadDialog({ open, projectId, onClose, onSuccess, t }: Props) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [saveMarkdown, setSaveMarkdown] = useState(true);
  const [formats, setFormats] = useState<FormatsInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (open) {
      api.getFormats().then(setFormats).catch(() => {});
      setFileList([]);
      setStage("idle");
      setProgress(0);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const stageMap: Record<Stage, { label: string; pct: number }> = {
    idle: { label: t("准备中", "Ready"), pct: 0 },
    converting: { label: t("转换中...", "Converting..."), pct: 20 },
    converted: { label: t("转换完成", "Converted"), pct: 40 },
    saving_md: { label: t("保存 Markdown...", "Saving Markdown..."), pct: 55 },
    md_saved: { label: t("Markdown 已保存", "Markdown Saved"), pct: 65 },
    ingesting: { label: t("导入知识库...", "Ingesting into KB..."), pct: 80 },
    ingested: { label: t("导入完成", "Ingested"), pct: 95 },
    done: { label: t("完成!", "Done!"), pct: 100 },
    error: { label: t("错误", "Error"), pct: 0 },
  };

  const handleUpload = async () => {
    if (fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const file = fileList[0].originFileObj!;
      const res = await api.uploadFile(projectId, file, null, saveMarkdown, (s, data) => {
        const mapped = s === "converting" ? "converting" :
          s === "converted" ? "converted" :
          s === "saving_md" ? "saving_md" :
          s === "md_saved" ? "md_saved" :
          s === "ingesting" ? "ingesting" :
          s === "ingested" ? "ingested" :
          s === "done" ? "done" : "error";
        setStage(mapped as Stage);
        setProgress(stageMap[mapped as Stage]?.pct ?? 0);
        if (s === "error") setError(data?.message ?? "Unknown error");
      });
      setResult(res);
      setStage("done");
      setProgress(100);
      message.success(t("上传成功!", "Upload successful!"));
      onSuccess();
    } catch (e: any) {
      setStage("error");
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("上传文件", "Upload File")}
      onOk={handleUpload}
      onCancel={onClose}
      confirmLoading={uploading}
      okText={t("上传", "Upload")}
      cancelText={t("取消", "Cancel")}
      okButtonProps={{ disabled: fileList.length === 0 || uploading }}
      width={580}
    >
      <Dragger
        fileList={fileList}
        beforeUpload={(f) => { setFileList([{ uid: "-1", name: f.name, status: "done", originFileObj: f as any }]); return false; }}
        onRemove={() => setFileList([])}
        maxCount={1}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">{t("点击或拖拽文件到此处", "Click or drag file here")}</p>
        <p className="ant-upload-hint">
          {formats && (
            <span>
              {t("支持格式: ", "Supported: ")}
              {formats.formats.slice(0, 10).map((f) => <Tag key={f} style={{ margin: 2 }}>{f}</Tag>)}
              {formats.formats.length > 10 && <Tag>...</Tag>}
            </span>
          )}
        </p>
        {formats?.max_upload_size_mb && (
          <p className="ant-upload-hint">{t(`最大 ${formats.max_upload_size_mb} MB`, `Max ${formats.max_upload_size_mb} MB`)}</p>
        )}
      </Dragger>

      <div style={{ marginTop: 16 }}>
        <Space>
          <Switch checked={saveMarkdown} onChange={setSaveMarkdown} />
          <Text>{t("保存 Markdown 文件", "Save Markdown file")}</Text>
        </Space>
      </div>

      {uploading && (
        <div style={{ marginTop: 16 }}>
          <Progress percent={progress} status="active" />
          <Text type="secondary">{stageMap[stage]?.label}</Text>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16 }}>
          <Text type="danger">{error}</Text>
        </div>
      )}

      {result && stage === "done" && (
        <div style={{ marginTop: 16, padding: 12, background: "#f6ffed", borderRadius: 6, border: "1px solid #b7eb8f" }}>
          <Text strong>{t("上传成功!", "Upload successful!")}</Text>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            <div>{t("文档ID", "Doc ID")}: {result.document_id}</div>
            <div>{t("分块数", "Chunks")}: {result.chunk_count}</div>
            <div>{t("事件数", "Events")}: {result.event_count}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
