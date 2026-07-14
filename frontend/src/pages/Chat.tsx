/** Chat page — conversational RAG via MCP sessions with SSE streaming.
 *
 *  Fully matches SAG's ConversationWorkspace:
 *  - Markdown rendering with code blocks, tables, inline formatting
 *  - Citation strip below assistant messages
 *  - Running MCP search display during sag_search tool calls
 *  - Streaming assistant text with real-time delta display
 *  - Session header with clear/delete actions
 *  - Stop generation via AbortController
 */

import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  Input, Button, Space, Tag, Spin, Empty, Typography, Popconfirm, message,
} from "antd";
import { SendOutlined, StopOutlined, ClearOutlined, DeleteOutlined, LoadingOutlined } from "@ant-design/icons";
import { api } from "../lib/api";
import { MarkdownMessage, getMessageCitations, formatDate, shortId, makeStepId } from "../lib/markdown";
import CitationDrawer from "../components/CitationDrawer";
import type {
  SourceRecord, McpSessionDetail, McpMessageRecord, McpStreamEvent,
  McpToolCallRecord, AnswerCitation, ProcessStep, RunningMcpSearch, SearchProgressEvent,
} from "../types";

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  projectId: string;
  project: SourceRecord | null;
  mcpDetail: McpSessionDetail | null;
  isMcpRunning: boolean;
  pendingUserMessage: string;
  streamingAssistantText: string;
  runningMcpSearches: RunningMcpSearch[];
  processSteps: ProcessStep[];
  onMcpDetailChange: (detail: McpSessionDetail | null) => void;
  onIsMcpRunningChange: (v: boolean) => void;
  onPendingUserMessageChange: (v: string) => void;
  onStreamingAssistantTextChange: (v: string | ((prev: string) => string)) => void;
  onRunningMcpSearchesChange: (searches: RunningMcpSearch[]) => void;
  onProcessStepsChange: (steps: ProcessStep[]) => void;
  onTraceUpdate: (trace: any[]) => void;
  onLogUpdate: (logs: any[]) => void;
  onActivityOpen: (open: boolean) => void;
  onActivityMode: (mode: "trace" | "logs") => void;
  onSessionCreated: (sessionId: string) => void;
  t: (zh: string, en: string) => string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Chat(props: Props) {
  const {
    projectId, project, mcpDetail, isMcpRunning, pendingUserMessage,
    streamingAssistantText, runningMcpSearches, processSteps, t,
  } = props;

  const [input, setInput] = useState("");
  const [citationOpen, setCitationOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState<AnswerCitation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refs to always read latest values from streaming callback (prevent stale closure)
  const mcpDetailRef = useRef(mcpDetail);
  const runningMcpSearchesRef = useRef(runningMcpSearches);
  mcpDetailRef.current = mcpDetail;
  runningMcpSearchesRef.current = runningMcpSearches;

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [mcpDetail?.messages.length, pendingUserMessage, streamingAssistantText, isMcpRunning, runningMcpSearches.length]);

  // Ensure MCP session exists
  useEffect(() => {
    if (!projectId) return;
    if (mcpDetail) return; // already loaded
    (async () => {
      try {
        const data = await api.listMcpSessions(projectId);
        const sessions = data.sessions ?? [];
        if (sessions.length > 0) {
          const detail = await api.getMcpSession(sessions[0].id);
          props.onMcpDetailChange(detail);
        }
      } catch { /* session will be created on first message */ }
    })();
  }, [projectId]);

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !projectId || isMcpRunning) return;

    let sessionId = mcpDetail?.session.id;
    const controller = new AbortController();
    abortRef.current = controller;

    props.onIsMcpRunningChange(true);
    props.onPendingUserMessageChange(content);
    props.onStreamingAssistantTextChange("");
    props.onRunningMcpSearchesChange([]);
    props.onActivityMode("trace");
    props.onProcessStepsChange([]);
    setInput("");

    try {
      // Create session if needed
      if (!sessionId) {
        const created = await api.createMcpSession({ sourceIds: [projectId] });
        sessionId = created.session.id;
        const detail = await api.getMcpSession(sessionId);
        props.onMcpDetailChange(detail);
        props.onSessionCreated(sessionId);
      }

      await api.streamMcpMessage(
        sessionId,
        content,
        (event) => handleStreamEvent(event),
        controller.signal,
      );

      await syncModelLogsAfter();
    } catch (e: any) {
      if (e.name === "AbortError") {
        message.info(t("已停止生成", "Generation stopped"));
        if (sessionId) {
          const detail = await api.getMcpSession(sessionId);
          props.onMcpDetailChange(detail);
        }
        addProcessStep({
          id: makeStepId("stopped"),
          title: t("已停止", "Stopped"),
          detail: t("你手动停止了本轮对话。", "You manually stopped this conversation turn."),
          status: "done" as const,
        });
        return;
      }
      message.error(e.message);
      addProcessStep({
        id: makeStepId("error"),
        title: t("对话失败", "Conversation failed"),
        detail: e.message,
        status: "failed" as const,
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      props.onPendingUserMessageChange("");
      props.onStreamingAssistantTextChange("");
      props.onIsMcpRunningChange(false);
    }
  };

  // -----------------------------------------------------------------------
  // SSE event handler (matches SAG's handleMcpStreamEvent)
  // -----------------------------------------------------------------------

  function handleStreamEvent(event: McpStreamEvent) {
    props.onLogUpdate([event]); // accumulate for ActivityPanel

    if (event.type === "stage") return;

    if (event.type === "message") {
      const detail = mcpDetailRef.current;
      if (!detail) return;
      if (event.message.role === "user") props.onPendingUserMessageChange("");
      if (event.message.role === "assistant") props.onStreamingAssistantTextChange("");
      const exists = detail.messages.some((m) => m.id === event.message.id);
      if (!exists) {
        props.onMcpDetailChange({
          ...detail,
          messages: [...detail.messages, event.message],
        });
      }
      return;
    }

    if (event.type === "assistant_delta") {
      props.onStreamingAssistantTextChange((prev) => prev + event.delta);
      return;
    }

    if (event.type === "tool_start") {
      if (event.toolName === "sag_search") {
        const query = typeof event.arguments.query === "string" && event.arguments.query.trim()
          ? event.arguments.query.trim()
          : t("未提供查询参数", "No query argument provided");
        const mode = typeof event.arguments.searchMode === "string" ? event.arguments.searchMode : undefined;
        props.onRunningMcpSearchesChange([
          ...runningMcpSearchesRef.current,
          { id: makeStepId("search"), toolName: event.toolName, query, searchMode: mode },
        ]);
        addProcessStep({
          id: makeStepId("mcp-search"),
          title: t("MCP 搜索语句", "MCP search query"),
          detail: query,
          status: "running",
        });
      }
      return;
    }

    if (event.type === "search_progress") {
      upsertProcessStep({
        id: `search-${event.event.key}`,
        title: event.event.title,
        detail: event.event.detail,
        status: event.event.status === "running" ? "running" : event.event.status === "failed" ? "failed" : "done",
        payload: event.event.payload,
        durationMs: event.event.durationMs ?? null,
      });
      return;
    }

    if (event.type === "tool_end") {
      const detail = mcpDetailRef.current;
      if (detail) {
        const exists = detail.toolCalls.some((tc) => tc.id === event.toolCall.id);
        if (!exists) {
          props.onMcpDetailChange({
            ...detail,
            toolCalls: [...detail.toolCalls, event.toolCall],
          });
        }
      }
      if (event.toolCall.toolName === "sag_search") {
        finishRunningSteps();
        if (event.toolCall.status === "FAILED") {
          props.onProcessStepsChange([{
            id: makeStepId("sag-failed"),
            title: t("SAG 检索失败", "SAG retrieval failed"),
            detail: event.toolCall.error ?? t("工具返回失败", "Tool returned a failure"),
            status: "failed",
          }]);
        }
      }
      return;
    }

    if (event.type === "done") {
      if (event.detail) props.onMcpDetailChange(event.detail);
      finishRunningSteps();
      message.success(t("对话完成", "Conversation complete"));
      return;
    }

    if (event.type === "error") {
      addProcessStep({
        id: makeStepId("mcp-error"),
        title: t("执行失败", "Execution failed"),
        detail: event.message,
        status: "failed",
      });
      message.error(event.message);
    }
  }

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

  const handleStop = () => {
    if (!isMcpRunning) return;
    abortRef.current?.abort();
  };

  const handleClearSession = async () => {
    if (!mcpDetail) return;
    try {
      const detail = await api.clearMcpSession(mcpDetail.session.id);
      props.onMcpDetailChange(detail);
      props.onProcessStepsChange([]);
      message.success(t("对话记录已清空", "Conversation history cleared"));
    } catch (e: any) { message.error(e.message); }
  };

  const handleDeleteSession = async () => {
    if (!mcpDetail) return;
    try {
      await api.deleteMcpSession(mcpDetail.session.id);
      props.onMcpDetailChange(null);
      props.onProcessStepsChange([]);
      message.success(t("对话已删除", "Conversation deleted"));
    } catch (e: any) { message.error(e.message); }
  };

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function addProcessStep(step: ProcessStep) {
    props.onProcessStepsChange([...processSteps, step]);
  }

  function upsertProcessStep(step: ProcessStep) {
    const idx = processSteps.findIndex((s) => s.id === step.id);
    if (idx === -1) {
      props.onProcessStepsChange([...processSteps, step]);
    } else {
      const next = [...processSteps];
      next[idx] = { ...next[idx], ...step };
      props.onProcessStepsChange(next);
    }
  }

  function finishRunningSteps() {
    props.onProcessStepsChange(
      processSteps.map((s) => s.status === "running" ? { ...s, status: "done" as const } : s)
    );
  }

  async function syncModelLogsAfter() {
    try {
      const res = await api.listModelCallLogs(0);
      props.onLogUpdate(res.logs ?? []);
    } catch { /* logs are best-effort */ }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (!project) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "#999" }}>
        <Empty description={t("先创建项目", "Create a project first")} />
      </div>
    );
  }

  const messages = mcpDetail?.messages ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 24px", borderBottom: "1px solid #f0f0f0", flexWrap: "wrap", gap: 8,
      }}>
        <div>
          <Text strong>{mcpDetail?.session.title ?? t("新对话", "New chat")}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {mcpDetail
              ? `${mcpDetail.session.model ?? t("未知模型", "Unknown model")} · ${shortId(mcpDetail.session.id)}`
              : t("新建会话后开始对话", "Create a session to start chatting")}
          </Text>
        </div>
        <Space>
          <Button size="small" icon={<ClearOutlined />} onClick={handleClearSession}
            disabled={!mcpDetail || isMcpRunning}>
            {t("清空记录", "Clear history")}
          </Button>
          <Popconfirm
            title={t("删除此对话？此操作不可恢复。", "Delete this conversation? This cannot be undone.")}
            onConfirm={handleDeleteSession}
            okText={t("删除", "Delete")}
            cancelText={t("取消", "Cancel")}
          >
            <Button size="small" danger icon={<DeleteOutlined />}
              disabled={!mcpDetail || isMcpRunning}>
              {t("删除对话", "Delete chat")}
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {messages.length === 0 && !isMcpRunning && (
            <Empty
              description={t("还没有对话", "No conversation yet")}
              style={{ marginTop: 80 }}
            />
          )}

          {messages.map((msg) => {
            const citations = getMessageCitations(msg as any);
            return (
              <div key={msg.id} style={{
                display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 16,
              }}>
                <div style={{
                  maxWidth: "86%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: msg.role === "user" ? "#1677ff" : "#f5f5f5",
                  color: msg.role === "user" ? "#fff" : undefined,
                  border: msg.role === "assistant" ? "1px solid #f0f0f0" : undefined,
                }}>
                  <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>
                    {msg.role === "user" ? t("用户", "User") : t("助手", "Assistant")}
                    {" · "}{msg.createdAt ? formatDate(msg.createdAt) : ""}
                  </div>
                  <MarkdownMessage
                    content={msg.content}
                    citations={citations}
                    onOpenCitation={(cit) => { setActiveCitation(cit); setCitationOpen(true); }}
                  />
                  {msg.role === "assistant" && citations.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>{t("引用原文", "Source citations")}</Text>
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {citations.map((cit) => (
                          <Tag
                            key={`${cit.index}-${cit.chunkId}`}
                            color="orange"
                            style={{ cursor: "pointer", fontSize: 11 }}
                            onClick={() => { setActiveCitation(cit); setCitationOpen(true); }}
                            title={cit.heading || cit.chunkId}
                          >
                            [{cit.index}]
                          </Tag>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pending user message */}
          {pendingUserMessage && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <div style={{
                maxWidth: "86%", padding: "10px 14px", borderRadius: 8,
                background: "#1677ff", color: "#fff",
              }}>
                <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>{t("用户", "User")}</div>
                <MarkdownMessage content={pendingUserMessage} />
              </div>
            </div>
          )}

          {/* Running MCP searches */}
          {isMcpRunning && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
              <div style={{
                maxWidth: "86%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #f0f0f0", background: "#fafafa",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <LoadingOutlined />
                  <Text strong>{t("正在使用 MCP 检索", "Using MCP retrieval")}</Text>
                  {runningMcpSearches.length > 0 && (
                    <Tag>{t(`${runningMcpSearches.length} 次搜索`, `${runningMcpSearches.length} search(es)`)}</Tag>
                  )}
                </div>
                {runningMcpSearches.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t("正在分析问题，等待 MCP 搜索语句...", "Analyzing the question, waiting for MCP search queries...")}
                  </Text>
                ) : runningMcpSearches.map((s, i) => (
                  <div key={s.id} style={{
                    marginTop: 4, padding: "6px 8px", borderRadius: 4,
                    border: "1px solid #f0f0f0", background: "#fff",
                  }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {t(`搜索 ${i + 1}：`, `Search ${i + 1}: `)}
                    </Text>
                    <Text style={{ fontSize: 13 }}>{s.query}</Text>
                    {s.searchMode && (
                      <div style={{ fontSize: 11, color: "#999" }}>{t("模式", "Mode")}: {s.searchMode}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Streaming assistant text */}
          {streamingAssistantText && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
              <div style={{
                maxWidth: "86%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #f0f0f0", background: "#f5f5f5",
              }}>
                <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>{t("助手", "Assistant")}</div>
                <MarkdownMessage content={streamingAssistantText} />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "8px 24px", borderTop: "1px solid #f0f0f0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!isMcpRunning && input.trim()) handleSend();
                }
              }}
              placeholder={t("基于当前项目资料提问...", "Ask about the current project documents...")}
              disabled={isMcpRunning}
            />
            <Button
              type={isMcpRunning ? "default" : "primary"}
              danger={isMcpRunning}
              icon={isMcpRunning ? <StopOutlined /> : <SendOutlined />}
              onClick={isMcpRunning ? handleStop : handleSend}
              disabled={!isMcpRunning && !input.trim()}
            >
              {isMcpRunning ? t("停止", "Stop") : t("发送", "Send")}
            </Button>
          </Space.Compact>
        </div>
      </div>

      <CitationDrawer
        open={citationOpen}
        citation={activeCitation}
        onClose={() => setCitationOpen(false)}
        t={t}
      />
    </div>
  );
}
