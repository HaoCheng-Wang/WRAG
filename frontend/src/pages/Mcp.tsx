/** MCP configuration page — shows mcpServers JSON + tool list. */

import { useState, useEffect } from "react";
import { Card, Typography, Spin, Descriptions, Tag, Button, message } from "antd";
import { CopyOutlined, CodeOutlined } from "@ant-design/icons";
import { api } from "../lib/api";
import type { PublicMcpSettings, McpToolInfo } from "../types";

const { Text, Paragraph } = Typography;

interface Props {
  projectId: string;
  t: (zh: string, en: string) => string;
}

export default function Mcp({ projectId, t }: Props) {
  const [settings, setSettings] = useState<PublicMcpSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.getMcpSettings()
      .then((data) => setSettings(data.settings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const mcpJson = JSON.stringify({
    mcpServers: {
      sag: {
        command: "npm",
        args: ["run", "mcp"],
        env: { SAG_MCP_SOURCE_ID: projectId },
      },
    },
  }, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mcpJson);
    message.success(t("已复制!", "Copied!"));
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto", overflow: "auto", height: "calc(100vh - 48px)" }}>
      <Card
        title={<Text strong><CodeOutlined /> {t("MCP 服务器配置", "MCP Server Configuration")}</Text>}
        style={{ marginBottom: 24 }}
        extra={
          <Button icon={<CopyOutlined />} onClick={handleCopy}>
            {t("复制", "Copy")}
          </Button>
        }
      >
        <pre style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, fontSize: 13, overflow: "auto" }}>
          {mcpJson}
        </pre>
      </Card>

      <Card title={t("可用工具", "Available Tools")}>
        {settings?.tools?.map((tool: McpToolInfo, i: number) => (
          <Card key={i} type="inner" size="small" style={{ marginBottom: 8 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t("工具名", "Tool")}>
                <Tag color="blue">{tool.name}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("描述", "Description")}>
                {tool.description}
              </Descriptions.Item>
            </Descriptions>
            {tool.example && (
              <Paragraph style={{ fontSize: 12, whiteSpace: "pre-wrap", marginTop: 8 }}>
                <Text type="secondary">Example:</Text>
                <pre style={{ fontSize: 11 }}>{JSON.stringify(tool.example, null, 2)}</pre>
              </Paragraph>
            )}
          </Card>
        ))}
        {(!settings?.tools || settings.tools.length === 0) && (
          <Text type="secondary">{t("暂无工具信息", "No tool info available")}</Text>
        )}
      </Card>
    </div>
  );
}
