/** Event/entity detail drawer. */

import { Drawer, Tag, Typography, Descriptions, List } from "antd";

const { Paragraph } = Typography;

interface Props {
  open: boolean;
  type: "event" | "entity" | null;
  data: any;
  onClose: () => void;
  t: (zh: string, en: string) => string;
}

export default function DetailDrawer({ open, type, data, onClose, t }: Props) {
  if (!data) return null;

  return (
    <Drawer open={open} onClose={onClose} width={500} title={type === "event" ? t("事件详情", "Event Detail") : t("实体详情", "Entity Detail")}>
      {type === "event" && (
        <>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="ID">{data.id}</Descriptions.Item>
            <Descriptions.Item label={t("标题", "Title")}>{data.title}</Descriptions.Item>
          </Descriptions>
          <Paragraph style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{data.content}</Paragraph>
          {data.entities?.length > 0 && (
            <>
              <h4>{t("关联实体", "Linked Entities")}</h4>
              <List
                size="small"
                dataSource={data.entities}
                renderItem={(e: any) => (
                  <List.Item>
                    <Tag>{e.type}</Tag> {e.name}
                  </List.Item>
                )}
              />
            </>
          )}
        </>
      )}
      {type === "entity" && (
        <>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="ID">{data.id}</Descriptions.Item>
            <Descriptions.Item label={t("名称", "Name")}>{data.name}</Descriptions.Item>
            <Descriptions.Item label={t("类型", "Type")}>
              <Tag>{data.type}</Tag>
            </Descriptions.Item>
          </Descriptions>
          {data.events?.length > 0 && (
            <>
              <h4>{t("关联事件", "Linked Events")}</h4>
              <List
                size="small"
                dataSource={data.events}
                renderItem={(ev: any) => <List.Item>{ev.title}</List.Item>}
              />
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
