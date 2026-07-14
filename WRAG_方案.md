# WRAG 项目实现方案（修订版）

## 背景

用户当前在 `/home/kali/RAG_1/` 下有两个项目：
- **markitdown**（微软开源）：将 19+ 种文件格式（PDF、DOCX、PPTX、XLSX、CSV、HTML、EPUB、图片、音频、ZIP、YouTube 链接等）转换为 Markdown 的工具
- **SAG**（Zleap-AI 开源）：一个 RAG 知识库构建与检索系统（TypeScript + React + PostgreSQL/pgvector），但只接受 `.md` 和 `.txt` 格式

目标是构建 **WRAG** —— 一个整合项目：用户上传任意格式文件 → markitdown 转换为 `.md` → SAG 进行知识库构建和 RAG 检索。WRAG 有自己的前端（功能和 SAG 一样，但 UI 风格不同）和一个 FastAPI 后端来编排整个流程。两个原始项目保持不变，以便后续直接 git 拉取官方更新。

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                       WRAG 前端                                    │
│  React 19 + Vite + Ant Design 5                                    │
│  端口: 5174 (开发模式) / 由 FastAPI 提供静态文件 (生产模式)          │
│  功能: 对话 | 文档 | 图谱 | MCP | Markdown文件 | 设置               │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTP (REST + SSE 流式)
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    WRAG 后端 (FastAPI)                              │
│  Python 3.10+ | 端口: 8000                                        │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ POST /api/wrag/upload   ← 文件上传接口                     │    │
│  │   1. 接收任意格式文件                                       │    │
│  │   2. 调用 markitdown → 转换为 Markdown                     │    │
│  │   3. 持久化保存 .md 文件到 md_storage/ 目录                 │    │
│  │   4. 调用 SAG API → /api/documents/upload                 │    │
│  │   5. 返回结果 (file_id, docId, 统计信息等)                 │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ /api/wrag/markdown/*  ← Markdown 文件管理接口              │    │
│  │   列表 / 查看 / 下载 / 删除 / 导入到知识库                   │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ /api/*  ← 反向代理所有 SAG API 端点                         │    │
│  │ /health、/search 等                                       │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 生命周期管理: 启动时拉起 SAG (npm run dev)                 │    │
│  │ 作为子进程，健康检查，优雅关闭                               │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ SQLite 元数据存储: md_files 表记录所有转换历史              │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTP 代理
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    SAG 后端 (Fastify)                               │
│  不变 | 端口: 4173                                                 │
│  所有原始 API 端点保持不变                                           │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                PostgreSQL + pgvector (Docker)                       │
│  不变 | 端口: 5432                                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
/home/kali/RAG_1/
├── markitdown/              # 不变 —— 原始仓库
├── SAG/                     # 不变 —— 原始仓库
├── .venv/                   # Python 虚拟环境
└── WRAG/
    ├── README.md            # 项目文档
    ├── .env.example         # 环境配置模板
    ├── docker-compose.yml   # PostgreSQL + WRAG 服务
    ├── start.sh             # 一键启动脚本 (Linux/Mac)
    ├── start.bat            # 一键启动脚本 (Windows)
    ├── requirements.txt     # Python 依赖
    │
    ├── md_storage/          # Markdown 文件持久化目录 (Docker volume)
    │   └── {uuid}.md        # 转换后的 markdown 文件
    │
    ├── backend/
    │   ├── main.py          # FastAPI 入口、生命周期管理、SAG 子进程管理
    │   ├── config.py        # 环境配置（pydantic-settings）
    │   ├── converter.py     # MarkItDown 转换封装
    │   ├── router.py        # 所有 API 路由（上传 + SAG 代理）
    │   ├── sag_client.py    # 调用 SAG API 的 HTTP 客户端
    │   ├── md_store.py      # Markdown 文件存储与元数据管理 (SQLite)
    │   └── models.py        # Pydantic 数据模型
    │
    └── frontend/
        ├── index.html
        ├── vite.config.ts
        ├── tsconfig.json
        ├── package.json
        └── src/
            ├── main.tsx           # ReactDOM 入口
            ├── App.tsx            # 主布局（基于 Ant Design）
            ├── types.ts           # 共享类型定义
            ├── i18n.tsx           # 中英文国际化
            ├── lib/
            │   └── api.ts         # API 客户端（调用 WRAG 后端）
            ├── pages/
            │   ├── Chat.tsx       # 对话式 RAG 检索
            │   ├── Documents.tsx  # 文档管理 + 上传
            │   ├── Graph.tsx      # 知识图谱可视化（ReactFlow）
            │   ├── Mcp.tsx        # MCP 配置页面
            │   └── MarkdownFiles.tsx  # ★新增：Markdown 文件管理
            └── components/
                ├── ProjectRail.tsx    # 左侧项目列表栏
                ├── SettingsPanel.tsx  # AI 供应商 & 搜索设置
                ├── ActivityPanel.tsx  # 搜索过程追踪 + 原始日志
                ├── UploadDialog.tsx   # 文件上传对话框（展示支持格式）
                ├── CitationDrawer.tsx # 引用详情抽屉
                ├── DetailDrawer.tsx   # 事件/实体详情抽屉
                ├── MdPreviewModal.tsx # ★新增：Markdown 内容预览
                ├── MdEditorModal.tsx  # ★新增：Markdown 在线编辑
                └── ImportToProjectModal.tsx # ★新增：导入到项目对话框
```

---

## 详细设计

### 一、WRAG 后端（FastAPI）

#### 1.1 `main.py` — 入口与生命周期

**启动流程：**
1. 检查 PostgreSQL 是否运行（Docker 容器）
2. 检查 SAG 是否已在端口 4173 运行
3. 在 SAG/ 目录执行 `npm run db:setup`（如果尚未迁移）
4. 初始化 SQLite 数据库（`md_storage/metadata.db`），创建 md_files 表
5. 确保 `md_storage/` 目录存在
6. 启动 SAG 作为子进程：在 SAG/ 目录运行 `npm run dev`
7. 轮询 SAG 的 `/health` 端点直到返回 200
8. 在端口 8000 启动 FastAPI

**关闭流程：**
1. 向 SAG 子进程发送 SIGTERM
2. 等待优雅退出

#### 1.2 `config.py` — 配置

```python
# 基于 pydantic-settings 的配置模型
class Settings:
    wrag_host: str = "0.0.0.0"
    wrag_port: int = 8000
    sag_api_url: str = "http://127.0.0.1:4173"      # SAG 后端地址
    sag_dir: Path = Path("../SAG")                   # 相对于 WRAG/
    markitdown_dir: Path = Path("../markitdown")

    # 文件上传限制（markitdown 本身无限制，此处为 WRAG 应用层限制）
    # 实际瓶颈是服务器内存，markitdown 会将文件读入内存处理
    # 默认 None = 不限制；设置具体数值后启用限制
    # 可通过环境变量 WRAG_MAX_UPLOAD_SIZE_MB 配置（不设置则不做大小校验）
    max_upload_size_mb: int | None = None

    # Markdown 文件存储目录（Docker 启动时映射为 volume）
    md_storage_dir: Path = Path("md_storage")

    # 支持的文件格式（所有 markitdown 能处理的格式）
    supported_formats: list[str] = [
        ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv",
        ".html", ".htm", ".epub", ".md", ".txt", ".json",
        ".xml", ".jpg", ".jpeg", ".png", ".gif", ".bmp",
        ".mp3", ".wav", ".ogg", ".zip", ".ipynb", ".msg",
        ".rtf"
    ]
```

#### 1.3 `converter.py` — MarkItDown 封装

```python
from markitdown import MarkItDown

md_converter = MarkItDown()

def convert_to_markdown(file_path: str | Path, original_filename: str) -> str:
    """将任意支持格式的文件转换为 Markdown 文本。返回 markdown 字符串。"""
    result = md_converter.convert(str(file_path))
    return result.markdown
```

- MarkItDown 通过 `pip install -e ../markitdown/packages/markitdown[all]` 安装在 `.venv` 中
- `convert()` 方法自动检测格式并选择正确的转换器
- markitdown **本身没有任何文件大小限制**，实际限制取决于服务器可用内存

#### 1.4 `md_store.py` — Markdown 文件存储与元数据管理（★新增核心模块）

使用 SQLite 存储元数据，文件系统存储 .md 内容。

**SQLite 表结构：**

```sql
CREATE TABLE md_files (
    id TEXT PRIMARY KEY,              -- UUID
    original_filename TEXT NOT NULL,   -- 原始文件名 (如 "报告.pdf")
    original_format TEXT NOT NULL,     -- 原始格式 (如 ".pdf")
    md_filename TEXT NOT NULL,         -- 保存的 md 文件名 (如 "abc123.md")
    md_size_bytes INTEGER NOT NULL,    -- md 文件大小
    original_size_bytes INTEGER,       -- 原始文件大小
    created_at TEXT NOT NULL,          -- ISO 时间戳
    updated_at TEXT,                   -- ★ 最后修改时间（在线编辑时更新）
    import_count INTEGER DEFAULT 0     -- 已导入知识库次数
);

CREATE TABLE md_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    md_file_id TEXT NOT NULL REFERENCES md_files(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,          -- SAG 项目 ID
    project_name TEXT,                 -- 项目名称（冗余，方便展示）
    document_id TEXT,                  -- SAG 文档 ID
    imported_at TEXT NOT NULL,         -- ISO 时间戳
    UNIQUE(md_file_id, project_id)     -- 同一文件不能重复导入同一项目
);
```

**核心函数：**

```python
class MdStore:
    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.db_path = storage_dir / "metadata.db"

    # --- 文件操作 ---
    async def save(self, markdown_content: str, original_filename: str,
                   original_format: str, original_size: int) -> dict:
        """保存 markdown 到文件系统 + 写入元数据。返回记录字典。"""
        file_id = str(uuid.uuid4())
        md_filename = f"{file_id}.md"
        md_path = self.storage_dir / md_filename
        await aiofiles.write(md_path, markdown_content)
        # INSERT INTO md_files ...
        return {"id": file_id, "md_filename": md_filename, ...}

    async def get(self, file_id: str) -> dict | None:
        """获取单个文件的元数据（含导入历史）。"""
        ...

    async def list_all(self) -> list[dict]:
        """列出所有已保存的 markdown 文件（按创建时间倒序）。"""
        ...

    async def get_content(self, file_id: str) -> str | None:
        """读取 markdown 文件内容。"""
        ...

    async def update_content(self, file_id: str, new_content: str) -> dict | None:
        """覆盖写入 markdown 文件内容 + 更新元数据（仅修改缓存）。
        注意：这不会同步更新 SAG 知识库中已入库的内容。"""
        ...

    async def delete(self, file_id: str) -> bool:
        """删除文件系统中的 .md 文件 + 数据库记录 + 导入历史。
        注意：这不会删除 SAG 知识库中已入库的文档。"""
        ...

    # --- 导入记录 ---
    async def record_import(self, file_id: str, project_id: str,
                            project_name: str, document_id: str):
        """记录一次导入操作。"""
        ...

    async def get_imports(self, file_id: str) -> list[dict]:
        """获取某个文件的全部导入历史。"""
        ...
```

**设计要点：**
- **删除语义**：删除 markdown 文件只删除 `md_storage/` 中的 .md 文件和 SQLite 元数据，**不影响** SAG 知识库中已入库的文档内容。两者独立管理。
- **去重导入**：同一 `(file_id, project_id)` 组合不能重复导入（UNIQUE 约束），避免同一份 markdown 在同一项目中重复入库。
- **跨项目复用**：同一份 markdown 可导入不同项目（但每个项目最多一次）；如需重新导入同一项目，需先在 SAG 中删除文档。

#### 1.5 `sag_client.py` — SAG API HTTP 客户端

```python
class SagClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=300.0)

    async def upload_document(self, project_id: str, title: str,
                              content: str, file_name: str) -> dict:
        """调用 SAG POST /api/documents/upload"""
        ...

    async def create_upload_job(self, ...) -> dict:
        """调用 SAG POST /api/documents/upload/jobs"""
        ...

    async def get_upload_job(self, job_id: str) -> dict:
        """调用 SAG GET /api/documents/upload/jobs/{job_id}"""
        ...

    async def proxy(self, method: str, path: str, **kwargs) -> Response:
        """通用代理方法，转发所有请求到 SAG"""
        ...
```

#### 1.6 `router.py` — API 路由

**WRAG 自有端点：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | WRAG 健康状态 + SAG 连接状态 |
| GET | `/api/formats` | 列出所有支持的文件格式 |
| POST | `/api/wrag/upload` | 上传文件（任意格式）→ 转换 → 保存md → 入库 |
| POST | `/api/wrag/upload/stream` | 上传 + SSE 流式进度推送 |

**Markdown 文件管理端点（★新增）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/wrag/markdown` | 列出所有已保存的 markdown 文件 |
| GET | `/api/wrag/markdown/{file_id}` | 获取文件详情（元数据 + 导入历史） |
| GET | `/api/wrag/markdown/{file_id}/content` | 获取 markdown 原始内容（用于预览） |
| GET | `/api/wrag/markdown/{file_id}/download` | 下载 .md 文件 |
| PATCH | `/api/wrag/markdown/{file_id}/content` | ★ 在线修改 markdown 内容（仅改缓存） |
| DELETE | `/api/wrag/markdown/{file_id}` | 删除保存的 markdown（不影响 KB） |
| POST | `/api/wrag/markdown/{file_id}/import` | 将已保存的 markdown 导入到指定项目 |
| POST | `/api/wrag/import` | 直接上传 markdown 文本导入（不保存文件） |

**代理端点：**

| 方法 | 路径 | 说明 |
|------|------|------|
| ALL | `/api/{path:path}` | 透明代理所有请求到 SAG |

---

**核心端点 `POST /api/wrag/upload`：**

请求：`multipart/form-data`
- `file`：上传的文件（任意 markitdown 支持格式）
- `project_id`：目标 SAG 项目
- `title?`：可选文档标题（默认使用原始文件名）
- `chunking_mode?`："heading_strict" 或 "token"
- `save_markdown?`：布尔值（默认 true，是否持久化保存 md 文件）

处理流程：
1. 根据支持的格式列表验证文件扩展名
2. 如果配置了 `max_upload_size_mb`，检查文件大小（默认不限制，仅当用户设置 `WRAG_MAX_UPLOAD_SIZE_MB` 时才校验）
3. 保存到临时文件
4. 调用 `convert_to_markdown(临时文件路径, 原始文件名)` → 获取 markdown 文本
5. **【新增】** 如果 `save_markdown=true`，调用 `MdStore.save()` 持久化 .md 文件 + 写元数据
6. 调用 SAG `POST /api/documents/upload`，传入转换后的 markdown 内容
7. **【新增】** 如果入库成功，调用 `MdStore.record_import()` 记录导入历史
8. 清理临时文件
9. 返回结果：
```json
{
  "file_id": "uuid",              // md_storage 中的文件 ID
  "document_id": "sag_doc_id",    // SAG 知识库中的文档 ID
  "project_id": "...",
  "original_filename": "报告.pdf",
  "original_format": ".pdf",
  "md_size_bytes": 12345,
  "chunk_count": 15,
  "event_count": 8,
  "markdown_saved": true
}
```

---

**SSE 流式进度推送** (`/api/wrag/upload/stream`)：

事件序列：
```
converting  →  converted  →  saving_md  →  md_saved  →  ingesting  →  ingested  →  done
                                                                               →  error(any step)
```

---

**Markdown 文件管理 API 详解：**

**`GET /api/wrag/markdown`** — 列表
```json
{
  "files": [
    {
      "id": "uuid-1",
      "original_filename": "年报2024.pdf",
      "original_format": ".pdf",
      "md_filename": "uuid-1.md",
      "md_size_bytes": 45678,
      "original_size_bytes": 2048000,
      "created_at": "2026-07-13T10:30:00Z",
      "import_count": 2,
      "imports": [
        {"project_id": "proj-1", "project_name": "财务分析", "document_id": "doc-1", "imported_at": "..."},
        {"project_id": "proj-2", "project_name": "年报汇总", "document_id": "doc-5", "imported_at": "..."}
      ]
    }
  ]
}
```

**`GET /api/wrag/markdown/{file_id}/content`** — 查看内容（返回纯文本 markdown）

**`GET /api/wrag/markdown/{file_id}/download`** — 下载文件
- 返回 `Content-Disposition: attachment; filename="原文件名.md"`

**★ `PATCH /api/wrag/markdown/{file_id}/content`** — 在线修改 markdown 内容
- 请求体：`{"content": "修改后的 markdown 文本"}`
- 覆盖写入 `md_storage/{file_id}.md` 文件
- 更新 SQLite 中的 `md_size_bytes` 和 `updated_at` 字段
- **重要**：此操作仅修改本地缓存的 .md 文件，**不会**同步更新 SAG 知识库中已入库的内容
- 如需更新知识库中的内容，需先在 SAG 中删除对应文档，再通过 `/import` 接口重新导入
- 返回 `{"id": "...", "md_size_bytes": 12345, "updated_at": "2026-07-13T12:00:00Z"}`

**`DELETE /api/wrag/markdown/{file_id}`** — 删除
- 删除 `md_storage/{file_id}.md` 文件
- 删除 SQLite 中 md_files 和 md_imports 相关记录
- **SAG 知识库中已入库的文档不受影响**
- 返回 `{"deleted": true}`

**`POST /api/wrag/markdown/{file_id}/import`** — 导入到知识库
- 请求体：`{"project_id": "target_project_id"}`
- 读取已保存的 .md 文件内容
- 调用 SAG API 入库
- 记录导入历史
- 返回 `{"document_id": "...", "project_id": "..."}`

---

### 二、WRAG 前端

#### 2.1 技术栈
- **React 19** + **TypeScript**
- **Vite 5**（开发服务器端口 5174，代理 `/api` 到 WRAG 后端端口 8000）
- **Ant Design 5** — 完整的企业级组件库，国际化支持完善，与 SAG 的 Tailwind 风格明显不同
- **@ant-design/icons** — 图标库
- **@xyflow/react**（ReactFlow）— 与 SAG 相同的图谱库（用于知识图谱可视化）
- **dayjs** — 日期格式化（Ant Design 内置依赖）
- **react-markdown** 或 **marked** — Markdown 内容渲染预览

#### 2.2 UI 风格对比（与 SAG 差异化）

| 方面 | SAG | WRAG |
|------|-----|------|
| CSS 框架 | Tailwind CSS（原子化类名） | Ant Design（组件体系） |
| 色彩方案 | 灰/蓝/中性色 | 暖蓝 + 青色强调（#1677ff 主题色） |
| 布局方式 | 自定义 CSS grid | Ant Design Layout（Sider + Content） |
| 图标 | Lucide React | @ant-design/icons |
| 组件来源 | 自定义（button.tsx、input.tsx 等） | Ant Design 内置组件 |
| 字体系统 | System font stack | Ant Design 字体系统 |
| 侧边栏 | 自定义样式项目栏 | Ant Design Menu 组件 |
| 弹窗 | 自定义 dialog 组件 | Ant Design Modal |
| 通知 | 自定义 toast | Ant Design message/notification |

#### 2.3 各页面设计

**整体布局（标签页从 4 个增加到 5 个）：**
```
┌──────────┬──────────────────────────────────────┬──────────────────┐
│ 项目列表  │  标签页（对话│文档│图谱│MCP│MD文件） │  设置齿轮按钮     │
│ (Sider)  ├──────────────────────────────────────┤                  │
│          │                                      │  活动面板         │
│          │          主内容区域                    │  (可折叠)        │
│          │                                      │                  │
└──────────┴──────────────────────────────────────┴──────────────────┘
```

**对话页面：**
- 用户/助手消息气泡列表
- 底部输入区 + 发送按钮 + 停止生成按钮
- 引用标记（[1]、[2]），点击打开 CitationDrawer
- Ant Design `Spin` 加载状态
- SSE 流式显示实时 token 输出

**文档页面：**
- 左侧面板：`Statistic` 数字卡片（文档数/分块数/事件数/实体数）、带 `Progress` 的上传队列、带归档/恢复操作的文档 `List`
- 右侧面板：`Tabs`（概览 / 分块 / 事件 / 实体 / 搜索）
- **上传按钮**：打开 UploadDialog，使用 `Upload.Dragger` 组件展示所有支持格式
- **与 SAG 的关键区别**：上传接受任意格式，后端透明处理转换，UI 显示"原始格式 → md"转换状态，上传成功的文件同时出现在 Markdown文件 页面

**图谱页面：**
- 全区域 ReactFlow 画布（与 SAG 同库）
- 按类型着色的实体节点 + 事件节点
- 单击展开，双击查看详情
- Ant Design `FloatButton` 缩放控制

**MCP 页面：**
- 代码块展示 `mcpServers` JSON 配置
- `Descriptions` 组件展示工具列表
- 一键复制按钮 + `message.success()` 提示

**★ Markdown 文件页面（新增）：**
- `Table` 组件列出所有已转换保存的 markdown 文件
- 列：原始文件名、原始格式标签、文件大小、转换时间、最后修改时间、导入历史（Badge 列表）
- 每行操作按钮：
  - **预览** — 打开 MdPreviewModal，渲染 markdown 内容
  - **编辑** — ★ 打开 MdEditorModal，在线编辑 markdown 内容
  - **下载** — 触发浏览器下载 .md 文件
  - **导入到项目** — 打开 ImportToProjectModal，选择目标项目
  - **删除** — `Popconfirm` 确认后删除（提示：仅删除 md 文件，不影响已入库内容）
- 顶部工具栏：刷新按钮、搜索过滤输入框
- 空状态提示："暂无已转换的 Markdown 文件，上传一个文件开始使用"

**设置面板（Drawer 抽屉）：**
- AI 供应商：`Form` 表单（base URL、模型名、API key 密码输入框）
- 搜索默认值：`Select` 选择搜索模式、`Slider` 设置 Top-K
- 上传设置：`InputNumber` 最大文件大小（MB），留空 = 不限制
- 危险操作区：`Popconfirm` 确认后清除/删除

**上传对话框（UploadDialog）：**
- `Upload.Dragger` 拖拽上传区域
- 支持的格式标签展示：PDF、DOCX、PPTX、XLSX、CSV、HTML、EPUB、图片、音频、ZIP、URL 等
- 如果用户配置了 `WRAG_MAX_UPLOAD_SIZE_MB`，显示"最大 N MB"提示；未配置则不显示限制
- `Switch` 开关："保存 Markdown 文件"（默认开启）
- 转换 + 入库阶段的 SSE 进度追踪（分步骤显示）
- 上传成功后显示结果摘要，并提供"查看 Markdown 文件"快捷链接

**★ Markdown 预览弹窗（MdPreviewModal）：**
- `Modal` 全屏或大尺寸
- 使用 markdown 渲染库显示格式化内容
- 顶部显示：原始文件名、格式、大小、转换时间、最后修改时间
- 操作按钮：**编辑**、下载、导入到项目、删除

**★ Markdown 编辑弹窗（MdEditorModal）：**
- `Modal` 全屏或大尺寸
- 左侧/上方为 markdown 源码编辑区（`TextArea` 等宽字体），右侧/下方为实时渲染预览（分栏或上下布局）
- 编辑器使用 `@uiw/react-md-editor` 或自定义分栏实现
- **保存按钮**：点击后弹出确认对话框，文案：
  > ⚠️ 注意：修改仅会保存到本地 Markdown 缓存，不会同步更新已导入知识库的内容。
  > 如需在知识库中生效，请先前往对应项目的文档管理中删除该文档，再重新导入。
  > 确定保存修改？
- 确认后调用 `PATCH /api/wrag/markdown/{file_id}/content`，成功后 `message.success("Markdown 内容已更新")` 并刷新列表
- 取消按钮关闭确认框

**★ 导入到项目弹窗（ImportToProjectModal）：**
- `Modal` 中等尺寸
- `Select` 下拉选择目标项目（列出所有项目）
- 可选修改文档标题
- 确认后调用导入 API
- 成功后 `message.success()` 并刷新列表

#### 2.4 国际化（i18n）
- 与 SAG 相同的模式：中/英文切换
- Ant Design 内置 `ConfigProvider` 处理组件文案的国际化
- 所有自定义文案使用翻译 Context

#### 2.5 API 客户端 (`lib/api.ts`)
- 接口面与 SAG 的 api.ts 一致，但指向 WRAG 后端
- 新增方法：
  - `uploadFile(formData, onProgress)` — 上传 + SSE 进度
  - `getFormats()` — 获取支持格式列表
  - `getUploadJob(jobId)` — 查询任务状态
  - `listMdFiles()` — ★ 列出已保存 markdown
  - `getMdFile(fileId)` — ★ 获取文件详情
  - `getMdFileContent(fileId)` — ★ 获取文件内容
  - `downloadMdFile(fileId)` — ★ 下载文件
  - `updateMdFileContent(fileId, content)` — ★ 在线修改 markdown 内容
  - `deleteMdFile(fileId)` — ★ 删除文件
  - `importMdFile(fileId, projectId)` — ★ 导入到项目
- SSE 流式支持与 SAG 实现完全相同

---

### 三、基础设施

#### 3.1 `docker-compose.yml`

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: wrag_postgres
    environment:
      POSTGRES_DB: sag_lite
      POSTGRES_USER: sag_lite
      POSTGRES_PASSWORD: sag_lite_pass
    ports:
      - "5432:5432"
    volumes:
      - wrag_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sag_lite -d sag_lite"]
      interval: 5s
      timeout: 5s
      retries: 20

  wrag:
    build: .
    container_name: wrag_app
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgres://sag_lite:sag_lite_pass@postgres:5432/sag_lite
      # - WRAG_MAX_UPLOAD_SIZE_MB=100   # 可选：取消注释并设置值以启用文件大小限制
    volumes:
      - ./md_storage:/app/md_storage   # ★ Markdown 文件持久化卷

volumes:
  wrag_pgdata:
```

#### 3.2 `start.sh` — 一键启动脚本

```bash
#!/bin/bash
set -e

# 1. 检查前置条件：node、python3、docker
# 2. 设置 Python 虚拟环境（如不存在则创建）
#    python3 -m venv ../.venv
#    source ../.venv/bin/activate
#    pip install -r requirements.txt
#    pip install -e ../markitdown/packages/markitdown[all]
# 3. 安装 SAG 依赖
#    cd ../SAG && npm install && cd ..
# 4. 启动 PostgreSQL（如未运行）
#    docker compose -f WRAG/docker-compose.yml up -d postgres
# 5. 执行 SAG 数据库初始化
#    cd SAG && npm run db:setup && cd ..
# 6. 创建 md_storage 目录（如不存在）
#    mkdir -p WRAG/md_storage
# 7. 启动 WRAG 后端（自动拉起 SAG 子进程）
#    cd WRAG && python backend/main.py &
# 8. 启动 WRAG 前端开发服务器
#    cd WRAG/frontend && npm run dev
```

#### 3.3 Python 虚拟环境
- 位置：`/home/kali/RAG_1/.venv/`
- 创建命令：`python3 -m venv .venv`
- 主要依赖：FastAPI、uvicorn、httpx、markitdown（可编辑安装）、python-multipart、pydantic-settings、aiofiles、aiosqlite

#### 3.4 `requirements.txt`
```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
httpx>=0.27.0
python-multipart>=0.0.9
pydantic-settings>=2.5.0
aiofiles>=24.0.0
aiosqlite>=0.20.0
```

---

## 实现步骤

### 第一步：创建项目骨架
- 创建 WRAG/ 目录结构
- 创建 `.env.example`、`requirements.txt`
- 创建 `docker-compose.yml`
- 初始化 Python 虚拟环境并安装依赖
- 初始化前端项目（Vite + React + TypeScript + Ant Design）

### 第二步：实现后端
- `config.py` — 加载环境变量
- `models.py` — Pydantic 数据模型
- `converter.py` — markitdown 转换封装
- `md_store.py` — ★ Markdown 存储 + SQLite 元数据管理
- `sag_client.py` — SAG API HTTP 客户端 + 代理
- `router.py` — FastAPI 路由（上传、markdown 管理、SAG 代理）
- `main.py` — FastAPI 应用 + SAG 生命周期管理

### 第三步：实现前端
- 初始化 Vite + React + TypeScript 项目
- 安装 Ant Design、ReactFlow 等依赖
- 搭建布局框架（Sider + Content + Drawer）
- 实现各页面：对话、文档、图谱、MCP、**Markdown文件**
- 实现各组件：项目栏、设置面板、上传对话框、**MdPreviewModal**、**ImportToProjectModal** 等
- 实现国际化
- 实现 API 客户端

### 第四步：创建启动脚本
- `start.sh`（Linux/Mac）
- `start.bat`（Windows）

### 第五步：编写 README
- 项目简介
- 架构图
- 安装与启动指南
- 配置说明
- API 参考

---

## 验证方案

### 1. 后端单独测试
启动 PostgreSQL → 手动启动 SAG → 启动 WRAG 后端，使用 curl 测试：

```bash
# 健康检查
curl http://localhost:8000/health

# 获取支持格式
curl http://localhost:8000/api/formats

# 上传 PDF → 转换 → 保存 md → 入库
curl -X POST http://localhost:8000/api/wrag/upload \
  -F "file=@test.pdf" \
  -F "project_id=<project_id>" \
  -F "save_markdown=true"

# 列出已保存的 markdown 文件
curl http://localhost:8000/api/wrag/markdown

# 查看 markdown 内容
curl http://localhost:8000/api/wrag/markdown/<file_id>/content

# 下载 markdown 文件
curl -O http://localhost:8000/api/wrag/markdown/<file_id>/download

# ★ 在线修改 markdown 内容
curl -X PATCH http://localhost:8000/api/wrag/markdown/<file_id>/content \
  -H "Content-Type: application/json" \
  -d '{"content": "修改后的 markdown 内容"}'

# 导入到另一个项目
curl -X POST http://localhost:8000/api/wrag/markdown/<file_id>/import \
  -H "Content-Type: application/json" \
  -d '{"project_id": "another_project_id"}'

# 删除 markdown 文件（不影响 KB）
curl -X DELETE http://localhost:8000/api/wrag/markdown/<file_id>

# 通过代理搜索
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "测试", "sourceIds": ["<project_id>"], "strategy": "multi"}'
```

### 2. 全栈测试
运行 `./start.sh`，打开浏览器访问 http://localhost:5174：
- 创建项目 → 成功
- 上传各种文件类型（PDF、DOCX、HTML、CSV）→ 全部成功入库
- **切换到 Markdown文件 标签页 → 看到所有转换记录**
- **预览 markdown 内容 → 渲染正确**
- **在线编辑 markdown → 保存成功，确认弹窗正确提示**
- **修改后的 md 重新导入项目 → 内容更新**
- **下载 .md 文件 → 文件内容正确**
- **将同一份 markdown 导入另一个项目 → 成功**
- **删除 markdown 文件 → 成功删除，但知识库中文档仍在**
- **删除 markdown 后重新上传同一文件 → 生成新的 markdown 记录，可重新导入**
- 对话式检索知识库 → 返回引用
- 查看知识图谱 → 节点和边正确渲染
- 检查 MCP 选项卡 → 显示配置 JSON

### 3. 边界情况
- 上传不支持的格式 → 清晰的错误提示
- 上传超大文件 → 校验错误（超过 `max_upload_size_mb`）
- 未配置文件大小限制 → 任意大小文件均可上传（取决于内存）
- 同一 markdown 重复导入同一项目 → 409 Conflict 错误
- 删除 markdown 后，SAG 中的文档仍可正常检索
- SAG 尚未就绪 → WRAG 重试后优雅失败
- SAG 已在运行 → WRAG 检测并跳过启动
- md_storage 目录为空 → Markdown文件 页面显示空状态

---

## 关键设计决策

1. **markitdown 无文件大小限制**：markitdown 本身对文件大小没有限制，实际瓶颈是服务器内存（文件读入内存处理）。WRAG **默认不做文件大小校验**，用户可通过设置 `WRAG_MAX_UPLOAD_SIZE_MB` 环境变量来启用限制。

2. **Markdown 文件与知识库内容独立管理**：转换后的 .md 文件持久化保存在 `md_storage/` 目录，通过 Docker volume 映射。删除 md 文件不影响知识库，删除知识库文档也不影响 md 文件。两者解耦。

3. **同一份 markdown 可导入多个项目**：一个文件可以导入到不同的知识库项目（每个项目最多一次）。导入历史完整记录在 SQLite 中。

4. **反向代理 SAG 所有 API**：前端只与 WRAG 后端（端口 8000）通信。WRAG 转发除 `/api/wrag/*` 之外的所有请求。这样提供统一的 API 入口，简化 CORS 处理。

5. **SAG 作为子进程**：WRAG 通过 `subprocess.Popen` 启动 SAG。一条命令即可启动全部服务，无需手动编排。

6. **Ant Design**：选择 Ant Design 而非 Tailwind，因为其提供了完整的中文友好企业级组件库，与 SAG 的外观明显不同，同时加速开发。

7. **MarkItDown 可编辑安装**：`pip install -e ../markitdown/packages/markitdown[all]` 保持原始仓库不变，同时使 Python 包可用。

8. **SQLite 用于元数据**：轻量级，无需额外容器，适合存储文件元数据和导入历史。数据文件在 `md_storage/metadata.db`，随 Docker volume 持久化。

9. **异步上传 + SSE 流式**：大文件转换和入库耗时长，流式推送分步骤进度事件（converting → saving_md → ingesting），让用户看到实时状态。

10. **临时文件自动清理**：原始上传文件保存到 `tempfile.mkstemp()`，转换完成后立即清理。只保留转换后的 .md 文件在 md_storage 中。

11. **Markdown 在线编辑仅改缓存**：前端提供在线编辑器修改 md 内容，但保存时明确警告用户：修改仅更新本地 md 缓存文件，不会同步到已入库的知识库。如需在知识库中生效，必须手动删除旧文档并重新导入。这样设计避免了数据一致性问题（SAG 入库后会重新分块、提取事件、生成向量，无法通过简单替换文本来"更新"）。
