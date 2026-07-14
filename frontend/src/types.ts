/** Shared type definitions for WRAG frontend — aligned with SAG API response shapes. */

// =========================================================================
// Project
// =========================================================================
export interface SourceRecord {
  id: string;
  tenantId?: string;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// =========================================================================
// Document
// =========================================================================
export interface DocumentRecord {
  id: string;
  sourceId: string;
  title: string;
  fileName?: string;
  status?: string;
  parseStatus?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  source?: SourceRecord;
}

// =========================================================================
// Chunk
// =========================================================================
export interface EmbeddingPreview {
  dimensions: number;
  sample: number[];
}

export interface ChunkRecord {
  id: string;
  sourceId?: string;
  documentId?: string | null;
  heading?: string | null;
  content: string;
  rawContent?: string | null;
  rank?: number;
  references?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
  embedding?: EmbeddingPreview | null;
}

// =========================================================================
// Entity
// =========================================================================
export interface EntityRecord {
  id: string;
  sourceId?: string;
  type: string;
  name: string;
  normalizedName?: string;
  description?: string | null;
  eventCount?: number;
  score?: number;
  embedding?: EmbeddingPreview | null;
}

export interface EntityDetailRecord {
  entity: EntityRecord & { eventCount: number };
  events: EventRecord[];
  source?: SourceRecord | null;
}

// =========================================================================
// Event
// =========================================================================
export interface EventRecord {
  id: string;
  sourceId?: string;
  documentId?: string | null;
  chunkId?: string | null;
  title: string;
  summary?: string;
  content: string;
  rank?: number;
  score?: number;
  entityCount?: number;
  entities?: EntityRecord[];
  titleEmbedding?: EmbeddingPreview | null;
  contentEmbedding?: EmbeddingPreview | null;
}

export interface EventDetailRecord {
  event: EventRecord;
  entities: EntityRecord[];
  document?: DocumentRecord | null;
  source?: SourceRecord | null;
  chunk?: {
    chunkId: string;
    sourceId?: string;
    documentId?: string | null;
    heading?: string;
    content: string;
    rank?: number;
  };
}

// =========================================================================
// Project Stats
// =========================================================================
export interface ProjectStatsRecord {
  documentCount: number;
  chunkCount: number;
  eventCount: number;
  entityCount: number;
}

// =========================================================================
// Knowledge Graph
// =========================================================================
export interface ProjectGraphEntityRecord {
  id: string;
  sourceId: string;
  type: string;
  name: string;
  normalizedName?: string;
  eventCount: number;
}

export interface ProjectGraphEventRecord {
  id: string;
  sourceId: string;
  documentId?: string | null;
  title: string;
  rank: number;
  entityIds: string[];
}

export interface ProjectGraphRecord {
  entities: ProjectGraphEntityRecord[];
  events: ProjectGraphEventRecord[];
  edges: Array<{ entityId: string; eventId: string }>;
}

// =========================================================================
// Upload
// =========================================================================
export type UploadJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type UploadJobStage =
  | "QUEUED"
  | "READING"
  | "PARSING"
  | "CHUNKING"
  | "EMBEDDING_CHUNKS"
  | "EXTRACTING_EVENTS"
  | "EMBEDDING_EVENTS"
  | "WRITING_GRAPH"
  | "COMPLETED"
  | "FAILED";

export interface UploadJobRecord {
  id: string;
  sourceId: string;
  fileName: string;
  title: string;
  status: UploadJobStatus;
  stage: UploadJobStage;
  message: string;
  progress: number; // 0–100
  chunkCount?: number;
  eventCount?: number;
  currentChunk?: number;
  totalChunks?: number;
  documentId?: string;
  traceId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResult {
  file_id?: string | null;
  document_id: string;
  project_id: string;
  original_filename: string;
  original_format: string;
  md_size_bytes: number;
  chunk_count: number;
  event_count: number;
  markdown_saved: boolean;
}

// =========================================================================
// Markdown Files
// =========================================================================
export interface ImportRecord {
  project_id: string;
  project_name: string | null;
  document_id: string;
  imported_at: string;
}

export interface MdFileInfo {
  id: string;
  original_filename: string;
  original_format: string;
  md_filename: string;
  md_size_bytes: number;
  original_size_bytes: number | null;
  created_at: string;
  updated_at: string | null;
  import_count: number;
  imports: ImportRecord[];
}

// =========================================================================
// Search
// =========================================================================
export type SearchMode = "fast" | "standard";
export type ChunkingMode = "heading_strict" | "token";

export interface SearchResultSection {
  chunkId: string;
  sourceId: string;
  documentId?: string;
  heading?: string;
  content: string;
  rank: number;
  score: number;
}

export interface SearchResult {
  traceId: string;
  sections: SearchResultSection[];
  trace?: Record<string, unknown>;
}

export interface SearchProgressEvent {
  type: "step";
  status: "running" | "done" | "failed";
  key: string;
  title: string;
  detail: string;
  payload?: unknown;
  durationMs?: number;
}

export type SearchStreamEvent =
  | SearchProgressEvent
  | { type: "done"; result: SearchResult }
  | { type: "error"; message: string };

// =========================================================================
// Model Call Logs
// =========================================================================
export interface ModelCallLogRecord {
  sequence: number;
  id: string;
  kind: "llm" | "embedding";
  operation: string;
  status: "SUCCEEDED" | "FAILED";
  createdAt: string;
  durationMs: number;
  request: unknown;
  response?: unknown;
  error?: string;
}

// =========================================================================
// MCP Sessions
// =========================================================================
export interface McpSessionRecord {
  id: string;
  tenantId?: string;
  title: string;
  status?: string;
  model?: string | null;
  sourceIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface McpMessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface McpToolCallRecord {
  id: string;
  sessionId: string;
  messageId?: string | null;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  durationMs?: number | null;
  error?: string | null;
  createdAt: string;
}

export interface McpSessionDetail {
  session: McpSessionRecord;
  messages: McpMessageRecord[];
  toolCalls: McpToolCallRecord[];
}

export type McpStreamEvent =
  | { type: "stage"; label: string; detail?: string }
  | { type: "message"; message: McpMessageRecord }
  | { type: "assistant_delta"; delta: string }
  | { type: "tool_start"; toolName: string; arguments: Record<string, unknown> }
  | { type: "search_progress"; event: SearchProgressEvent }
  | { type: "tool_end"; toolCall: McpToolCallRecord }
  | { type: "done"; detail: McpSessionDetail }
  | { type: "error"; message: string };

// =========================================================================
// Settings
// =========================================================================
export interface PublicAiProviderSettings {
  id?: "global";
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingDimensions: number;
  hasEmbeddingApiKey: boolean;
  llmBaseUrl: string;
  llmModel: string;
  hasLlmApiKey: boolean;
  llmTimeoutMs: number;
  llmMaxRetries: number;
  defaultSearchMode: SearchMode;
  defaultSearchTopK: number;
  defaultChunkingMode: ChunkingMode;
  chunkTokenLimit: number;
  chunkOverlapTokens: number;
  updatedAt?: string;
}

export interface PublicMcpSettings {
  toolTimeoutMs?: number;
  clientConfigs?: Array<{
    id: string;
    title: string;
    description: string;
    config: Record<string, unknown>;
  }>;
  tools: McpToolInfo[];
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  example?: Record<string, unknown>;
}

// =========================================================================
// Format Info
// =========================================================================
export interface FormatsInfo {
  formats: string[];
  max_upload_size_mb: number | null;
}

// =========================================================================
// Answer Citation (extracted from message metadata)
// =========================================================================
export interface AnswerCitation {
  index: number;
  chunkId: string;
  sourceId: string;
  documentId?: string;
  heading?: string;
  content: string;
  rank?: number;
  score?: number;
  query?: string;
}

// =========================================================================
// Process Step (for Activity Panel trace display)
// =========================================================================
export type ProcessStepStatus = "running" | "done" | "failed";

export interface ProcessStep {
  id: string;
  title: string;
  detail?: string;
  status: ProcessStepStatus;
  payload?: unknown;
  durationMs?: number | null;
}

// =========================================================================
// Running MCP Search (displayed in chat during tool execution)
// =========================================================================
export interface RunningMcpSearch {
  id: string;
  toolName: string;
  query: string;
  searchMode?: string;
}

// =========================================================================
// Detail Drawer
// =========================================================================
export type DetailDrawer =
  | { type: "event"; detail: EventDetailRecord }
  | { type: "entity"; detail: EntityDetailRecord }
  | { type: "citation"; citation: AnswerCitation }
  | null;
