/** Shared type definitions for WRAG frontend. */

// Project
export interface SourceRecord {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  archived_at?: string | null;
  tenant_id: string;
}

// Document
export interface DocumentRecord {
  id: string;
  source_id: string;
  title: string;
  file_name: string;
  parse_status: string;
  chunk_count: number;
  event_count: number;
  entity_count: number;
  archived_at?: string | null;
  created_at: string;
}

// Chunk
export interface ChunkRecord {
  id: string;
  content: string;
  embedding_preview?: number[];
}

// Entity
export interface EntityRecord {
  id: string;
  name: string;
  normalized_name: string;
  type: string;
  event_count: number;
}

export interface EntityDetailRecord {
  id: string;
  name: string;
  normalized_name: string;
  type: string;
  events: EventRecord[];
}

// Event
export interface EventRecord {
  id: string;
  title: string;
  content: string;
  entities: EntityRecord[];
}

export interface EventDetailRecord {
  id: string;
  title: string;
  content: string;
  entities: EntityRecord[];
  document?: DocumentRecord;
  chunk?: ChunkRecord;
}

// Project stats
export interface ProjectStatsRecord {
  document_count: number;
  chunk_count: number;
  event_count: number;
  entity_count: number;
}

// Graph
export interface ProjectGraphRecord {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: "entity" | "event";
  label: string;
  entityType?: string;
  color?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;
}

// Upload
export interface UploadJobRecord {
  job_id: string;
  status: string;
  progress: string;
  result?: UploadResult | null;
  error?: string | null;
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

// Markdown files
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

// Search
export type SearchMode = "fast" | "standard";
export type ChunkingMode = "heading_strict" | "token";

export interface SearchResult {
  events: EventRecord[];
  trace?: SearchTraceStep[];
}

export interface SearchTraceStep {
  step: string;
  status: "running" | "done" | "failed";
  duration_ms?: number;
  data?: any;
}

export interface SearchStreamEvent {
  type: "step_start" | "step_end" | "result" | "error" | "done";
  step?: string;
  data?: any;
}

// MCP
export interface McpSessionRecord {
  id: string;
  title: string;
  source_ids?: string[];
  created_at: string;
}

export interface McpSessionDetail {
  session: McpSessionRecord;
  messages: McpMessage[];
  tool_calls: McpToolCall[];
}

export interface McpMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  created_at: string;
}

export interface McpToolCall {
  id: string;
  tool_name: string;
  arguments: any;
  result?: string;
  status: string;
}

export interface McpStreamEvent {
  type: "stage" | "message" | "assistant_delta" | "tool_start" | "search_progress" | "tool_end" | "done" | "error";
  data?: any;
}

// Settings
export interface PublicAiProviderSettings {
  embedding_base_url: string;
  embedding_model: string;
  embedding_dimensions: number;
  embedding_api_key_configured: boolean;
  llm_base_url: string;
  llm_model: string;
  llm_api_key_configured: boolean;
  llm_timeout_ms: number;
  llm_max_retries: number;
  default_search_mode: SearchMode;
  default_search_top_k: number;
  default_chunking_mode: ChunkingMode;
  chunk_token_limit: number;
  chunk_overlap_tokens: number;
}

export interface PublicMcpSettings {
  tools: McpToolInfo[];
  sag_mcp_source_id?: string;
}

export interface McpToolInfo {
  name: string;
  description: string;
  schema: any;
  example?: any;
}

// Format info
export interface FormatsInfo {
  formats: string[];
  max_upload_size_mb: number | null;
}
