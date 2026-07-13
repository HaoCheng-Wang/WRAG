/** Chat page — conversational RAG via MCP sessions with SSE streaming. */

import { useState, useRef, useEffect } from "react";
import {
  Input, Button, List, Typography, Space, Tag, Spin, Empty,
} from "antd";
import { SendOutlined, StopOutlined } from "@ant-design/icons";
import { api } from "../lib/api";
import CitationDrawer from "../components/CitationDrawer";

const { Text, Paragraph } = Typography;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { number: number; chunk: any }[];
}

interface Props {
  projectId: string;
  sessionId: string | null;
  onSessionChange: (id: string | null) => void;
  onTraceUpdate: (trace: any[]) => void;
  onLogUpdate: (logs: any[]) => void;
  onActivityOpen: (open: boolean) => void;
  onActivityMode: (mode: "trace" | "logs") => void;
  t: (zh: string, en: string) => string;
}

export default function Chat({ projectId, sessionId, onSessionChange, onTraceUpdate, onLogUpdate, onActivityOpen, onActivityMode, t }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [citationOpen, setCitationOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState<{ number: number; chunk: any } | null>(null);

  // Ensure MCP session exists
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const data = await api.listMcpSessions(projectId);
        const sessions = data.sessions ?? [];
        if (sessions.length > 0) {
          onSessionChange(sessions[0].id);
        } else {
          const created = await api.createMcpSession({ title: `Chat - ${projectId.slice(0, 8)}`, sourceIds: [projectId] });
          onSessionChange(created.session.id);
        }
      } catch (e: any) { console.warn("MCP session init failed:", e); }
    })();
  }, [projectId]);

  const handleSend = async () => {
    if (!input.trim() || !sessionId || streaming) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamContent("");

    const controller = new AbortController();
    abortRef.current = controller;
    const traces: any[] = [];
    const logs: any[] = [];

    try {
      await api.streamMcpMessage(
        sessionId,
        userMsg.content,
        (event) => {
          switch (event.type) {
            case "assistant_delta":
              setStreamContent((prev) => prev + (event.data?.delta ?? ""));
              break;
            case "search_progress":
              traces.push(event.data);
              break;
            case "tool_end":
              traces.push(event.data);
              break;
            case "tool_start":
              traces.push({ ...event.data, status: "running" });
              break;
            default:
              logs.push(event);
          }
        },
        controller.signal
      );

      // Finalize
      let finalContent = streamContent || "(empty response)";
      // Parse citations from content: [1], [2], etc.
      const citPattern = /\[(\d+)\]/g;
      const citations: { number: number; chunk: any }[] = [];
      // Collect citations from trace
      traces.forEach((t) => {
        if (t.chunks) {
          t.chunks.forEach((c: any, i: number) => {
            citations.push({ number: (citations.length + 1), chunk: c });
          });
        }
      });

      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: finalContent, citations },
      ]);
      setStreamContent("");
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 1).toString(), role: "assistant", content: `Error: ${e.message}` },
        ]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      onTraceUpdate(traces);
      onLogUpdate(logs);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleCitationClick = (cit: { number: number; chunk: any }) => {
    setActiveCitation(cit);
    setCitationOpen(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {messages.length === 0 && !streaming && (
          <Empty description={t("开始对话吧", "Start a conversation")} style={{ marginTop: 120 }} />
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 20 }}>
            <Tag color={msg.role === "user" ? "blue" : "green"}>{msg.role === "user" ? "You" : "WRAG"}</Tag>
            <Paragraph style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
              {msg.content}
              {msg.citations?.map((c) => (
                <Tag
                  key={c.number}
                  color="orange"
                  style={{ cursor: "pointer", marginLeft: 4 }}
                  onClick={() => handleCitationClick(c)}
                >
                  [{c.number}]
                </Tag>
              ))}
            </Paragraph>
          </div>
        ))}
        {streaming && (
          <div style={{ marginBottom: 20 }}>
            <Tag color="green">WRAG</Tag>
            <Paragraph style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{streamContent}<Spin size="small" style={{ marginLeft: 8 }} /></Paragraph>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: 16, borderTop: "1px solid #f0f0f0" }}>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={handleSend}
            placeholder={t("输入你的问题...", "Ask a question...")}
            disabled={!sessionId}
            style={{ flex: 1 }}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={handleSend} disabled={!input.trim() || streaming}>
            {t("发送", "Send")}
          </Button>
          {streaming && (
            <Button danger icon={<StopOutlined />} onClick={handleStop}>
              {t("停止", "Stop")}
            </Button>
          )}
        </Space.Compact>
      </div>

      <CitationDrawer open={citationOpen} citation={activeCitation} onClose={() => setCitationOpen(false)} t={t} />
    </div>
  );
}
