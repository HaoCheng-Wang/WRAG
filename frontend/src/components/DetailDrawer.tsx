/** Event/entity detail drawer — used by Documents page.
 *
 *  For event detail:
 *  - Title, content, linked entities with tags
 *  - Chunk content if available
 *
 *  For entity detail:
 *  - Name, type, description
 *  - Linked events list
 */

import { Drawer, Tag, Typography, Descriptions, List, Card } from "antd";
import type { EventDetailRecord, EntityDetailRecord } from "../types";

const { Paragraph, Text } = Typography;

interface Props {
  open: boolean;
  type: "event" | "entity" | null;
  data: EventDetailRecord | EntityDetailRecord | null;
  onClose: () => void;
  t: (zh: string, en: string) => string;
}

export default function DetailDrawer({ open, type, data, onClose, t }: Props) {
  if (!data || !type) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={500}
      title={
        type === "event"
          ? (data as EventDetailRecord).event.title
          : (data as EntityDetailRecord).entity.name
      }
    >
      {type === "event" && (
        <EventDetailContent detail={data as EventDetailRecord} t={t} />
      )}
      {type === "entity" && (
        <EntityDetailContent detail={data as EntityDetailRecord} t={t} />
      )}
    </Drawer>
  );
}

function EventDetailContent({ detail, t }: { detail: EventDetailRecord; t: (zh: string, en: string) => string }) {
  const { event, entities, document, chunk } = detail;
  return (
    <div>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="ID">
          <Text copyable style={{ fontSize: 11 }}>{event.id}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={t("标题", "Title")}>{event.title}</Descriptions.Item>
        {document && (
          <Descriptions.Item label={t("文档", "Document")}>{document.title || document.fileName}</Descriptions.Item>
        )}
        {event.score != null && (
          <Descriptions.Item label={t("得分", "Score")}>{event.score.toFixed(4)}</Descriptions.Item>
        )}
      </Descriptions>

      <Paragraph style={{ marginTop: 12, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
        {event.content || event.summary}
      </Paragraph>

      {entities.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text strong style={{ fontSize: 13 }}>{t("关联实体", "Linked Entities")}</Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {entities.map((e) => (
              <Tag key={e.id}>{e.type} · {e.name}</Tag>
            ))}
          </div>
        </div>
      )}

      {chunk && (
        <div style={{ marginTop: 12 }}>
          <Text strong style={{ fontSize: 13 }}>{t("关联切片", "Linked Chunk")}</Text>
          <Card size="small" style={{ marginTop: 4 }}>
            {chunk.heading && (
              <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{chunk.heading}</div>
            )}
            <Paragraph style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>
              {chunk.content}
            </Paragraph>
          </Card>
        </div>
      )}
    </div>
  );
}

function EntityDetailContent({ detail, t }: { detail: EntityDetailRecord; t: (zh: string, en: string) => string }) {
  const { entity, events } = detail;
  return (
    <div>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="ID">
          <Text copyable style={{ fontSize: 11 }}>{entity.id}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={t("名称", "Name")}>{entity.name}</Descriptions.Item>
        <Descriptions.Item label={t("规范化名称", "Normalized")}>{entity.normalizedName || entity.name}</Descriptions.Item>
        <Descriptions.Item label={t("类型", "Type")}>
          <Tag>{entity.type}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t("关联事件数", "Event count")}>{entity.eventCount}</Descriptions.Item>
        {entity.description && (
          <Descriptions.Item label={t("描述", "Description")}>{entity.description}</Descriptions.Item>
        )}
      </Descriptions>

      {events.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Text strong style={{ fontSize: 13 }}>
            {t(`关联事件（${events.length}）`, `Linked Events (${events.length})`)}
          </Text>
          <List
            size="small"
            dataSource={events}
            style={{ marginTop: 4 }}
            renderItem={(ev) => (
              <List.Item>
                <List.Item.Meta
                  title={<Text style={{ fontSize: 13 }}>{ev.title}</Text>}
                  description={
                    <Paragraph ellipsis={{ rows: 2 }} style={{ fontSize: 12, margin: 0 }}>
                      {ev.summary || ev.content}
                    </Paragraph>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}
    </div>
  );
}
