# WRAG — 多格式 RAG 知识库

**WRAG** (Wrapper for RAG) 将 [MarkItDown](https://github.com/microsoft/markitdown) 和 [SAG](https://github.com/Zleap-AI/SAG) 整合为一套统一的知识库系统。

**核心流程：** 上传**任意格式**文件 → MarkItDown 转换为 Markdown → SAG 入库并启用 RAG 检索。

---

## 功能特性

- **多格式上传**：支持 PDF、DOCX、PPTX、XLSX、CSV、HTML、EPUB、图片、音频、ZIP、Jupyter Notebook 等 MarkItDown 支持的全部格式
- **Markdown 持久化**：转换后的 `.md` 文件可预览、在线编辑、下载、导入到不同项目
- **知识图谱**：基于 ReactFlow 的交互式力导向图，可视化实体与事件的关联
- **对话式 RAG**：MCP 驱动的聊天界面，支持 SSE 流式响应和引用标记
- **MCP 集成**：内置 MCP 服务器，可供 Claude Desktop、Cursor 等外部 AI 客户端调用
- **现代化 UI**：基于 Ant Design 5，支持中英文双语切换
- **独立管理**：Markdown 文件与知识库内容独立管理，互不影响

---

## 架构

```
WRAG 前端 (React + Ant Design 5, 端口 5174)
       │
       ▼
WRAG 后端 (FastAPI + Python, 端口 8000)
  ├── POST /api/wrag/upload       → 文件上传 + 格式转换
  ├── /api/wrag/markdown/*        → Markdown 文件管理
  └── /api/*                      → 反向代理至 SAG
       │
       ▼
SAG 后端 (Fastify, 端口 4173) — 保持不变
       │
       ▼
PostgreSQL + pgvector (Docker, 端口 5432)
```

---

## 快速开始

### 前置条件

- **Node.js** >= 20
- **Python** >= 3.10
- **Docker**

### 下载与部署

```bash
# 1. 克隆 WRAG
git clone https://github.com/HaoCheng-Wang/WRAG.git
cd WRAG

# 2. 在 WRAG 目录内克隆两个依赖项目
git clone https://github.com/microsoft/markitdown.git
git clone https://github.com/Zleap-AI/SAG.git

# 3. 一键启动
./start.sh
```

最终的目录结构：

```
WRAG/
├── start.sh              # 一键启动脚本
├── docker-compose.yml    # PostgreSQL 容器配置
├── .env                  # WRAG 配置（start.sh 自动创建）
├── .env.example          # WRAG 配置模板
├── requirements.txt      # Python 依赖
├── README.md
├── backend/              # FastAPI 后端
├── frontend/             # React 前端 (Ant Design 5)
├── markitdown/           # git clone from microsoft/markitdown
├── SAG/                  # git clone from Zleap-AI/SAG
│   └── .env              # SAG / AI 配置（start.sh 自动创建）
├── .venv/                # start.sh 自动创建
└── md_storage/           # 运行时自动创建 — 持久化 .md 文件
```

然后打开：**http://localhost:5174**

`start.sh` 会自动完成以下步骤：
1. 检查 `markitdown/` 和 `SAG/` 目录是否存在
2. 智能同步 `.env` 文件 — 不存在则从 `.env.example` 复制，已存在则追加新增变量（不覆盖已有配置）
3. 创建 Python 虚拟环境（`.venv`）并安装依赖
4. 安装 SAG 的 npm 依赖
5. 安装 WRAG 前端的 npm 依赖
6. 通过 Docker 启动 PostgreSQL
7. 初始化 SAG 数据库（迁移 + 种子数据）
8. 创建 `md_storage/` 目录
9. 启动 WRAG 后端（自动拉起 SAG API）
10. 启动 WRAG 前端开发服务器
11. 如果 AI API key 未配置，提示用户编辑配置

> **💡 未配置 API key 时，SAG 以本地回退模式运行。** 你可以先浏览 UI 功能，之后再配置 AI 密钥。

### 配置 AI 功能

首次运行后，编辑以下配置文件以启用完整的 AI 检索功能：

| 文件 | 用途 | 需设置的关键变量 |
|------|------|-----------------|
| `SAG/.env` | AI 模型与 API 密钥 | `EMBEDDING_API_KEY`、`LLM_API_KEY` |
| `.env` | WRAG 服务器设置 | `WRAG_PORT`、`WRAG_MAX_UPLOAD_SIZE_MB` |

修改后重启：

```bash
./start.sh
```

> **注意：** `start.sh` 执行智能同步 — 如果升级后 `.env.example` 新增了变量，会自动追加到你的 `.env` 中并标记 `[NEW]`，已有配置不会被覆盖。

### 手动部署（不使用 start.sh）

本部分展示 `start.sh` 内部执行的操作，适用于调试或手动部署场景。

```bash
# 前置：先在 WRAG/ 内克隆 markitdown 和 SAG

# 1. 创建环境配置文件
cp .env.example .env
cp SAG/.env.example SAG/.env
# 编辑上述两个文件，配置 API key 和其他设置

# 2. Python 虚拟环境
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e ./markitdown/packages/markitdown[all]

# 3. SAG 依赖
cd SAG && npm install && cd ..

# 4. WRAG 前端依赖
cd frontend && npm install && cd ..

# 5. PostgreSQL
docker compose up -d postgres

# 6. 数据库初始化
cd SAG && npm run db:setup && cd ..

# 7. 启动（两个终端）
python backend/main.py          # 终端 1: WRAG 后端
cd frontend && npm run dev      # 终端 2: WRAG 前端
```

---

## 配置说明

### WRAG 设置（`.env`）

| 变量 | 默认值 | 说明 |
|----------|---------|------|
| `WRAG_HOST` | `0.0.0.0` | 后端绑定地址 |
| `WRAG_PORT` | `8000` | 后端端口 |
| `SAG_API_URL` | `http://127.0.0.1:4173` | SAG API 内部地址 |
| `MD_STORAGE_DIR` | `md_storage` | Markdown 文件存储目录 |
| `WRAG_MAX_UPLOAD_SIZE_MB` | *(空)* | 上传文件大小上限（MB）。留空 = 不限制 |
| `DATABASE_URL` | `postgres://sag_lite:sag_lite_pass@localhost:5432/sag_lite` | PostgreSQL 连接串 |

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

---

## 设计决策

1. **默认不限制文件大小**：MarkItDown 本身无限制，WRAG 仅在设置 `WRAG_MAX_UPLOAD_SIZE_MB` 后才启用应用层限制。
2. **Markdown 文件与知识库独立管理**：删除 `.md` 不影响知识库，删除知识库文档也不影响 `.md`，实现跨项目复用。
3. **Markdown 编辑仅改缓存**：在线编辑只修改本地文件，需手动删除旧文档并重新导入才能在知识库中生效。
4. **SAG 作为子进程**：WRAG 后端启动时自动拉起 SAG，无需手动编排。
5. **Ant Design**：与 SAG 的 Tailwind 风格明显区隔，提供完整的中文友好组件库。
6. **反向代理 SAG 全部 API**：前端仅与 WRAG 后端（端口 8000）通信，统一 API 入口。

---

## 许可证

MIT — 同 MarkItDown 和 SAG。

## 致谢

- [MarkItDown](https://github.com/microsoft/markitdown) — Microsoft
- [SAG](https://github.com/Zleap-AI/SAG) — Zleap-AI
