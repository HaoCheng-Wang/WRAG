/** Frontend API client — calls WRAG backend (port 8555). */

import type {
  SourceRecord,
  DocumentRecord,
  ChunkRecord,
  EntityRecord,
  EntityDetailRecord,
  EventRecord,
  EventDetailRecord,
  ProjectStatsRecord,
  ProjectGraphRecord,
  UploadJobRecord,
  UploadResult,
  MdFileInfo,
  SearchMode,
  SearchResult,
  SearchStreamEvent,
  McpSessionRecord,
  McpSessionDetail,
  McpStreamEvent,
  PublicAiProviderSettings,
  PublicMcpSettings,
  FormatsInfo,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(text: string): any {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const resp = await fetch(url, { ...init, headers });
  const text = await resp.text();
  const data = safeJson(text);
  if (!resp.ok) {
    throw new Error(data?.detail ?? data?.error?.message ?? `Request failed: ${resp.status}`);
  }
  return data as T;
}

async function readSse<T>(resp: Response, onEvent: (e: T) => void) {
  if (!resp.body) return;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(6)) as T);
    }
  }
}

// ---------------------------------------------------------------------------
// API object
// ---------------------------------------------------------------------------

export const api = {
  // -- Projects -----------------------------------------------------------
  async listProjects(includeArchived = false) {
    const q = includeArchived ? "?includeArchived=true" : "";
    return request<{ projects: SourceRecord[] }>(`/api/projects${q}`);
  },
  async createProject(input: { name: string; description?: string | null }) {
    return request<{ project: SourceRecord }>("/api/projects", { method: "POST", body: JSON.stringify(input) });
  },
  async updateProject(projectId: string, input: { name?: string; description?: string | null }) {
    return request<{ project: SourceRecord }>(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  async archiveProject(projectId: string) {
    return request<{ project: SourceRecord }>(`/api/projects/${projectId}/archive`, { method: "POST" });
  },
  async restoreProject(projectId: string) {
    return request<{ project: SourceRecord }>(`/api/projects/${projectId}/restore`, { method: "POST" });
  },
  async deleteProject(projectId: string) {
    return request<{ deleted: boolean }>(`/api/projects/${projectId}?permanent=true`, { method: "DELETE" });
  },

  // -- Documents ----------------------------------------------------------
  async listDocuments(projectId: string, includeArchived = false) {
    const q = includeArchived ? "?includeArchived=true" : "";
    return request<{ documents: DocumentRecord[] }>(`/api/projects/${projectId}/documents${q}`);
  },
  async getProjectStats(projectId: string) {
    return request<{ stats: ProjectStatsRecord }>(`/api/projects/${projectId}/stats`);
  },
  async getProjectGraph(projectId: string) {
    return request<{ graph: ProjectGraphRecord }>(`/api/projects/${projectId}/graph`);
  },
  async getDocument(documentId: string) {
    return request<{ document: DocumentRecord }>(`/api/documents/${documentId}`);
  },
  async listChunks(documentId: string) {
    return request<{ chunks: ChunkRecord[] }>(`/api/documents/${documentId}/chunks`);
  },
  async listEvents(documentId: string) {
    return request<{ events: EventRecord[] }>(`/api/documents/${documentId}/events`);
  },
  async listEntities(documentId: string) {
    return request<{ entities: EntityRecord[] }>(`/api/documents/${documentId}/entities`);
  },
  async updateDocument(documentId: string, input: { title?: string }) {
    return request<{ document: DocumentRecord }>(`/api/documents/${documentId}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  async archiveDocument(documentId: string) {
    return request<{ document: DocumentRecord }>(`/api/documents/${documentId}/archive`, { method: "POST" });
  },
  async restoreDocument(documentId: string) {
    return request<{ document: DocumentRecord }>(`/api/documents/${documentId}/restore`, { method: "POST" });
  },
  async deleteDocument(documentId: string) {
    return request<{ deleted: boolean }>(`/api/documents/${documentId}?permanent=true`, { method: "DELETE" });
  },

  // -- Events & Entities -------------------------------------------------
  async getEvent(eventId: string) {
    return request<EventDetailRecord>(`/api/events/${eventId}`);
  },
  async getEntity(entityId: string) {
    return request<EntityDetailRecord>(`/api/entities/${entityId}`);
  },

  // -- Search -------------------------------------------------------------
  async search(input: { query: string; sourceIds: string[]; searchMode?: SearchMode; topK?: number }) {
    return request<SearchResult>("/api/search", {
      method: "POST",
      body: JSON.stringify({ query: input.query, sourceIds: input.sourceIds, strategy: "multi", searchMode: input.searchMode ?? "fast", returnTrace: true, topK: input.topK }),
    });
  },
  async streamSearch(input: { query: string; sourceIds: string[]; searchMode?: SearchMode; topK?: number }, onEvent: (e: SearchStreamEvent) => void) {
    const resp = await fetch("/api/search/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: input.query, sourceIds: input.sourceIds, strategy: "multi", searchMode: input.searchMode ?? "fast", returnTrace: true, topK: input.topK }),
    });
    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      throw new Error(safeJson(text)?.detail ?? `Request failed: ${resp.status}`);
    }
    await readSse(resp, onEvent);
  },

  // -- MCP Sessions -------------------------------------------------------
  async listMcpSessions(projectId?: string) {
    if (projectId) return request<{ sessions: McpSessionRecord[] }>(`/api/projects/${projectId}/mcp/sessions`);
    return request<{ sessions: McpSessionRecord[] }>("/api/mcp/sessions");
  },
  async createMcpSession(input: { title?: string; sourceIds?: string[] }) {
    return request<{ session: McpSessionRecord }>("/api/mcp/sessions", { method: "POST", body: JSON.stringify(input) });
  },
  async getMcpSession(sessionId: string) {
    return request<McpSessionDetail>(`/api/mcp/sessions/${sessionId}`);
  },
  async clearMcpSession(sessionId: string) {
    return request<McpSessionDetail>(`/api/mcp/sessions/${sessionId}/clear`, { method: "POST" });
  },
  async deleteMcpSession(sessionId: string) {
    return request<{ deleted: boolean }>(`/api/mcp/sessions/${sessionId}`, { method: "DELETE" });
  },
  async streamMcpMessage(sessionId: string, content: string, onEvent: (e: McpStreamEvent) => void, signal?: AbortSignal) {
    const resp = await fetch(`/api/mcp/sessions/${sessionId}/messages/stream`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      throw new Error(safeJson(text)?.detail ?? `Request failed: ${resp.status}`);
    }
    await readSse(resp, onEvent);
  },

  // -- Settings -----------------------------------------------------------
  async getAiSettings() {
    return request<{ settings: PublicAiProviderSettings }>("/api/settings/ai");
  },
  async getMcpSettings() {
    return request<{ settings: PublicMcpSettings }>("/api/settings/mcp");
  },
  async updateAiSettings(input: any) {
    return request<{ settings: PublicAiProviderSettings }>("/api/settings/ai", { method: "PUT", body: JSON.stringify(input) });
  },

  // -- WRAG: Formats ------------------------------------------------------
  async getFormats() {
    return request<FormatsInfo>("/api/formats");
  },

  // -- WRAG: Upload -------------------------------------------------------
  async uploadFile(
    projectId: string,
    file: File,
    title: string | null,
    saveMarkdown: boolean,
    onProgress?: (stage: string, data: any) => void,
    signal?: AbortSignal
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", projectId);
    if (title) formData.append("title", title);
    formData.append("save_markdown", String(saveMarkdown));

    const resp = await fetch("/api/wrag/upload/stream", {
      method: "POST",
      body: formData,
      signal,
    });

    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      throw new Error(safeJson(text)?.detail ?? `Upload failed: ${resp.status}`);
    }

    return new Promise((resolve, reject) => {
      readSse<any>(resp, (event) => {
        onProgress?.(event.stage ?? event, event);
        if (event.stage === "done") resolve(event as any);
        if (event.stage === "error") reject(new Error(event.message ?? "Upload error"));
      });
    });
  },

  // -- WRAG: Markdown files -----------------------------------------------
  async listMdFiles() {
    return request<{ files: MdFileInfo[] }>("/api/wrag/markdown");
  },
  async getMdFile(fileId: string) {
    return request<MdFileInfo>(`/api/wrag/markdown/${fileId}`);
  },
  async getMdFileContent(fileId: string) {
    const resp = await fetch(`/api/wrag/markdown/${fileId}/content`);
    if (!resp.ok) throw new Error("Failed to fetch content");
    return resp.text();
  },
  downloadMdFile(fileId: string) {
    window.open(`/api/wrag/markdown/${fileId}/download`, "_blank");
  },
  async updateMdFileContent(fileId: string, content: string) {
    return request<{ id: string; md_size_bytes: number; updated_at: string }>(
      `/api/wrag/markdown/${fileId}/content`,
      { method: "PATCH", body: JSON.stringify({ content }) }
    );
  },
  async deleteMdFile(fileId: string) {
    return request<{ deleted: boolean }>(`/api/wrag/markdown/${fileId}`, { method: "DELETE" });
  },
  async importMdFile(fileId: string, projectId: string) {
    return request<{ document_id: string; project_id: string }>(
      `/api/wrag/markdown/${fileId}/import`,
      { method: "POST", body: JSON.stringify({ project_id: projectId }) }
    );
  },
};
