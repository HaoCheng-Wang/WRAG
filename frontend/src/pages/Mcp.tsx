/** MCP configuration page — shows project binding selector, JSON config, and expandable tool cards.
 *
 *  Features:
 *  - Project selector to dynamically switch MCP binding
 *  - HTTP config JSON with current host (no hardcoded localhost)
 *  - Expandable tool cards showing inputSchema + example
 */

import { useState, useEffect, useCallback } from "react";
import { Card, Typography, Spin, Descriptions, Tag, Button, message, Space, Select, Alert } from "antd";
import { CopyOutlined, CodeOutlined, RightOutlined, DownOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../lib/api";
import type { PublicMcpSettings, SourceRecord } from "../types";

const { Text, Paragraph } = Typography;

interface Props {
  projectId: string;
  project: SourceRecord | null;
  projects: SourceRecord[];
  onProjectsChange: () => void;
  t: (zh: string, en: string) => string;
}

export default function Mcp({ projectId, project, projects, onProjectsChange, t }: Props) {
  const [settings, setSettings] = useState<PublicMcpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [bindingProjectId, setBindingProjectId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [selectedBindProject, setSelectedBindProject] = useState<string | null>(null);

  // Load MCP settings + current binding
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [mcpSettings, binding] = await Promise.all([
        api.getMcpSettings(),
        fetch("/api/wrag/mcp/binding").then((r) => r.json()),
      ]);
      setSettings(mcpSettings.settings);
      setBindingProjectId(binding.project_id ?? null);
      setSelectedBindProject(binding.project_id ?? null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Switch MCP project binding
  const handleSwitchBinding = async () => {
    if (!selectedBindProject || selectedBindProject === bindingProjectId) return;
    setSwitching(true);
    try {
      const resp = await fetch("/api/wrag/mcp/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: selectedBindProject }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail ?? "Failed");
      }
      const data = await resp.json();
      setBindingProjectId(data.project_id);
      message.success(t(`MCP 已绑定到项目 ${data.project_id.slice(0, 8)}...`, `MCP bound to project ${data.project_id.slice(0, 8)}...`));
    } catch (e: any) {
      message.error(e.message);
      setSelectedBindProject(bindingProjectId); // revert
    } finally {
      setSwitching(false);
    }
  };

  // Build HTTP config JSON
  const mcpHost = window.location.hostname;
  const mcpPort = 4174;
  const configJson = JSON.stringify({
    mcpServers: {
      wrag: {
        type: "http",
        url: `http://${mcpHost}:${mcpPort}/mcp`,
      },
    },
  }, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied(true);
      message.success(t("已复制!", "Copied!"));
      setTimeout(() => setCopied(false), 1500);
    } catch { message.error(t("复制失败", "Copy failed")); }
  };

  const activeProjects = projects.filter((p) => !p.archivedAt);
  const boundProject = activeProjects.find((p) => p.id === bindingProjectId);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto", overflow: "auto", height: "calc(100vh - 48px)" }}>
      {/* Project binding selector */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={<Text strong>{t("MCP 项目绑定", "MCP Project Binding")}</Text>}
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={loadSettings} />
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12, fontSize: 12 }}
          message={t(
            "选择 MCP 桥接器绑定的项目。切换绑定会重启 MCP 桥，已有会话将中断。",
            "Select which project the MCP bridge binds to. Switching restarts the bridge; active sessions will disconnect."
          )}
        />

        <Space.Compact style={{ width: "100%" }}>
          <Select
            showSearch
            style={{ flex: 1 }}
            placeholder={t("选择要绑定的项目...", "Select a project to bind...")}
            value={selectedBindProject}
            onChange={setSelectedBindProject}
            options={activeProjects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.id.slice(0, 8)}...)`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string ?? "").toLowerCase().includes(input.toLowerCase())
            }
          />
          <Button
            type="primary"
            loading={switching}
            disabled={!selectedBindProject || selectedBindProject === bindingProjectId}
            onClick={handleSwitchBinding}
          >
            {t("切换绑定", "Switch Binding")}
          </Button>
        </Space.Compact>

        <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
          <Descriptions.Item label={t("当前绑定", "Current binding")}>
            {boundProject ? (
              <Tag color="green">{boundProject.name} — {boundProject.id}</Tag>
            ) : (
              <Tag color="red">{t("未绑定", "Not bound")}</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t("工具超时", "Tool timeout")}>
            {settings?.toolTimeoutMs ? `${settings.toolTimeoutMs} ms` : "-"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Config JSON */}
      <Card
        title={<Text strong><CodeOutlined /> {t("MCP 服务器配置", "MCP Server Configuration")}</Text>}
        style={{ marginBottom: 24 }}
        extra={
          <Button icon={<CopyOutlined />} onClick={handleCopy} size="small">
            {copied ? t("已复制", "Copied") : t("复制", "Copy")}
          </Button>
        }
      >
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 8 }}>
          {t("复制到 Claude Desktop / Cursor 等 MCP 客户端即可使用。", "Copy to Claude Desktop, Cursor, or any MCP client to connect.")}
        </Text>
        <pre style={{
          background: "#f5f5f5", padding: 12, borderRadius: 6, fontSize: 12,
          overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap",
        }}>
          {configJson}
        </pre>
      </Card>

      {/* Tool Cards */}
      <Card title={t("可用工具", "Available Tools")}>
        {(!settings?.tools || settings.tools.length === 0) ? (
          <Text type="secondary">{t("暂无工具信息", "No tool info available")}</Text>
        ) : settings.tools.map((tool) => {
          const expanded = expandedTool === tool.name;
          return (
            <Card
              key={tool.name}
              type="inner"
              size="small"
              style={{ marginBottom: 8, borderColor: expanded ? "#1677ff" : undefined }}
            >
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                onClick={() => setExpandedTool(expanded ? null : tool.name)}
              >
                <div style={{ flex: 1 }}>
                  <Tag color="blue" style={{ marginRight: 8 }}>{tool.name}</Tag>
                  <Text style={{ fontSize: 13 }}>{tool.description}</Text>
                </div>
                <Button type="text" size="small"
                  icon={expanded ? <DownOutlined /> : <RightOutlined />} />
              </div>
              {expanded && (
                <div style={{ marginTop: 12, padding: "8px 12px", background: "#fafafa", borderRadius: 6 }}>
                  {tool.inputSchema && (
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>{t("输入参数 Schema", "Input Schema")}</Text>
                      <pre style={{
                        fontSize: 11, whiteSpace: "pre-wrap", background: "#fff",
                        padding: 8, borderRadius: 4, border: "1px solid #f0f0f0",
                        maxHeight: 200, overflow: "auto", margin: "4px 0 0",
                      }}>
                        {JSON.stringify(tool.inputSchema, null, 2)}
                      </pre>
                    </div>
                  )}
                  {tool.example && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 11 }}>{t("调用示例", "Call Example")}</Text>
                      <pre style={{
                        fontSize: 11, whiteSpace: "pre-wrap", background: "#fff",
                        padding: 8, borderRadius: 4, border: "1px solid #f0f0f0",
                        maxHeight: 200, overflow: "auto", margin: "4px 0 0",
                      }}>
                        {JSON.stringify(tool.example, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </Card>
    </div>
  );
}
