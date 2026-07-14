# WRAG — 多格式 RAG 知识库 设计方案

> **目标**：将 [MarkItDown](https://github.com/microsoft/markitdown)（任意格式 → Markdown 转换）和 [SAG](https://github.com/Zleap-AI/SAG)（RAG 知识库检索）整合为统一系统。
> **核心流程**：上传任意格式文件 → MarkItDown 转换为 Markdown → SAG 入库并启用 RAG 检索。
> 本文档包含所有已知的坑和规避方案，可直接交给 Claude Code 开发出完整可用的系统。

---

## 目录

1. [架构总览](#1-架构总览)
2. [目录结构](#2-目录结构)
3. [后端设计](#3-后端设计)
4. [前端设计](#4-前端设计)
5. [基础设施](#5-基础设施)
6. [实施步骤](#6-实施步骤)
7. [验证方案](#7-验证方案)
8. [已知陷阱与规避](#8-已知陷阱与规避)

---

## 1. 架构总览

```
WRAG 前端 (React 19 + Ant Design 5, 端口 5174)
       │  Vite 代理 /api → http://127.0.0.1:8555
       ▼
WRAG 后端 (FastAPI + Python, 端口 8555)
  ├── POST /api/wrag/upload         → 文件上传 + 格式转换 + 入库
  ├── POST /api/wrag/upload/stream  → 同上 + SSE 流式进度推送
  ├── /api/wrag/markdown/*          → Markdown 文件 CRUD 管理
  └── /api/{path:path}              → 透明反向代理到 SAG（最后注册！）
       │
       ▼
SAG 后端 (Fastify, 端口 4173) — 原封不动
       │
       ▼
PostgreSQL 16 + pgvector (Docker, 端口 5432)
```

**关键设计决策**：

| 决策 | 选择 | 原因 |
|------|------|------|
| WRAG 端口 | 8555（非 8000） | 避开常见端口冲突 |
| SAG 管理方式 | 子进程（subprocess.Popen） | 一键启动，无需手动编排 |
| SAG 前端 | **不启动** | WRAG 用自己的 Ant Design 前端替代 |
| 前端 UI 框架 | Ant Design 5 | 与 SAG 的 Tailwind 明显区隔，中文友好 |
| 元数据存储 | SQLite（md_storage/metadata.db） | 轻量，无需额外容器 |
| 文件大小限制 | 默认不限制（None） | markitdown 本身无限制，由用户按需设定 |
| Markdown 编辑 | 仅改缓存，不自动同步 KB | 避免数据一致性复杂问题 |

---

## 2. 目录结构

```
WRAG/                              # 项目根目录
├── start.sh                       # 一键启动脚本
├── docker-compose.yml             # PostgreSQL 容器配置
├── docker-start.sh                # Docker 生产模式启动
├── .env                           # WRAG 配置（start.sh 自动创建，不覆盖已有值）
├── .env.example                   # WRAG 配置模板
├── requirements.txt               # Python 依赖
├── README.md / README-CN.md       # 文档
├── WRAG_方案.md                    # 本设计方案
│
├── backend/                       # FastAPI 后端（Python）
│   ├── main.py                    # 入口 + 生命周期管理
│   ├── config.py                  # pydantic-settings 配置
│   ├── router.py                  # 所有 API 路由
│   ├── converter.py               # MarkItDown 转换封装
│   ├── sag_client.py              # SAG API HTTP 客户端
│   ├── md_store.py                # SQLite + 文件系统存储
│   └── models.py                  # Pydantic 数据模型
│
├── frontend/                      # React 前端
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── src/
│       ├── main.tsx               # ReactDOM 入口
│       ├── App.tsx                 # 主布局
│       ├── types.ts               # 共享类型定义
│       ├── i18n.tsx               # 中英文国际化
│       ├── lib/api.ts             # API 客户端
│       ├── pages/
│       │   ├── Chat.tsx           # 对话式 RAG
│       │   ├── Documents.tsx      # 文档管理 + 上传
│       │   ├── Graph.tsx          # 知识图谱（ReactFlow）
│       │   ├── Mcp.tsx            # MCP 配置
│       │   └── MarkdownFiles.tsx  # Markdown 文件管理
│       └── components/
│           ├── ProjectRail.tsx    # 左侧项目列表
│           ├── UploadDialog.tsx   # 文件上传弹窗
│           ├── MdPreviewModal.tsx  # Markdown 预览
│           ├── MdEditorModal.tsx  # Markdown 在线编辑
│           ├── ImportToProjectModal.tsx # 导入到项目
│           └── ...                # 其他组件
│
├── markitdown/                    # git clone from microsoft/markitdown（原封不动）
├── SAG/                           # git clone from Zleap-AI/SAG（原封不动）
│   └── .env                       # SAG / AI 配置（start.sh 自动创建）
│
├── md_storage/                    # 运行时创建 — 持久化 .md 文件
│   ├── {uuid}.md                  # 转换后的 markdown 文件
│   └── metadata.db                # SQLite 元数据
│
└── .venv/                         # Python 虚拟环境
```

---

## 3. 后端设计

### 3.1 config.py — 配置管理

使用 `pydantic-settings`，从 `.env` 文件读取：

```python
class Settings(BaseSettings):
    # --- WRAG 服务器 ---
    wrag_host: str = "0.0.0.0"
    wrag_port: int = 8555              # ⚠️ 默认 8555，避开 8000

    # --- 路径 ---
    sag_api_url: str = "http://127.0.0.1:4173"  # SAG 内部地址
    sag_dir: Path = Path("./SAG")
    markitdown_dir: Path = Path("./markitdown")
    md_storage_dir: Path = Path("md_storage")

    # --- 上传限制（None = 不限制）---
    max_upload_size_mb: int | None = None

    # --- 支持的文件格式 ---
    supported_formats: list[str] = [
        ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv",
        ".html", ".htm", ".epub", ".md", ".txt", ".json",
        ".xml", ".jpg", ".jpeg", ".png", ".gif", ".bmp",
        ".mp3", ".wav", ".ogg", ".zip", ".ipynb", ".msg", ".rtf",
    ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "allow"}
```

**优先级**：环境变量 > `.env` 文件 > 代码默认值。所以 `.env` 中的 `WRAG_PORT=8555` 会覆盖代码中的 `8555`，用户可随时修改。

### 3.2 main.py — 生命周期管理（关键陷阱区）

#### 启动顺序

```python
async def startup():
    # 1. 初始化 _shutdown_event（用于优雅关闭）
    _shutdown_event = asyncio.Event()

    # 2. 初始化 MdStore（SQLite + 文件系统）
    md_store = MdStore(md_storage_dir)
    await md_store.initialize()

    # 3. 检查 SAG 是否已在运行
    #    ⚠️ 使用 asyncio.to_thread() 包裹阻塞调用！
    resp = await asyncio.to_thread(
        urllib.request.urlopen, url, None, 2.0   # 注意第三个参数才是 timeout！
    )

    # 4. 如果 SAG 未运行，启动它
    if not sag_already_running:
        _setup_sag_database()       # npm run db:setup
        _sag_process = _start_sag() # subprocess.Popen
        await _health_poll_sag()    # ⚠️ async 版本！

    # 5. 创建 SagClient + 注入路由依赖
    _sag_client = SagClient(sag_api_url)
    init_router(md_store, _sag_client)
```

#### 启动 SAG 子进程

```python
def _start_sag():
    # ⚠️ 不要覆盖 HTTP_HOST / HTTP_PORT！
    # SAG 自己通过 dotenv 读取 .env 中的配置
    env = os.environ.copy()

    proc = subprocess.Popen(
        ["npm", "run", "dev:api"],       # 只启动 SAG 后端，不启动前端！
        cwd=str(sag_dir),
        env=env,
        preexec_fn=os.setsid,            # 创建进程组，方便 shutdown 时 kill 整个树
    )
```

#### 健康检查（必须异步，不能阻塞事件循环）

```python
async def _health_poll_sag(max_retries=60, interval=2.0):
    for i in range(max_retries):
        # 每次轮询前检查 shutdown 信号
        if _shutdown_event.is_set():
            return False

        # ⚠️ 使用 asyncio.to_thread 避免阻塞事件循环
        resp = await asyncio.to_thread(
            urllib.request.urlopen, url, None, 3.0  # 第 3 个参数是 timeout！
        )

        # ⚠️ 使用 asyncio.sleep 让出事件循环
        #     不要用 time.sleep() — 它会阻塞 Ctrl+C！
        await asyncio.wait_for(
            _shutdown_event.wait(), timeout=interval
        )
```

#### 关闭顺序

```python
async def shutdown():
    # 1. 设置 shutdown 信号 → 健康检查循环立即退出
    _shutdown_event.set()

    # 2. 关闭 HTTP 客户端
    await _sag_client.close()

    # 3. 停止 SAG 子进程（整个进程组）
    os.killpg(os.getpgid(_sag_process.pid), signal.SIGTERM)
    _sag_process.wait(timeout=15)
```

### 3.3 router.py — API 路由

#### 路由注册顺序（非常重要！）

```python
router = APIRouter()

# 1. WRAG 自有端点（先注册，优先匹配）
@router.get("/health")
@router.get("/api/formats")
@router.post("/api/wrag/upload")
@router.post("/api/wrag/upload/stream")
@router.get("/api/wrag/markdown")
# ... 更多 markdown 管理端点

# 2. SAG 代理（必须最后注册，否则会劫持 WRAG 路由）
@router.api_route("/api/{path:path}", methods=["GET","POST",...,"DELETE"])
```

#### 文件上传核心端点

```python
@router.post("/api/wrag/upload")
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    save_markdown: bool = Form(True),
):
    # 1. 校验格式
    ext = Path(original_filename).suffix.lower()
    if ext not in settings.supported_formats:
        raise HTTPException(400, ...)

    # 2. 保存到临时文件
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        while chunk := await file.read(4 * 1024 * 1024):
            tmp.write(chunk)

    try:
        # 3. 转换（线程池中执行，避免阻塞）
        markdown_content = await loop.run_in_executor(
            None, convert_to_markdown, tmp_path
        )

        # 4. 可选：保存 md 文件到存储
        if save_markdown:
            record = await md_store.save(...)
            file_id = record["id"]

        # 5. 入库到 SAG
        #    ⚠️ file_name 必须传 {title}.md，不能传原始文件名！
        #    SAG 只接受 .md 和 .txt 扩展名，传 .pdf 会返回 400
        result = await sag.upload_document(
            project_id=project_id,
            title=doc_title,
            content=markdown_content,
            file_name=f"{doc_title}.md",       # ← 关键！
        )

        # 6. 记录导入历史
        if file_id:
            await md_store.record_import(...)

    finally:
        os.unlink(tmp_path)  # 清理临时文件
```

#### Markdown 重新导入（含重复检查）

```python
@router.post("/api/wrag/markdown/{file_id}/import")
async def import_md_file(file_id: str, body: ImportRequest):
    # 1. 检查文件是否存在
    record = await md_store.get(file_id)
    if not record: raise HTTPException(404)

    # 2. ⚠️ 必须先检查是否已导入同一项目！
    #    否则会重复调用 SAG 创建重复文档
    existing_imports = await md_store.get_imports(file_id)
    for imp in existing_imports:
        if imp["project_id"] == body.project_id:
            raise HTTPException(
                409,
                detail="File already imported into this project. "
                       "Delete the document from SAG first to re-import."
            )

    # 3. 再调用 SAG 入库
    result = await sag.upload_document(
        file_name=f"{doc_title}.md",  # 同样必须传 .md 扩展名
    )
```

### 3.4 sag_client.py — SAG API 客户端

```python
class SagClient:
    async def upload_document(self, project_id, title, content, file_name):
        """⚠️ file_name 必须是 .md 或 .txt 结尾！"""
        resp = await self.client.post(
            f"{self.base_url}/api/documents/upload",
            json={
                "sourceId": project_id,
                "title": title,
                "fileName": file_name,   # 必须 .md 结尾
                "content": content,
            },
        )

    async def proxy(self, request: Request):
        """透明代理 — 处理 SSE 流式响应"""
        # 检查请求头判断是否为 SSE
        is_sse = "text/event-stream" in request.headers.get("accept", "")
        if is_sse:
            # 流式转发
            async def _sse_iter():
                async with self.client.stream(...) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk
            return StreamingResponse(_sse_iter(), media_type="text/event-stream")
        else:
            # 普通请求
            resp = await self.client.send(req)
            return Response(content=resp.content, ...)
```

### 3.5 md_store.py — Markdown 文件存储

**SQLite 表结构**：

```sql
CREATE TABLE md_files (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    original_format TEXT NOT NULL,
    md_filename TEXT NOT NULL,
    md_size_bytes INTEGER NOT NULL,
    original_size_bytes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    import_count INTEGER DEFAULT 0
);

CREATE TABLE md_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    md_file_id TEXT NOT NULL REFERENCES md_files(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    project_name TEXT,
    document_id TEXT,
    imported_at TEXT NOT NULL,
    UNIQUE(md_file_id, project_id)  -- 同一文件不能导入同一项目两次
);
```

**核心设计原则**：
- 删除 md 文件 ≠ 删除知识库文档（两者独立管理）
- 在线编辑 md 只改本地缓存，不会自动同步到知识库
- 使用 `INSERT OR IGNORE` 处理重复导入记录（但前端必须先检查再调用 SAG，见 3.3 节）

### 3.6 converter.py — MarkItDown 转换

```python
from markitdown import MarkItDown

md_converter = MarkItDown()

def convert_to_markdown(file_path: str) -> str:
    """markitdown 自动检测格式并转换，返回 markdown 文本。"""
    result = md_converter.convert(file_path)
    return result.markdown
```

- markitdown 通过 `pip install -e ./markitdown/packages/markitdown[all]` 安装
- 支持 19+ 种格式：PDF, DOCX, PPTX, XLSX, CSV, HTML, EPUB, 图片, 音频, ZIP, Jupyter notebook 等
- **markitdown 本身没有文件大小限制**，实际瓶颈是服务器内存（文件读入内存处理）

---

## 4. 前端设计

### 4.1 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19 | 框架 |
| TypeScript | 5+ | 类型安全 |
| Vite | 6 | 构建工具（端口 5174） |
| Ant Design | 5 | UI 组件库 |
| @ant-design/icons | - | 图标 |
| @xyflow/react | - | 知识图谱画布 |
| react-markdown | - | Markdown 渲染 |
| dayjs | - | 日期格式化 |

### 4.2 Vite 配置

```typescript
// vite.config.ts — 代理 /api 到 WRAG 后端
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8555",
      "/health": "http://127.0.0.1:8555",
    },
  },
});
```

### 4.3 API 客户端（lib/api.ts）

**文件上传（支持取消）**：

```typescript
async uploadFile(
  projectId: string,
  file: File,
  title: string | null,
  saveMarkdown: boolean,
  onProgress?: (stage: string, data: any) => void,
  signal?: AbortSignal  // ← 支持取消的关键！
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_id", projectId);
  formData.append("save_markdown", String(saveMarkdown));

  const resp = await fetch("/api/wrag/upload/stream", {
    method: "POST",
    body: formData,
    signal,  // ← 传入 AbortSignal
  });

  // SSE 流式解析
  return new Promise((resolve, reject) => {
    readSse<any>(resp, (event) => {
      onProgress?.(event.stage, event);
      if (event.stage === "done") resolve(event);
      if (event.stage === "error") reject(new Error(event.message));
    });
  });
}
```

**SSE 流式解析器**：

```typescript
async function readSse<T>(resp: Response, onEvent: (e: T) => void) {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const dataLine = part.split("\n").find(l => l.startsWith("data: "));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(6)) as T);
    }
  }
}
```

### 4.4 UploadDialog — 上传弹窗（关键组件）

**必须支持的功能**：
- 拖拽/点击上传
- 显示支持的文件格式列表
- SSE 进度条（converting → saving_md → ingesting → done）
- **取消按钮在上传中始终可用**（使用 AbortController）

```typescript
function UploadDialog({ open, projectId, onClose, onSuccess, t }) {
  const abortRef = useRef<AbortController | null>(null);

  const handleUpload = async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await api.uploadFile(projectId, file, null, saveMarkdown,
        (stage, data) => {
          if (controller.signal.aborted) return;  // 取消后忽略回调
          setStage(stage);
          setProgress(stageMap[stage]?.pct ?? 0);
        },
        controller.signal  // 传入 signal
      );
      message.success("上传成功!");
      onSuccess();
    } catch (e: any) {
      if (e.name === "AbortError") return;  // 用户取消，不显示错误
      setError(e.message);
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    if (uploading && abortRef.current) {
      abortRef.current.abort();          // 中止 fetch 请求
      message.info("已取消上传");
    }
    onClose();
  };

  return (
    <Modal
      onOk={handleUpload}
      onCancel={handleCancel}            // ← 取消时检查 abortRef
      cancelButtonProps={{ disabled: false }}  // ← 取消按钮始终可用
      maskClosable={!uploading}          // 上传中禁止点击蒙层关闭
      keyboard={!uploading}              // 上传中禁止 ESC 关闭
    >
      {/* 拖拽区域、格式标签、Switch 开关、Progress 进度条 */}
    </Modal>
  );
}
```

### 4.5 页面概览

| 页面 | 功能 | 关键组件 |
|------|------|----------|
| Chat | 对话式 RAG，SSE 流式响应 | MessageList, InputArea, CitationDrawer |
| Documents | 文档管理 + 上传 | Stats cards, Upload list, Detail tabs |
| Graph | 知识图谱（ReactFlow） | 实体/事件节点，力导向图 |
| MCP | MCP 配置展示 | JSON 代码块，工具列表 |
| Markdown Files | Markdown 文件管理 | Table, Preview, Edit, Import, Delete |

---

## 5. 基础设施

### 5.1 docker-compose.yml

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

volumes:
  wrag_pgdata:
```

### 5.2 .env 文件配置

#### WRAG/.env

```env
WRAG_HOST=0.0.0.0
WRAG_PORT=8555
SAG_API_URL=http://127.0.0.1:4173
MD_STORAGE_DIR=md_storage
# WRAG_MAX_UPLOAD_SIZE_MB=100     # 取消注释启用文件大小限制
```

#### SAG/.env（关键陷阱）

```env
# ⚠️ RERANK_BASE_URL 必须注释掉，不能留空！
# SAG 的 Zod 校验规则是 .url().optional()
# 如果 key 存在但值为空字符串，会报 "Invalid url" 错误
# 正确做法：注释掉整行，让 key 不存在
# RERANK_BASE_URL=

# ⚠️ INGEST_CONCURRENCY 同理，注释掉让 SAG 使用默认值 5
# INGEST_CONCURRENCY=5
```

### 5.3 start.sh — 一键启动脚本

```bash
#!/bin/bash
set -eo pipefail    # ⚠️ 必须用 pipefail，光 set -e 不够

# 智能 .env 同步函数
sync_env() {
    local example="$1" target="$2" name="$3"
    if [ ! -f "$target" ]; then
        cp "$example" "$target"
        return
    fi
    # 只追加新变量，不覆盖已有配置
    while IFS='=' read -r key _; do
        if ! grep -q "^[[:space:]]*${key}=" "$target" 2>/dev/null; then
            echo "# [NEW] Added from .env.example" >> "$target"
            grep "^[[:space:]]*${key}=" "$example" >> "$target"
        fi
    done < "$example"
}

# 启动步骤
# 1. 检查依赖：node, python3, docker
# 2. 同步 .env 文件
# 3. 创建 Python venv + 安装依赖
# 4. 安装 SAG 和前端 npm 依赖
# 5. Docker 启动 PostgreSQL
# 6. 初始化 SAG 数据库（npm run db:setup）
# 7. 创建 md_storage/ 目录
# 8. 启动 WRAG 后端（自动拉起 SAG API）
# 9. 启动 WRAG 前端开发服务器
# 10. 提示未配置 API key 的注意事项

# 健康检查
for i in $(seq 1 60); do
    if curl -s http://localhost:8555/health >/dev/null 2>&1; then
        break
    fi
    sleep 2
done
```

### 5.4 requirements.txt

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

## 6. 实施步骤

### 步骤 1：创建项目骨架

```
mkdir -p WRAG/backend WRAG/frontend/src/{pages,components,lib}
```

### 步骤 2：实现后端

按以下顺序编写文件，每个文件的关键陷阱已在第 3 节标注：

1. `config.py` — 配置类（注意端口 8555）
2. `models.py` — Pydantic 数据模型
3. `converter.py` — MarkItDown 封装
4. `md_store.py` — SQLite + 文件系统（注意独立管理原则）
5. `sag_client.py` — HTTP 客户端（注意 file_name 必须是 .md）
6. `router.py` — 路由（注意路由注册顺序 + 重复导入检查 + file_name 传 .md）
7. `main.py` — 生命周期（注意 async 健康检查 + shutdown_event + 不覆盖 SAG env）

### 步骤 3：实现前端

1. 用 Vite 初始化 React + TypeScript 项目
2. 安装依赖：antd, @xyflow/react, react-markdown
3. 实现 `api.ts`（注意 AbortSignal 支持）
4. 实现 `UploadDialog.tsx`（注意 AbortController + 取消按钮始终可用）
5. 实现所有页面组件

### 步骤 4：创建启动脚本

1. `start.sh`（注意 `set -eo pipefail`）
2. `docker-compose.yml`（PostgreSQL 16 + pgvector）

### 步骤 5：SAG/.env 配置

```bash
cp SAG/.env.example SAG/.env
# 编辑 SAG/.env：
# - 填入 EMBEDDING_API_KEY 和 LLM_API_KEY
# - 注释掉 RERANK_BASE_URL（留空会导致 Zod 校验失败）
# - 注释掉 INGEST_CONCURRENCY（让 SAG 使用默认值 5）
```

---

## 7. 验证方案

### 7.1 后端 API 测试

```bash
# 健康检查
curl http://localhost:8555/health
# 期望: {"status":"ok","sag_connected":true}

# 格式列表
curl http://localhost:8555/api/formats

# 上传 .md 文件
curl -X POST http://localhost:8555/api/wrag/upload \
  -F "file=@test.md" \
  -F "project_id=<project-id>"

# 上传 .pdf 文件（自动转换）
curl -X POST http://localhost:8555/api/wrag/upload \
  -F "file=@test.pdf" \
  -F "project_id=<project-id>"

# 列出 markdown 文件
curl http://localhost:8555/api/wrag/markdown

# 查看 markdown 内容
curl http://localhost:8555/api/wrag/markdown/<file_id>/content

# 编辑 markdown 内容
curl -X PATCH http://localhost:8555/api/wrag/markdown/<file_id>/content \
  -H "Content-Type: application/json" \
  -d '{"content": "新内容"}'

# 导入到项目
curl -X POST http://localhost:8555/api/wrag/markdown/<file_id>/import \
  -H "Content-Type: application/json" \
  -d '{"project_id": "<target-project-id>"}'

# 重复导入应返回 409
curl -X POST http://localhost:8555/api/wrag/markdown/<file_id>/import \
  -H "Content-Type: application/json" \
  -d '{"project_id": "<same-project-id>"}'
# 期望: HTTP 409 Conflict

# 删除 markdown 文件（不影响知识库）
curl -X DELETE http://localhost:8555/api/wrag/markdown/<file_id>

# 搜索（通过 SAG 代理）
curl -X POST http://localhost:8555/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "sourceIds": ["<project-id>"], "strategy": "multi"}'
```

### 7.2 启动/关闭测试

```bash
# 启动
./start.sh
# 期望: 所有服务启动成功，无报错

# 关闭（Ctrl+C）
# 期望: 立即退出，无残留进程

# 验证无残留
ps aux | grep -E "tsx|uvicorn|vite" | grep -v grep
# 期望: 无输出

# 子进程管理测试
# 1. 先手动启动 SAG
cd SAG && npm run dev:api &
# 2. 再启动 WRAG
# 期望: WRAG 检测到 SAG 已在运行，跳过启动
# 3. 关闭 WRAG
# 期望: SAG 继续运行（因为 WRAG 没启动它）
```

### 7.3 前端测试

```bash
# 启动前端
cd frontend && npm run dev

# 打开 http://localhost:5174
# 创建项目 → 成功
# 上传各种格式文件 → 全部入库
# 查看 Markdown Files 标签页 → 能看到所有转换记录
# 预览/编辑/下载/删除 md 文件 → 功能正常
# 重新导入同一项目 → 409 提示
# 取消上传 → 立即取消，不卡死
```

---

## 8. 已知陷阱与规避

### 陷阱 1：SAG 只接受 .md 和 .txt 扩展名

**问题**：SAG 的 `/api/documents/upload` 接口通过 `file_name` 扩展名判断文件类型。如果传 `report.pdf`，SAG 会返回 400。

**规避**：**所有**调用 `sag.upload_document()` 的地方，`file_name` 必须传 `f"{doc_title}.md"`。共涉及 3 处：
- 普通上传（`/api/wrag/upload`）
- SSE 流式上传（`/api/wrag/upload/stream`）
- Markdown 文件重新导入（`/api/wrag/markdown/{id}/import`）

### 陷阱 2：健康检查不能用同步阻塞

**问题**：`time.sleep()` 会阻塞 FastAPI 的事件循环，导致：
- Ctrl+C 无法响应（shutdown 信号被阻塞）
- 其他协程无法执行

**规避**：
- 用 `asyncio.sleep()` 替代 `time.sleep()`
- 用 `asyncio.to_thread(urllib.request.urlopen, url, None, timeout)` 替代 `urllib.request.urlopen(url)`
- 引入 `_shutdown_event: asyncio.Event`，每次轮询前检查

### 陷阱 3：`urlopen()` 参数顺序

**问题**：`urllib.request.urlopen(url, data, timeout)` 的第二个参数是 `data`，第三个才是 `timeout`。
❌ `asyncio.to_thread(urlopen, url, 3.0)` — 3.0 被当成了 data
✅ `asyncio.to_thread(urlopen, url, None, 3.0)` — 显式传 data=None

### 陷阱 4：不要覆盖 SAG 的环境变量

**问题**：`_start_sag()` 中强制设 `HTTP_HOST=127.0.0.1` 会覆盖 SAG `.env` 中用户配置的 `HTTP_HOST=0.0.0.0`。

**规避**：不注入任何环境变量。SAG 自己通过 dotenv 读取 `.env`，WRAG 不需要知道 SAG 的数据库配置。

### 陷阱 5：重复导入不检查导致重复文档

**问题**：`/api/wrag/markdown/{id}/import` 直接调用 SAG 入库，如果同一文件导入同一项目两次，SAG 会创建两个重复文档。

**规避**：在调用 SAG 之前，先检查 `md_store.get_imports(file_id)` 中是否有相同 `project_id` 的记录。有则返回 409。

### 陷阱 6：上传弹窗必须支持取消

**问题**：上传卡住时，点击取消按钮无反应，用户只能刷新页面。

**规避**：
- 使用 `AbortController` 贯穿 fetch 调用链
- 上传开始时创建 `const controller = new AbortController()`，取消时 `controller.abort()`
- fetch 传入 `signal: controller.signal`
- SSE 回调中检查 `controller.signal.aborted`，避免取消后残留状态更新
- 取消按钮的 `disabled={false}` 始终可用
- 上传中 `maskClosable={false}` + `keyboard={false}` 防止误触

### 陷阱 7：前端 `onCancel` 不能直接调用 `onClose`

**问题**：`Modal` 的 `onCancel` 如果直接调 `onClose`，正在执行的 `async handleUpload` 不会自动停止。

**规避**：`handleCancel` 先 abort 请求，再调 `onClose`。

### 陷阱 8：SAG/.env 中的 RERANK_BASE_URL

**问题**：SAG 的 Zod 校验规则是 `z.string().url().optional()`。如果 `.env` 中有 `RERANK_BASE_URL=`（值为空字符串），Zod 会报 "Invalid url" 错误，导致 `npm run db:setup` 崩溃。

**规避**：在 `.env.example` 中把 `RERANK_BASE_URL=` 整行注释掉（`# RERANK_BASE_URL=`），这样 `.env` 中该 key 不存在，Zod 的 `.optional()` 正确生效。`INGEST_CONCURRENCY` 同理。

### 陷阱 9：`start.sh` 必须用 `set -eo pipefail`

**问题**：`set -e` 不够，`npm run db:setup | sed 's/^/  /'` 中如果 `db:setup` 失败，`set -e` 不会捕获管道中的错误。

**规避**：使用 `set -eo pipefail`，并检查 `${PIPESTATUS[0]}`。

### 陷阱 10：`.env` 和 `.env.example` 不同步

**问题**：修改 `.env.example` 中的端口后，用户的 `.env` 文件不会自动更新（smart sync 只追加新 key，不覆盖已有值）。

**规避**：修改端口等配置时，要同时更新 `.env` 和 `.env.example`。

### 陷阱 11：路由注册顺序

**问题**：`@router.api_route("/api/{path:path}")` 是 catch-all 路由，如果注册在 WRAG 自有路由之前，会劫持所有请求。

**规避**：WRAG 自有路由先注册，catch-all 代理路由**必须最后注册**。

### 陷阱 12：前端 `readSse` 的缓冲区处理

**问题**：SSE 数据可能跨多个 chunk 到达，直接按行分割会丢失数据。

**规避**：维护一个 `buf` 缓冲区，每次收到数据后追加到 `buf`，按 `\n\n` 分割，处理完整的 message，未完成的保留在 `buf` 中等待下个 chunk。

---

## 附：SAG/.env 完整配置清单

| 变量 | 默认值 | 说明 | 陷阱 |
|------|--------|------|------|
| `NODE_ENV` | `development` | 运行环境 | |
| `HTTP_HOST` | `0.0.0.0` | SAG 绑定地址 | 不要被 WRAG 覆盖 |
| `HTTP_PORT` | `4173` | SAG 端口 | |
| `DATABASE_URL` | - | PostgreSQL 连接串 | 只属于 SAG，WRAG 不涉及 |
| `EMBEDDING_API_KEY` | - | Embedding 服务密钥 | 留空则用本地 SHA-256 回退 |
| `LLM_API_KEY` | - | LLM 服务密钥 | 留空则用本地回退 |
| `RERANK_BASE_URL` | 回退到 `LLM_BASE_URL` | Rerank API 地址 | **必须注释掉**，不能留空 |
| `INGEST_CONCURRENCY` | `5` | 入库并发数 | **建议注释掉**，用默认值 |

---

> **总结**：本文档将开发过程中遇到的所有 Bug 的修复方案直接内化到了设计决策和代码示例中。按照本文档开发，可以避免：
> 1. 上传卡死（文件名扩展名 + 取消按钮）
> 2. Ctrl+C 停不下来（同步阻塞）
> 3. 重复导入（缺少预检查）
> 4. Zod 校验崩溃（空环境变量）
> 5. 路由劫持（注册顺序错误）
> 6. 环境变量覆盖（SAG 配置被覆盖）