/** Citation detail drawer — shows original chunk content. */

import { Drawer, Typography, Tag } from "antd";

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  citation: { number: number; chunk: any } | null;
  onClose: () => void;
  t: (zh: string, en: string) => string;
}

export default function CitationDrawer({ open, citation, onClose, t }: Props) {
  if (!citation) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`[${citation.number}] ${t("引用来源", "Citation Source")}`}
      width={480}
    >
      <Tag color="blue">{t("分块 / Chunk", "Chunk")}</Tag>
      {citation.chunk?.title && <Text strong>{citation.chunk.title}</Text>}
      <Paragraph style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.8 }}>
        {citation.chunk?.content ?? JSON.stringify(citation.chunk)}
      </Paragraph>
    </Drawer>
  );
}
