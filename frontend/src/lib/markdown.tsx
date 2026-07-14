/** Shared Markdown renderer for WRAG — renders inline markdown with citation links.
 *
 *  Used by Chat.tsx for rendering messages. Handles:
 *  - Code blocks (``` ... ```) and inline code (`...`)
 *  - Bold (**...**)
 *  - Headings (#, ##, ###)
 *  - Unordered lists (- / *) and ordered lists (1. ...)
 *  - Tables (| ... |)
 *  - Citation links: [1], [2], ..., [99]
 */

import React, { type ReactNode } from "react";
import { Tag, Typography } from "antd";
import type { AnswerCitation } from "../types";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Renders full markdown content as React nodes, including code blocks. */
export function MarkdownMessage({
  content,
  citations = [],
  onOpenCitation,
}: {
  content: string;
  citations?: AnswerCitation[];
  onOpenCitation?: (citation: AnswerCitation) => void;
}) {
  const blocks = splitCodeBlocks(content);
  return (
    <div style={{ wordBreak: "break-word" }}>
      {blocks.map((block, i) =>
        block.type === "code" ? (
          <pre
            key={i}
            style={{
              overflow: "auto",
              background: "rgba(0,0,0,0.04)",
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.6,
              margin: "8px 0",
            }}
          >
            <code>{block.content}</code>
          </pre>
        ) : (
          <div key={i}>{renderMarkdownLines(block.content, citations, onOpenCitation)}</div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code block splitting
// ---------------------------------------------------------------------------

type TextBlock = { type: "text"; content: string };
type CodeBlock = { type: "code"; content: string };

function splitCodeBlocks(content: string): (TextBlock | CodeBlock)[] {
  const blocks: (TextBlock | CodeBlock)[] = [];
  const regex = /```[^\n]*\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    if (m.index > last) {
      blocks.push({ type: "text", content: content.slice(last, m.index) });
    }
    blocks.push({ type: "code", content: m[1].trimEnd() });
    last = regex.lastIndex;
  }
  if (last < content.length) {
    blocks.push({ type: "text", content: content.slice(last) });
  }
  return blocks.length > 0 ? blocks : [{ type: "text", content }];
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

function renderMarkdownLines(
  text: string,
  citations: AnswerCitation[],
  onOpenCitation?: (citation: AnswerCitation) => void
): ReactNode[] {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line → spacer
    if (!trimmed) {
      nodes.push(<div key={i} style={{ height: 8 }} />);
      continue;
    }

    // Table
    if (isTableStart(lines, i)) {
      const header = splitTableCells(lines[i]);
      const aligns = parseTableAligns(lines[i + 1] ?? "");
      const rows: string[][] = [];
      let ri = i + 2;
      while (ri < lines.length && isTableRow(lines[ri])) {
        rows.push(splitTableCells(lines[ri]));
        ri++;
      }
      nodes.push(
        <MarkdownTable
          key={i}
          header={header}
          rows={rows}
          aligns={aligns}
          citations={citations}
          onOpenCitation={onOpenCitation}
        />
      );
      i = ri - 1;
      continue;
    }

    // Heading
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const fontSize = level === 1 ? 16 : level === 2 ? 14 : 13;
      nodes.push(
        <div key={i} style={{ fontWeight: 600, fontSize, marginTop: level === 1 ? 8 : 4 }}>
          {renderInline(heading[2], citations, onOpenCitation)}
        </div>
      );
      continue;
    }

    // Unordered list
    const ul = trimmed.match(/^[-*]\s+(.+)$/);
    if (ul) {
      nodes.push(
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <Text type="secondary">•</Text>
          <span>{renderInline(ul[1], citations, onOpenCitation)}</span>
        </div>
      );
      continue;
    }

    // Ordered list
    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      const num = trimmed.split(".")[0];
      nodes.push(
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <Text type="secondary">{num}.</Text>
          <span>{renderInline(ol[1], citations, onOpenCitation)}</span>
        </div>
      );
      continue;
    }

    // Paragraph
    nodes.push(
      <p key={i} style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, margin: 0 }}>
        {renderInline(line, citations, onOpenCitation)}
      </p>
    );
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Inline tokens: `code`, **bold**, [N] citations
// ---------------------------------------------------------------------------

function renderInline(
  text: string,
  citations: AnswerCitation[],
  onOpenCitation?: (citation: AnswerCitation) => void
): ReactNode[] {
  const citMap = new Map(citations.map((c) => [c.index, c]));
  const nodes: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\[(\d{1,2})\])/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));

    const token = m[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${m.index}-code`}
          style={{
            background: "rgba(0,0,0,0.06)",
            padding: "1px 4px",
            borderRadius: 3,
            fontSize: 12,
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`${m.index}-bold`}>{token.slice(2, -2)}</strong>);
    } else {
      const idx = Number(m[2]);
      const cit = citMap.get(idx);
      if (cit && onOpenCitation) {
        nodes.push(
          <Tag
            key={`${m.index}-cit`}
            color="orange"
            style={{ cursor: "pointer", margin: "0 2px", fontSize: 11, lineHeight: "18px", padding: "0 6px" }}
            onClick={() => onOpenCitation(cit)}
            title={cit.heading || cit.chunkId}
          >
            [{idx}]
          </Tag>
        );
      } else {
        nodes.push(token);
      }
    }

    last = regex.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

function MarkdownTable({
  header,
  rows,
  aligns,
  citations,
  onOpenCitation,
}: {
  header: string[];
  rows: string[][];
  aligns: Array<"left" | "center" | "right">;
  citations?: AnswerCitation[];
  onOpenCitation?: (citation: AnswerCitation) => void;
}) {
  return (
    <div style={{ maxWidth: "100%", overflowX: "auto", margin: "8px 0", borderRadius: 6, border: "1px solid #f0f0f0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, lineHeight: 1.6 }}>
        <thead>
          <tr style={{ background: "rgba(0,0,0,0.02)" }}>
            {header.map((cell, ci) => (
              <th
                key={ci}
                style={{
                  textAlign: aligns[ci] ?? "left",
                  padding: "6px 8px",
                  fontWeight: 600,
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                {renderInline(cell, citations ?? [], onOpenCitation)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}>
              {header.map((_, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: aligns[ci] ?? "left",
                    padding: "4px 8px",
                    verticalAlign: "top",
                    wordBreak: "break-word",
                  }}
                >
                  {renderInline(row[ci] ?? "", citations ?? [], onOpenCitation)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isTableStart(lines: string[], i: number): boolean {
  return isTableRow(lines[i]) && isTableDivider(lines[i + 1] ?? "");
}

function isTableRow(line: string): boolean {
  return splitTableCells(line).length >= 2;
}

function isTableDivider(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length >= 2 && cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s+/g, "")));
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function parseTableAligns(line: string): Array<"left" | "center" | "right"> {
  return splitTableCells(line).map((c) => {
    const n = c.replace(/\s+/g, "");
    if (n.startsWith(":") && n.endsWith(":")) return "center";
    if (n.endsWith(":")) return "right";
    return "left";
  });
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function getMessageCitations(message: {
  metadata?: Record<string, unknown>;
}): AnswerCitation[] {
  const value = (message as any).metadata?.citations;
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeCitation)
    .filter((c): c is AnswerCitation => c !== null)
    .slice(0, 5);
}

function normalizeCitation(value: unknown): AnswerCitation | null {
  if (!isRecord(value)) return null;
  const index = typeof value.index === "number" ? value.index : Number(value.index);
  const chunkId = typeof value.chunkId === "string" ? value.chunkId : "";
  const sourceId = typeof value.sourceId === "string" ? value.sourceId : "";
  const content = typeof value.content === "string" ? value.content : "";
  if (!Number.isInteger(index) || index <= 0 || !chunkId || !sourceId || !content) return null;
  return {
    index,
    chunkId,
    sourceId,
    documentId: typeof value.documentId === "string" ? value.documentId : undefined,
    heading: typeof value.heading === "string" ? value.heading : undefined,
    content,
    rank: typeof value.rank === "number" ? value.rank : undefined,
    score: typeof value.score === "number" ? value.score : undefined,
    query: typeof value.query === "string" ? value.query : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Misc display helpers
// ---------------------------------------------------------------------------

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function makeStepId(prefix: string): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${rand}`;
}
