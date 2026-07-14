# WRAG — 多格式 RAG 知识库

**WRAG** (Wrapper for RAG) 将 [MarkItDown](https://github.com/microsoft/markitdown) 和 [SAG](https://github.com/Zleap-AI/SAG) 整合为一套统一的知识库系统。

**核心流程：** 上传**任意格式**文件 → MarkItDown 转换为 Markdown → SAG 入库并启用 RAG 检索。

---

## 功能特性

- **多格式上传**：支持 PDF、DOCX、PPTX、XLSX、CSV、HTML、EPUB、图片、音频、ZIP、Jupyter Notebook 等 MarkItDown 支持的全部格式
- **Markdown 持久化**：转换后的 `.md` 文件可预览、在线编辑、下载、导入到不同项目
- **知识图谱**：基于 ReactFlow 的交互式力导向图，实体与事件节点可双击查看详情
- **对话式 RAG**：MCP 驱动的聊天界面，支持 Markdown 渲染（表格/代码块/引用链接）、SSE 流式响应和引用标记
- **MCP 智能体接入**：内置 MCP HTTP 桥接器 — 自动发现项目、动态切换绑定，可连接 Claude Desktop、Cursor 等任何兼容 MCP 协议的 AI 客户端
- **现代化 UI**：基于 Ant Design 5，中/英/自动三档语言切换
- **独立管理**：Markdown 文件与知识库内容独立管理，互不影响
- **Docker 部署**：生产环境单容器一键部署，含 MCP HTTP 桥接器

---

## 架构

```
                  ┌──────────────────────────────┐
                  │   AI 智能体 (Claude Desktop,  │
                  │   Cursor, 自定义客户端)        │
                  └──────────┬───────────────────┘
                             │ MCP 协议 (HTTP/SSE)
                             ▼ 端口 4174
┌────────────────────────────────────────────────────────┐
│                    WRAG 容器                             │
│                                                          │
│  WRAG 前端 (React + Ant Design 5)                        │
│        │  由 FastAPI 作为静态文件 serve                   │
│        ▼                                                │
│  WRAG 后端 (FastAPI + Python, 端口 8555)                  │
│    ├── POST /api/wrag/upload       → 上传 + 格式转换      │
│    ├── /api/wrag/markdown/*        → Markdown 文件管理    │
│    ├── /api/wrag/mcp/bind          → 动态 MCP 项目绑定    │
│    ├── /api/*                      → 反向代理到 SAG       │
│    └── 前端静态文件 at /                                 │
│        │                                                 │
│        ▼                                                 │
│  SAG 后端 (Fastify, 端口 4173) — 保持不变                 │
│        │                                                 │
│        ▼                                                 │
│  MCP HTTP 桥接器 (端口 4174)                             │
│    由 WRAG 后端自动发现项目并管理                          │
│    工具: sag_search, sag_ingest_document,                │
│          sag_explain_search, sag_get_event               │
└──────────────────────┬─────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │ PostgreSQL 16    │
              │ + pgvector       │
              │ (Docker, :5432)  │
              └─────────────────┘
```

---

## 快速开始

### 前置条件

- **Node.js** >= 20
- **Python** >= 3.10
- **Docker**

### 开发模式（快速启动、看效果）

```bash
# 1. 克隆 WRAG
git clone https://github.com/HaoCheng-Wang/WRAG.git
cd WRAG

# 2. 在 WRAG 目录内克隆两个依赖项目
git clone https://github.com/microsoft/markitdown.git
git clone https://github.com/Zleap-AI/SAG.git

# 3. 一键启动（自动创建 .env、安装依赖、启动所有服务）
./start.sh
```

然后打开 **http://localhost:5174**

`start.sh` 自动完成：
1. 智能同步 `.env` 文件 — 不存在则创建，已存在则追加新增变量
2. 创建 Python 虚拟环境 + 安装依赖 + MarkItDown
3. 安装 SAG 和前端 npm 依赖
4. Docker 启动 PostgreSQL
5. 初始化 SAG 数据库（迁移 + 种子数据）
6. 启动 WRAG 后端（自动拉起 SAG API + MCP HTTP 桥子进程）
7. 启动 WRAG 前端 Vite 开发服务器（端口 5174）
8. 提示 AI API key 配置状态

### Docker 生产模式

```bash
./docker-start.sh
```

构建单个 Docker 容器，对外暴露：
- **端口 8555** — 前端 UI + REST API（均由 FastAPI 提供）
- **端口 4174** — MCP HTTP 端点（自动绑定到第一个 SAG 项目）

---

## MCP 智能体接入

WRAG 内置 MCP HTTP 桥接器，通过标准 [Model Context Protocol](https://modelcontextprotocol.io/) 将 SAG 知识库工具暴露给 AI 客户端。

### 可用工具

| 工具 | 说明 |
|------|------|
| `sag_search` | 语义 + 关键词混合检索知识库 |
| `sag_ingest_document` | 将文档入库到知识库 |
| `sag_explain_search` | 获取搜索 trace 和详细解释 |
| `sag_get_event` | 按 UUID 获取单个事件详情 |

### 项目绑定

MCP 桥接器**启动时自动发现**第一个 SAG 项目并绑定。要切换绑定的项目：

1. 在 WRAG 前端打开 **MCP 标签页**
2. 用下拉菜单选择不同项目
3. 点击 **"切换绑定"** — 桥接器即时重启

也可以在 `.env` 或 `docker-compose.yml` 中设置 `WRAG_MCP_SOURCE_ID` 固定绑定。

### 连接 Claude Desktop

在 `claude_desktop_config.json`（或 `mcp.json`）中添加：

```json
{
  "mcpServers": {
    "wrag": {
      "type": "http",
      "url": "http://localhost:4174/mcp"
    }
  }
}
```

> 远程访问时请将 `localhost` 替换为服务器地址。

---

## 配置说明

### WRAG 设置（`.env`）

| 变量 | 默认值 | 说明 |
|----------|---------|------|
| `WRAG_HOST` | `0.0.0.0` | 后端绑定地址 |
| `WRAG_PORT` | `8555` | 后端端口 |
| `SAG_API_URL` | `http://127.0.0.1:4173` | SAG API 内部地址 |
| `MD_STORAGE_DIR` | `md_storage` | Markdown 文件存储目录 |
| `WRAG_MAX_UPLOAD_SIZE_MB` | *(空)* | 上传文件大小上限（MB）。留空 = 不限制 |
| `WRAG_MCP_SOURCE_ID` | *(自动)* | 固定 MCP 桥绑定的项目 UUID。留空则自动发现第一个项目 |

> **注意：** `DATABASE_URL` 只在 `SAG/.env` 中配置。WRAG 使用 SQLite 管理自身元数据，不需要 PostgreSQL 连接信息。

### SAG / AI 设置（`SAG/.env`）

| 变量 | 默认值 | 说明 |
|----------|---------|------|
| `NODE_ENV` | `development` | 运行环境 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `HTTP_HOST` | `0.0.0.0` | SAG API 绑定地址 |
| `HTTP_PORT` | `4173` | SAG API 端口 |
| `DATABASE_URL` | `postgres://sag_lite:sag_lite_pass@localhost:5432/sag_lite` | PostgreSQL 连接串 |
| `DEFAULT_TENANT_ID` | `default` | 多租户 ID |
| `AUTH_MODE` | `none` | 认证模式（none/bearer/external） |
| `EMBEDDING_DIMENSIONS` | `1024` | 向量维度 |
| `EMBEDDING_MODEL` | `text-embedding-3-large` | Embedding 模型名称 |
| `EMBEDDING_API_KEY` | *(空)* | Embedding 服务 API 密钥 |
| `EMBEDDING_BASE_URL` | `https://api.302ai.cn/v1` | Embedding API 地址 |
| `LLM_MODEL` | `qwen3.6-flash` | LLM 模型名称 |
| `LLM_API_KEY` | *(空)* | LLM 服务 API 密钥 |
| `LLM_BASE_URL` | `https://api.302ai.cn/v1` | LLM API 地址 |
| `LLM_TIMEOUT_MS` | `60000` | LLM 请求超时（毫秒） |
| `LLM_MAX_RETRIES` | `2` | LLM 最大重试次数 |
| `RERANK_MODEL` | `qwen3-rerank` | Rerank 模型名称 |
| `RERANK_BASE_URL` | *(空，回退至 `LLM_BASE_URL`)* | Rerank API 地址 |
| `RERANK_INSTRUCT` | *(指令文本)* | Rerank 提示指令 |
| `DEFAULT_SEARCH_MODE` | `fast` | 默认搜索模式（fast/standard） |
| `INGEST_CONCURRENCY` | `5` | 文档入库并发数 |
| `MCP_TRANSPORT` | `stdio` | MCP 传输协议 |
| `MCP_HTTP_PORT` | `4174` | MCP HTTP 端口 |
| `MCP_TOOL_TIMEOUT_MS` | `300000` | MCP 工具超时（毫秒） |

> 未配置 API key 时，SAG 使用确定性本地回退方案：SHA-256 向量嵌入、正则实体提取、词法关键词重排序。系统可以在无远程 API 的情况下正常启动和运行。

---

## API 参考

### WRAG 自有端点

| 方法 | 路径 | 说明 |
|--------|------|------|
| `GET` | `/health` | 健康检查（WRAG + SAG 连接状态） |
| `GET` | `/api/formats` | 列出支持的文件格式 |
| `POST` | `/api/wrag/upload` | 上传文件 → 转换 → 入库 |
| `POST` | `/api/wrag/upload/stream` | 上传 + SSE 流式进度推送 |
| `GET` | `/api/wrag/mcp/binding` | 查询当前 MCP 桥绑定的项目 |
| `POST` | `/api/wrag/mcp/bind` | 切换 MCP 桥绑定到其他项目 |

### Markdown 文件管理

| 方法 | 路径 | 说明 |
|--------|------|------|
| `GET` | `/api/wrag/markdown` | 列出所有已保存的 Markdown 文件 |
| `GET` | `/api/wrag/markdown/{id}` | 获取文件元数据 + 导入历史 |
| `GET` | `/api/wrag/markdown/{id}/content` | 获取 Markdown 原始内容 |
| `GET` | `/api/wrag/markdown/{id}/download` | 下载 `.md` 文件 |
| `PATCH` | `/api/wrag/markdown/{id}/content` | 在线编辑 Markdown 内容（仅修改缓存） |
| `DELETE` | `/api/wrag/markdown/{id}` | 删除 Markdown 文件（不影响知识库） |
| `POST` | `/api/wrag/markdown/{id}/import` | 将保存的 Markdown 导入到指定项目 |

### SAG 代理

所有 `/api/*` 端点均透明代理至 SAG。完整 API 参考见 [SAG 文档](https://github.com/Zleap-AI/SAG)。

### MCP 端点

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `POST` | `/mcp`（端口 4174） | MCP JSON-RPC 端点（Streamable HTTP） |

---

## 设计决策

1. **默认不限制文件大小**：MarkItDown 本身无限制，WRAG 仅在设置 `WRAG_MAX_UPLOAD_SIZE_MB` 后才启用应用层限制。
2. **Markdown 文件与知识库独立管理**：删除 `.md` 不影响知识库，删除知识库文档也不影响 `.md`，实现跨项目复用。
3. **Markdown 编辑仅改缓存**：在线编辑只修改本地文件，需手动删除旧文档并重新导入才能在知识库中生效。
4. **SAG 作为子进程**：WRAG 后端启动时自动拉起 SAG，无需手动编排。
5. **Ant Design**：与 SAG 的 Tailwind 风格明显区隔，提供完整的中文友好组件库。
6. **代理全部 SAG API**：前端仅与 WRAG 后端（端口 8555）通信，SAG 自带前端不启动 — 完全由 WRAG 前端替代。
7. **MCP HTTP 桥接器**：薄的 Node.js 包装层，导入 SAG 的 `buildMcpServer()` 并用 `StreamableHTTPServerTransport` 暴露为 HTTP 端点 — 不修改 SAG 一行源码。
8. **自动发现 + 动态绑定**：MCP 桥自动绑定到第一个项目。用户可在前端 MCP 页面随时动态切换，无需改配置文件或重启容器。
9. **生产环境单容器**：WRAG Docker 镜像整合前端（构建后的静态文件）、后端、SAG API 和 MCP 桥接器 — 对外暴露 8555（UI+API）和 4174（MCP）。
10. **SQLite 管理 WRAG 元数据**：PostgreSQL 是 SAG 的职责。WRAG 用 SQLite 追踪 Markdown 文件，职责清晰分离。

---

## 许可证

MIT — 同 MarkItDown 和 SAG。

## 致谢

- [MarkItDown](https://github.com/microsoft/markitdown) — Microsoft
- [SAG](https://github.com/Zleap-AI/SAG) — Zleap-AI
