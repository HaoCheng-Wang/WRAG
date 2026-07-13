/** Settings drawer — AI providers, search defaults, upload limits. */

import { useState, useEffect } from "react";
import {
  Drawer, Form, Input, Select, InputNumber, Switch,
  Button, Divider, Popconfirm, message, Space, Tabs,
} from "antd";
import { api } from "../lib/api";
import type { Lang } from "../i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  t: (zh: string, en: string) => string;
  lang: Lang;
  onLangChange: (l: Lang) => void;
}

export default function SettingsPanel({ open, onClose, t, lang, onLangChange }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.getAiSettings()
        .then((data) => {
          const s = data.settings;
          form.setFieldsValue({
            embeddingBaseUrl: s.embedding_base_url,
            embeddingModel: s.embedding_model,
            embeddingApiKey: "",
            llmBaseUrl: s.llm_base_url,
            llmModel: s.llm_model,
            llmApiKey: "",
            llmTimeoutMs: s.llm_timeout_ms,
            llmMaxRetries: s.llm_max_retries,
            defaultSearchMode: s.default_search_mode,
            defaultSearchTopK: s.default_search_top_k,
            defaultChunkingMode: s.default_chunking_mode,
            chunkTokenLimit: s.chunk_token_limit,
            chunkOverlapTokens: s.chunk_overlap_tokens,
          });
        })
        .catch(() => message.error("Failed to load AI settings"))
        .finally(() => setLoading(false));
    }
  }, [open, form]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const vals = form.getFieldsValue();
      await api.updateAiSettings({
        embeddingBaseUrl: vals.embeddingBaseUrl,
        embeddingModel: vals.embeddingModel,
        embeddingDimensions: 1024,
        embeddingApiKey: vals.embeddingApiKey || undefined,
        llmBaseUrl: vals.llmBaseUrl,
        llmModel: vals.llmModel,
        llmApiKey: vals.llmApiKey || undefined,
        llmTimeoutMs: vals.llmTimeoutMs,
        llmMaxRetries: vals.llmMaxRetries,
        defaultSearchMode: vals.defaultSearchMode,
        defaultSearchTopK: vals.defaultSearchTopK,
        defaultChunkingMode: vals.defaultChunkingMode,
        chunkTokenLimit: vals.chunkTokenLimit,
        chunkOverlapTokens: vals.chunkOverlapTokens,
      });
      message.success(t("设置已保存", "Settings saved"));
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("设置", "Settings")}
      width={480}
      footer={
        <Space>
          <Button onClick={onClose}>{t("取消", "Cancel")}</Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            {t("保存", "Save")}
          </Button>
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: "general",
            label: t("通用", "General"),
            children: (
              <div>
                <h4>{t("界面语言 / Interface Language", "Interface Language")}</h4>
                <Select
                  value={lang}
                  onChange={onLangChange}
                  options={[
                    { value: "zh", label: "中文" },
                    { value: "en", label: "English" },
                  ]}
                  style={{ width: 200 }}
                />
                <Divider />
                <h4>{t("上传设置", "Upload Settings")}</h4>
                <p style={{ color: "#888", fontSize: 12 }}>
                  {t("留空 = 不限制文件大小", "Leave blank = no file size limit")}
                </p>
              </div>
            ),
          },
          {
            key: "ai",
            label: t("AI 供应商", "AI Provider"),
            children: (
              <Form form={form} layout="vertical" disabled={loading}>
                <h4>Embedding</h4>
                <Form.Item name="embeddingBaseUrl" label={t("Base URL", "Base URL")}>
                  <Input />
                </Form.Item>
                <Form.Item name="embeddingModel" label={t("模型", "Model")}>
                  <Input />
                </Form.Item>
                <Form.Item name="embeddingApiKey" label={t("API Key", "API Key")}>
                  <Input.Password placeholder={t("留空不修改", "Leave blank to keep")} />
                </Form.Item>
                <Divider />
                <h4>LLM</h4>
                <Form.Item name="llmBaseUrl" label={t("Base URL", "Base URL")}>
                  <Input />
                </Form.Item>
                <Form.Item name="llmModel" label={t("模型", "Model")}>
                  <Input />
                </Form.Item>
                <Form.Item name="llmApiKey" label={t("API Key", "API Key")}>
                  <Input.Password placeholder={t("留空不修改", "Leave blank to keep")} />
                </Form.Item>
                <Form.Item name="llmTimeoutMs" label={t("超时 (ms)", "Timeout (ms)")}>
                  <InputNumber style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="llmMaxRetries" label={t("最大重试", "Max Retries")}>
                  <InputNumber style={{ width: "100%" }} min={0} max={5} />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: "search",
            label: t("搜索", "Search"),
            children: (
              <Form form={form} layout="vertical" disabled={loading}>
                <Form.Item name="defaultSearchMode" label={t("默认搜索模式", "Default Search Mode")}>
                  <Select options={[{ value: "fast", label: "Fast" }, { value: "standard", label: "Standard" }]} />
                </Form.Item>
                <Form.Item name="defaultSearchTopK" label={t("默认 Top-K", "Default Top-K")}>
                  <InputNumber style={{ width: "100%" }} min={1} max={50} />
                </Form.Item>
                <Form.Item name="defaultChunkingMode" label={t("分块模式", "Chunking Mode")}>
                  <Select options={[{ value: "heading_strict", label: "Heading Strict" }, { value: "token", label: "Token Window" }]} />
                </Form.Item>
                <Form.Item name="chunkTokenLimit" label={t("分块 Token 上限", "Chunk Token Limit")}>
                  <InputNumber style={{ width: "100%" }} min={128} max={4096} />
                </Form.Item>
                <Form.Item name="chunkOverlapTokens" label={t("重叠 Token", "Overlap Tokens")}>
                  <InputNumber style={{ width: "100%" }} min={0} max={512} />
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
