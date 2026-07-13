/** Right-side activity panel: search trace + raw logs. */

import { Button, Tabs, Tag, Typography, Empty } from "antd";
import { CloseOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;

interface Props {
  mode: "trace" | "logs";
  trace: any[];
  logs: any[];
  onClose: () => void;
  onModeChange: (m: "trace" | "logs") => void;
  t: (zh: string, en: string) => string;
}

export default function ActivityPanel({ mode, trace, logs, onClose, onModeChange, t }: Props) {
  return (
    <div style={{ padding: 12, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Tabs
          activeKey={mode}
          onChange={(k) => onModeChange(k as "trace" | "logs")}
          items={[
            { key: "trace", label: t("搜索过程", "Search Trace") },
            { key: "logs", label: t("原始日志", "Raw Logs") },
          ]}
          style={{ marginBottom: 0 }}
          tabBarStyle={{ marginBottom: 0, fontSize: 12 }}
        />
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {mode === "trace" && (
          trace.length === 0 ? (
            <Empty description={t("暂无搜索过程", "No search trace yet")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            trace.map((step: any, i: number) => (
              <div key={i} style={{ marginBottom: 8, padding: 8, background: "#fafafa", borderRadius: 6, border: "1px solid #f0f0f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 12 }}>{step.step}</Text>
                  <Tag color={step.status === "done" ? "green" : step.status === "running" ? "blue" : "red"} style={{ fontSize: 11 }}>
                    {step.status}
                  </Tag>
                </div>
                {step.duration_ms != null && <Text type="secondary" style={{ fontSize: 11 }}>{step.duration_ms}ms</Text>}
                {step.data && (
                  <Paragraph
                    style={{ fontSize: 11, marginTop: 4, whiteSpace: "pre-wrap" }}
                    ellipsis={{ rows: 6, expandable: true, symbol: t("展开", "Expand") }}
                  >
                    {typeof step.data === "string" ? step.data : JSON.stringify(step.data, null, 2)}
                  </Paragraph>
                )}
              </div>
            ))
          )
        )}

        {mode === "logs" && (
          logs.length === 0 ? (
            <Empty description={t("暂无日志", "No logs yet")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            logs.map((log: any, i: number) => (
              <div key={i} style={{ marginBottom: 8, padding: 8, background: "#fafafa", borderRadius: 6, border: "1px solid #f0f0f0", fontSize: 11 }}>
                <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }} ellipsis={{ rows: 8, expandable: true }}>
                  {typeof log === "string" ? log : JSON.stringify(log, null, 2)}
                </Paragraph>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
