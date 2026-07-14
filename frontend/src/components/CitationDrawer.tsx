/** Citation detail drawer — shows original chunk content with metadata.
 *
 *  Matches SAG's CitationDetailPanel:
 *  - Chunk heading, rank, score
 *  - Search query (if available)
 *  - Chunk ID, document ID
 *  - Full original chunk content
 */

import { Drawer, Typography, Tag, Descriptions, Card } from "antd";
import type { AnswerCitation } from "../types";

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  citation: AnswerCitation | null;
  onClose: () => void;
  t: (zh: string, en: string) => string;
}

export default function CitationDrawer({ open, citation, onClose, t }: Props) {
  if (!citation) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(`引用 ${citation.index}`, `Citation ${citation.index}`)}
      width={480}
    >
      <div style={{ marginBottom: 12 }}>
        <Tag color="blue">{t("引用原文", "Source citation")}</Tag>
      </div>

      <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
        {citation.heading && (
          <Descriptions.Item label={t("切片标题", "Chunk title")}>{citation.heading}</Descriptions.Item>
        )}
        <Descriptions.Item label={t("排序", "Rank")}>
          {citation.rank != null ? String(citation.rank) : "-"}
        </Descriptions.Item>
        <Descriptions.Item label={t("得分", "Score")}>
          {citation.score != null ? citation.score.toFixed(4) : "-"}
        </Descriptions.Item>
        {citation.query && (
          <Descriptions.Item label={t("搜索语句", "Search query")}>{citation.query}</Descriptions.Item>
        )}
        <Descriptions.Item label={t("切片 ID", "Chunk ID")}>
          <Text copyable style={{ fontSize: 12 }}>{citation.chunkId}</Text>
        </Descriptions.Item>
        {citation.documentId && (
          <Descriptions.Item label={t("文档 ID", "Document ID")}>
            <Text copyable style={{ fontSize: 12 }}>{citation.documentId}</Text>
          </Descriptions.Item>
        )}
      </Descriptions>

      <div>
        <Text type="secondary" style={{ fontSize: 11 }}>{t("原文块", "Original chunk")}</Text>
        <Card size="small" style={{ marginTop: 4 }}>
          <Paragraph style={{
            fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.8,
            wordBreak: "break-word", margin: 0,
          }}>
            {citation.content}
          </Paragraph>
        </Card>
      </div>
    </Drawer>
  );
}
