/** Settings drawer — AI providers, search defaults, language, danger zone.
 *
 *  Matches SAG's SettingsPanel:
 *  - Language: Auto / Chinese / English toggle
 *  - AI Provider: Embedding + LLM settings
 *  - Search: mode, top-K, chunking
 *  - Danger zone: clear keys
 */

import { useState, useEffect } from "react";
import {
  Drawer, Form, Input, Select, InputNumber, Button, Divider,
  message, Space, Tabs, Checkbox, Typography,
} from "antd";
import { api } from "../lib/api";
import type { Lang, LangPreference } from "../i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  t: (zh: string, en: string) => string;
  lang: Lang;
  langPref: LangPreference;
  onLangPrefChange: (p: LangPreference) => void;
}

export default function SettingsPanel({ open, onClose, t, lang, langPref, onLangPrefChange }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasEmbeddingKey, setHasEmbeddingKey] = useState(false);
  const [hasLlmKey, setHasLlmKey] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.getAiSettings()
        .then((data) => {
          const s = data.settings;
          setHasEmbeddingKey(s.hasEmbeddingApiKey);
          setHasLlmKey(s.hasLlmApiKey);
          form.setFieldsValue({
            embeddingBaseUrl: s.embeddingBaseUrl,
            embeddingModel: s.embeddingModel,
            embeddingDimensions: s.embeddingDimensions,
            embeddingApiKey: "",
            llmBaseUrl: s.llmBaseUrl,
            llmModel: s.llmModel,
            llmApiKey: "",
            llmTimeoutMs: s.llmTimeoutMs,
            llmMaxRetries: s.llmMaxRetries,
            defaultSearchMode: s.defaultSearchMode,
            defaultSearchTopK: s.defaultSearchTopK,
            defaultChunkingMode: s.defaultChunkingMode,
            chunkTokenLimit: s.chunkTokenLimit,
            chunkOverlapTokens: s.chunkOverlapTokens,
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
        embeddingDimensions: vals.embeddingDimensions,
        embeddingApiKey: vals.embeddingApiKey || undefined,
        clearEmbeddingApiKey: vals.clearEmbeddingKey || false,
        llmBaseUrl: vals.llmBaseUrl,
        llmModel: vals.llmModel,
        llmApiKey: vals.llmApiKey || undefined,
        clearLlmApiKey: vals.clearLlmKey || false,
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
      title={t("全局设置", "Global settings")}
      width={500}
      footer={
        <Space>
          <Button onClick={onClose}>{t("取消", "Cancel")}</Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            {t("保存设置", "Save settings")}
          </Button>
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: "general",
            label: t("界面", "Interface"),
            children: (
              <div>
                <h4>{t("界面语言", "Interface language")}</h4>
                <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                  {(["auto", "zh", "en"] as LangPreference[]).map((v) => (
                    <Button
                      key={v}
                      size="small"
                      type={langPref === v ? "primary" : "default"}
                      ghost={langPref !== v}
                      onClick={() => onLangPrefChange(v)}
                    >
                      {v === "auto" ? t("自动", "Auto") : v === "zh" ? "中文" : "English"}
                    </Button>
                  ))}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {langPref === "auto"
                    ? t(`当前：${lang === "zh" ? "中文" : "English"}（跟随浏览器）`, `Current: ${lang === "zh" ? "Chinese" : "English"} (following browser)`)
                    : ""}
                </Text>
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
                <Form.Item name="embeddingDimensions" label={t("向量维度（数据库固定）", "Vector dimensions (DB fixed)")}>
                  <InputNumber style={{ width: "100%" }} min={1024} max={1024} disabled />
                </Form.Item>
                <Form.Item name="embeddingApiKey" label={t(`Embedding 密钥：${hasEmbeddingKey ? "已配置" : "未配置"}`, `Embedding key: ${hasEmbeddingKey ? "configured" : "not configured"}`)}>
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
                <Form.Item name="llmTimeoutMs" label={t("超时 (ms)", "Timeout (ms)")}>
                  <InputNumber style={{ width: "100%" }} min={1} />
                </Form.Item>
                <Form.Item name="llmMaxRetries" label={t("最大重试", "Max retries")}>
                  <InputNumber style={{ width: "100%" }} min={0} max={10} />
                </Form.Item>
                <Form.Item name="llmApiKey" label={t(`LLM 密钥：${hasLlmKey ? "已配置" : "未配置"}`, `LLM key: ${hasLlmKey ? "configured" : "not configured"}`)}>
                  <Input.Password placeholder={t("留空不修改", "Leave blank to keep")} />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: "search",
            label: t("搜索", "Search"),
            children: (
              <Form form={form} layout="vertical" disabled={loading}>
                <Form.Item name="defaultSearchMode" label={t("默认搜索模式", "Default search mode")}>
                  <Select options={[
                    { value: "fast", label: t("极速模式", "Fast mode") },
                    { value: "standard", label: t("标准模式", "Standard mode") },
                  ]} />
                </Form.Item>
                <Form.Item name="defaultSearchTopK" label={t("默认 Top-K", "Default Top-K")}>
                  <InputNumber style={{ width: "100%" }} min={1} max={50} />
                </Form.Item>
                <Form.Item name="defaultChunkingMode" label={t("分块模式", "Chunking mode")}>
                  <Select options={[
                    { value: "heading_strict", label: t("标题严格", "Heading strict") },
                    { value: "token", label: t("Token 窗口", "Token window") },
                  ]} />
                </Form.Item>
                <Form.Item name="chunkTokenLimit" label={t("Token 上限", "Token limit")}>
                  <InputNumber style={{ width: "100%" }} min={64} max={8192} />
                </Form.Item>
                <Form.Item name="chunkOverlapTokens" label={t("重叠 Token", "Overlap tokens")}>
                  <InputNumber style={{ width: "100%" }} min={0} max={512} />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: "danger",
            label: t("危险操作", "Danger zone"),
            children: (
              <div>
                <Form form={form} layout="vertical" disabled={loading}>
                  <Form.Item name="clearEmbeddingKey" valuePropName="checked">
                    <Checkbox onChange={(e) => {
                      if (e.target.checked) form.setFieldValue("embeddingApiKey", "");
                    }}>{t("清空 Embedding 密钥", "Clear Embedding key")}</Checkbox>
                  </Form.Item>
                  <Form.Item name="clearLlmKey" valuePropName="checked">
                    <Checkbox onChange={(e) => {
                      if (e.target.checked) form.setFieldValue("llmApiKey", "");
                    }}>{t("清空 LLM 密钥", "Clear LLM key")}</Checkbox>
                  </Form.Item>
                </Form>
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

const { Text } = Typography;
