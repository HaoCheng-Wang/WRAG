/** Right-side activity panel — search trace (process steps) + raw model call logs.
 *
 *  Matches SAG's ActivityPanel:
 *  - Process tab: numbered step cards with status/duration/payload
 *  - Logs tab: LLM/Embedding call cards with request/response, sync/clear
 */

import { Button, Tabs, Tag, Typography, Empty, Card, Space } from "antd";
import { CloseOutlined, ReloadOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ProcessStep, ModelCallLogRecord } from "../types";
import { formatDate } from "../lib/markdown";

const { Text, Paragraph } = Typography;

interface Props {
  mode: "trace" | "logs";
  processSteps: ProcessStep[];
  modelLogs: ModelCallLogRecord[];
  onClose: () => void;
  onModeChange: (m: "trace" | "logs") => void;
  onSyncLogs: () => void;
  onClearLogs: () => void;
  t: (zh: string, en: string) => string;
}

export default function ActivityPanel(props: Props) {
  const { mode, processSteps, modelLogs, t } = props;

  return (
    <div style={{ padding: 12, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Tabs
          activeKey={mode}
          onChange={(k) => props.onModeChange(k as "trace" | "logs")}
          items={[
            { key: "trace", label: t("搜索过程", "Search trace") },
            { key: "logs", label: t("原始日志", "Raw logs") },
          ]}
          style={{ marginBottom: 0 }}
          tabBarStyle={{ marginBottom: 0, fontSize: 12 }}
        />
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={props.onClose} />
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {mode === "trace" && (
          processSteps.length === 0 ? (
            <Empty description={t("还没有搜索过程", "No search trace yet")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div>
              {processSteps.map((step, i) => (
                <Card
                  key={step.id}
                  size="small"
                  style={{
                    marginBottom: 8,
                    borderColor: step.status === "failed" ? "#ffccc7" : undefined,
                    background: step.status === "failed" ? "#fff2f0" : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: "50%", background: "#f5f5f5",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: "#999", fontWeight: 600,
                      }}>{i + 1}</span>
                      <Text strong style={{ fontSize: 12 }}>{step.title}</Text>
                    </div>
                    <Tag color={
                      step.status === "failed" ? "red" :
                      step.status === "running" ? "blue" : "green"
                    } style={{ fontSize: 10 }}>
                      {step.status === "running" ? t("运行中", "Running") :
                       step.status === "failed" ? t("失败", "Failed") : t("完成", "Done")}
                    </Tag>
                  </div>
                  {step.detail && (
                    <div style={{ marginTop: 4, marginLeft: 26, fontSize: 11, color: "#666" }}>
                      {step.detail}
                    </div>
                  )}
                  {step.durationMs != null && (
                    <div style={{ marginLeft: 26, fontSize: 10, color: "#999" }}>
                      {t(`耗时：${step.durationMs} 毫秒`, `Duration: ${step.durationMs} ms`)}
                    </div>
                  )}
                  {step.payload !== undefined && (
                    <div style={{ marginTop: 4, marginLeft: 26 }}>
                      <Paragraph
                        style={{ fontSize: 10, whiteSpace: "pre-wrap", margin: 0 }}
                        ellipsis={{ rows: 4, expandable: true, symbol: t("展开", "more") }}
                      >
                        {typeof step.payload === "string" ? step.payload : JSON.stringify(step.payload, null, 2)}
                      </Paragraph>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        )}

        {mode === "logs" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#999" }}>
                {t(`浏览器缓存 ${modelLogs.length} 条`, `Browser cache: ${modelLogs.length} item(s)`)}
                <div style={{ marginTop: 2 }}>
                  <Tag style={{ fontSize: 10 }}>LLM {modelLogs.filter(l => l.kind === "llm").length}</Tag>
                  <Tag style={{ fontSize: 10 }}>Embedding {modelLogs.filter(l => l.kind === "embedding").length}</Tag>
                </div>
              </div>
              <Space size={4}>
                <Button size="small" icon={<ReloadOutlined />} onClick={props.onSyncLogs}>
                  {t("同步", "Sync")}
                </Button>
                <Button size="small" icon={<DeleteOutlined />} onClick={props.onClearLogs}
                  disabled={modelLogs.length === 0}>
                  {t("清空", "Clear")}
                </Button>
              </Space>
            </div>

            {modelLogs.length === 0 ? (
              <Empty description={t("暂无原始日志", "No raw logs yet")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : [...modelLogs].sort((a, b) => b.sequence - a.sequence).map((log) => (
              <Card
                key={log.id}
                size="small"
                style={{
                  marginBottom: 8,
                  borderColor: log.status === "FAILED" ? "#ffccc7" : undefined,
                  background: log.status === "FAILED" ? "#fff2f0" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Tag color={log.kind === "llm" ? "blue" : "purple"} style={{ fontSize: 10 }}>
                      {log.kind === "llm" ? "LLM" : "Embedding"}
                    </Tag>
                    <Text strong style={{ fontSize: 12 }}>{log.operation}</Text>
                  </div>
                  <Tag color={log.status === "FAILED" ? "red" : "green"} style={{ fontSize: 10 }}>
                    {log.status === "FAILED" ? t("失败", "Failed") : t("成功", "Succeeded")}
                  </Tag>
                </div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                  #{log.sequence} · {formatDate(log.createdAt)} · {log.durationMs}ms
                </div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 10 }}>{t("请求", "Request")}</Text>
                  <Paragraph
                    style={{ fontSize: 10, whiteSpace: "pre-wrap", margin: "2px 0" }}
                    ellipsis={{ rows: 3, expandable: true, symbol: t("展开", "more") }}
                  >
                    {typeof log.request === "string" ? log.request : JSON.stringify(log.request, null, 2)}
                  </Paragraph>
                </div>
                {log.response !== undefined && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 10 }}>{t("返回", "Response")}</Text>
                    <Paragraph
                      style={{ fontSize: 10, whiteSpace: "pre-wrap", margin: "2px 0" }}
                      ellipsis={{ rows: 3, expandable: true, symbol: t("展开", "more") }}
                    >
                      {typeof log.response === "string" ? log.response : JSON.stringify(log.response, null, 2)}
                    </Paragraph>
                  </div>
                )}
                {log.error && (
                  <div style={{ fontSize: 10, color: "red", marginTop: 4, whiteSpace: "pre-wrap" }}>{log.error}</div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
