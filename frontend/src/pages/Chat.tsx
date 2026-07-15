/** Chat page — conversational RAG via MCP sessions with SSE streaming.
 *
 *  Exact same state management as SAG's ConversationWorkspace:
 *  - Functional updaters for mcpDetail (never stale)
 *  - appendMessageToDetail / appendToolCallToDetail per SAG
 *  - handleMcpStreamEvent dispatch matching SAG exactly
 *  - sendMcpMessage flow matching SAG exactly
 *  - Ant Design styling for bubbles, citations, and controls
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

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  projectId: string;
  project: SourceRecord | null;
  isMcpRunning: boolean;
  pendingUserMessage: string;
  streamingAssistantText: string;
  runningMcpSearches: RunningMcpSearch[];
  processSteps: ProcessStep[];
  onMcpDetailChange: (updater: McpSessionDetail | null | ((prev: McpSessionDetail | null) => McpSessionDetail | null)) => void;
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
  // Current mcpDetail from parent (used for initial load, session lookup)
  mcpDetail: McpSessionDetail | null;
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
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Auto-scroll to bottom (matching SAG)
  // -----------------------------------------------------------------------

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [mcpDetail?.messages.length, pendingUserMessage, streamingAssistantText, isMcpRunning, runningMcpSearches.length]);

  // -----------------------------------------------------------------------
  // Auto-load existing session on project change
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!projectId) return;
    if (mcpDetail) return;
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
  // Helpers — match SAG's functional updater pattern exactly
  // -----------------------------------------------------------------------

  function appendMessageToDetail(message: McpMessageRecord) {
    props.onMcpDetailChange((current) => {
      if (!current || current.session.id !== message.sessionId) return current;
      if (current.messages.some((item) => item.id === message.id)) return current;
      return {
        ...current,
        messages: [...current.messages, message],
      };
    });
  }

  function appendToolCallToDetail(toolCall: McpToolCallRecord) {
    props.onMcpDetailChange((current) => {
      if (!current || current.session.id !== toolCall.sessionId) return current;
      if (current.toolCalls.some((item) => item.id === toolCall.id)) return current;
      return {
        ...current,
        toolCalls: [...current.toolCalls, toolCall],
      };
    });
  }

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

  // -----------------------------------------------------------------------
  // SSE event handler — EXACT SAG pattern
  // -----------------------------------------------------------------------

  function handleMcpStreamEvent(event: McpStreamEvent) {
    if (event.type === "stage") {
      return;
    }
    if (event.type === "message") {
      appendMessageToDetail(event.message);
      if (event.message.role === "user") {
        props.onPendingUserMessageChange("");
      }
      if (event.message.role === "assistant") {
        props.onStreamingAssistantTextChange("");
      }
      return;
    }
    if (event.type === "assistant_delta") {
      props.onStreamingAssistantTextChange((current) => current + event.delta);
      return;
    }
    if (event.type === "tool_start") {
      if (event.toolName === "sag_search") {
        const query = typeof event.arguments.query === "string" && event.arguments.query.trim()
          ? event.arguments.query.trim()
          : t("未提供查询参数", "No query argument provided");
        const mode = typeof event.arguments.searchMode === "string" ? event.arguments.searchMode : undefined;
        props.onRunningMcpSearchesChange([
          ...runningMcpSearches,
          { id: makeStepId("search"), toolName: event.toolName, query, searchMode: mode },
        ]);
        addProcessStep({
          id: "mcp-sag-search-running",
          title: t("SAG 检索执行中", "SAG retrieval is running"),
          detail: t("MCP 工具已发起 sag_search，正在实时接收 SAG 内部检索阶段。", "The MCP tool has started sag_search and is receiving SAG internal retrieval stages in real time."),
          status: "running",
          payload: event.arguments as any,
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
      appendToolCallToDetail(event.toolCall);
      if (event.toolCall.toolName === "sag_search") {
        if (event.toolCall.status === "FAILED") {
          props.onProcessStepsChange([{
            id: makeStepId("sag-search-failed"),
            title: t("SAG 检索失败", "SAG retrieval failed"),
            detail: event.toolCall.error ?? t("工具返回失败", "Tool returned a failure"),
            status: "failed",
          }]);
          return;
        }
        // Pass raw tool result to parent for trace parsing
        props.onLogUpdate([event.toolCall]);
      }
      return;
    }
    if (event.type === "done") {
      if (event.detail) {
        props.onMcpDetailChange(event.detail);
      }
      finishRunningSteps();
      setStatus(t("对话完成", "Conversation complete"));
      return;
    }
    if (event.type === "error") {
      addProcessStep({
        id: makeStepId("mcp-error"),
        title: t("执行失败", "Execution failed"),
        detail: event.message,
        status: "failed",
      });
    }
  }

  // -----------------------------------------------------------------------
  // Send message — EXACT SAG pattern
  // -----------------------------------------------------------------------

  async function sendMcpMessage() {
    const content = input.trim();
    if (!content || !projectId) return;
    let sessionId = mcpDetail?.session.id;
    const abortController = new AbortController();
    abortRef.current = abortController;
    props.onIsMcpRunningChange(true);
    props.onPendingUserMessageChange(content);
    props.onStreamingAssistantTextChange("");
    props.onRunningMcpSearchesChange([]);
    props.onActivityMode("trace");
    props.onProcessStepsChange([]);
    setInput("");
    setStatus("");
    try {
      if (!sessionId) {
        const response = await api.createMcpSession({ sourceIds: [projectId] });
        sessionId = response.session.id;
        const detail = await api.getMcpSession(sessionId);
        props.onMcpDetailChange(detail);
        props.onSessionCreated(sessionId);
      }
      await api.streamMcpMessage(sessionId, content, handleMcpStreamEvent, abortController.signal);
      await syncModelLogs();
    } catch (err: any) {
      await syncModelLogs();
      if (err.name === "AbortError") {
        setStatus(t("已停止生成", "Generation stopped"));
        if (sessionId) {
          const detail = await api.getMcpSession(sessionId);
          props.onMcpDetailChange(detail);
        }
        addProcessStep({
          id: makeStepId("stopped"),
          title: t("已停止", "Stopped"),
          detail: t("你手动停止了本轮对话。", "You manually stopped this conversation turn."),
          status: "done",
        });
        return;
      }
      setStatus(err.message);
      addProcessStep({
        id: makeStepId("error"),
        title: t("对话失败", "Conversation failed"),
        detail: err.message,
        status: "failed",
      });
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
      props.onPendingUserMessageChange("");
      props.onStreamingAssistantTextChange("");
      props.onIsMcpRunningChange(false);
    }
  }

  async function syncModelLogs() {
    try {
      const res = await api.listModelCallLogs(0);
      props.onLogUpdate(res.logs ?? []);
    } catch { /* logs are best-effort */ }
  }

  function stopMcpMessage() {
    if (!isMcpRunning) return;
    setStatus(t("正在停止生成...", "Stopping generation..."));
    abortRef.current?.abort();
  }

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

  async function handleClearSession() {
    if (!mcpDetail) return;
    try {
      const detail = await api.clearMcpSession(mcpDetail.session.id);
      props.onMcpDetailChange(detail);
      props.onProcessStepsChange([]);
    } catch (e: any) { message.error(e.message); }
  }

  async function handleDeleteSession() {
    if (!mcpDetail) return;
    try {
      await api.deleteMcpSession(mcpDetail.session.id);
      props.onMcpDetailChange(null);
      props.onProcessStepsChange([]);
    } catch (e: any) { message.error(e.message); }
  }

  // -----------------------------------------------------------------------
  // Render — Ant Design version of SAG's ConversationWorkspace
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
      {/* Header — matching SAG's session header */}
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

      {/* Messages area — matching SAG's scroll area */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {/* Empty state */}
          {messages.length === 0 && !isMcpRunning && (
            <Empty
              description={t("还没有对话", "No conversation yet")}
              style={{ marginTop: 80 }}
            />
          )}

          {/* Completed messages */}
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
                  {/* Citation strip */}
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

          {/* Pending user message (optimistic render) */}
          {pendingUserMessage ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <div style={{
                maxWidth: "86%", padding: "10px 14px", borderRadius: 8,
                background: "#1677ff", color: "#fff",
              }}>
                <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>{t("用户", "User")}</div>
                <MarkdownMessage content={pendingUserMessage} />
              </div>
            </div>
          ) : null}

          {/* Running MCP searches indicator */}
          {isMcpRunning ? (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
              <div style={{
                maxWidth: "86%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #f0f0f0", background: "#fafafa",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <LoadingOutlined />
                  <Text strong>{t("正在使用 MCP 检索", "Using MCP retrieval")}</Text>
                  {runningMcpSearches.length > 0 ? (
                    <Tag>{t(`${runningMcpSearches.length} 次搜索`, `${runningMcpSearches.length} search(es)`)}</Tag>
                  ) : null}
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
                    {s.searchMode ? (
                      <div style={{ fontSize: 11, color: "#999" }}>{t("模式", "Mode")}: {s.searchMode}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Streaming assistant text (real-time deltas) */}
          {streamingAssistantText ? (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
              <div style={{
                maxWidth: "86%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #f0f0f0", background: "#f5f5f5",
              }}>
                <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>{t("助手", "Assistant")}</div>
                <MarkdownMessage content={streamingAssistantText} />
              </div>
            </div>
          ) : null}

          {/* Status message */}
          {status ? (
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{status}</Text>
            </div>
          ) : null}

          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input bar — matching SAG's input area */}
      <div style={{ padding: "8px 24px", borderTop: "1px solid #f0f0f0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!isMcpRunning && input.trim()) sendMcpMessage();
                }
              }}
              placeholder={t("基于当前项目资料提问...", "Ask about the current project documents...")}
              disabled={isMcpRunning}
            />
            <Button
              type={isMcpRunning ? "default" : "primary"}
              danger={isMcpRunning}
              icon={isMcpRunning ? <StopOutlined /> : <SendOutlined />}
              onClick={isMcpRunning ? stopMcpMessage : sendMcpMessage}
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
