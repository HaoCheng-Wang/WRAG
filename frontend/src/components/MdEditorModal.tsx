/** Markdown editor modal — split-pane editing with save confirmation warning. */

import { useState, useEffect } from "react";
import { Modal, Button, Input, Space, message, Alert, Typography } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  open: boolean;
  fileId: string | null;
  fileName: string;
  onClose: () => void;
  onSaved: () => void;
  t: (zh: string, en: string) => string;
}

export default function MdEditorModal({ open, fileId, fileName, onClose, onSaved, t }: Props) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open && fileId) {
      setLoading(true);
      api.getMdFileContent(fileId)
        .then((c) => { setContent(c); setOriginalContent(c); })
        .catch(() => message.error("Failed to load"))
        .finally(() => setLoading(false));
    }
  }, [open, fileId]);

  const handleSaveClick = () => {
    if (content === originalContent) {
      message.info(t("内容未修改", "No changes detected"));
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!fileId) return;
    setSaving(true);
    try {
      await api.updateMdFileContent(fileId, content);
      message.success(t("Markdown 内容已更新", "Markdown content updated"));
      setConfirmOpen(false);
      onSaved();
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        title={<Space><Text strong>{fileName}</Text><Text type="secondary">— {t("在线编辑", "Edit")}</Text></Space>}
        width="95%"
        style={{ top: 10 }}
        loading={loading}
        footer={
          <Space>
            <Button onClick={onClose}>{t("取消", "Cancel")}</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveClick} loading={saving}>
              {t("保存", "Save")}
            </Button>
          </Space>
        }
      >
        <div style={{ display: "flex", gap: 12, height: "70vh" }}>
          {/* Editor */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <Text type="secondary" style={{ marginBottom: 4 }}>Markdown {t("源码", "Source")}</Text>
            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ flex: 1, fontFamily: "monospace", fontSize: 13, resize: "none" }}
            />
          </div>
          {/* Preview */}
          <div style={{ flex: 1, overflow: "auto", padding: 12, background: "#fafafa", borderRadius: 8, border: "1px solid #eee" }}>
            <Text type="secondary" style={{ marginBottom: 8, display: "block" }}>{t("预览", "Preview")}</Text>
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      </Modal>

      {/* Confirmation dialog */}
      <Modal
        open={confirmOpen}
        title={t("确认保存", "Confirm Save")}
        onOk={handleConfirmSave}
        onCancel={() => setConfirmOpen(false)}
        confirmLoading={saving}
        okText={t("确定保存", "Confirm")}
        cancelText={t("取消", "Cancel")}
      >
        <Alert
          type="warning"
          showIcon
          message={t(
            "注意：修改仅会保存到本地 Markdown 缓存，不会同步更新已导入知识库的内容。如需在知识库中生效，请先前往对应项目的文档管理中删除该文档，再重新导入。",
            "Note: Modifications only save to the local Markdown cache and will NOT sync to already-ingested knowledge base content. To apply changes to the KB, first delete the document from the target project, then re-import."
          )}
          style={{ marginBottom: 12 }}
        />
        <Text>{t("确定保存修改?", "Confirm save changes?")}</Text>
      </Modal>
    </>
  );
}
