# AI 原生全栈应用开发平台

用自然语言对话，自动生成完整的 Next.js 全栈应用。

## 功能特性

- **💬 自然语言代码生成** — 描述你想要的应用，AI 自动生成页面、API 路由、数据库 Schema 等完整代码
- **🤖 Agent 工作流编排** — 多步骤 AI 智能体，可读写文件、搜索文档、管理项目，逐步完成复杂任务
- **🔍 RAG 语义检索** — 基于 Next.js 文档和已生成代码的增强生成，让 AI 生成的代码更规范
- **🧠 多模型支持** — DeepSeek Flash / Pro（云端）、Ollama（本地）、OpenAI（云端），自动降级切换
- **📁 项目管理** — 创建、切换、管理多个项目，聊天记录持久化保存在数据库中
- **📦 代码导出** — 支持单个文件下载和复制，语法高亮的代码查看器

## 技术栈

| 层级     | 技术                                       |
| -------- | ------------------------------------------ |
| 框架     | Next.js 16（App Router + Turbopack）       |
| 前端     | React 19、Tailwind CSS v4                  |
| 语言     | TypeScript 5                               |
| AI       | Vercel AI SDK v6、DeepSeek、Ollama、OpenAI |
| 数据库   | Neon Postgres + Drizzle ORM                |
| 向量检索 | Pinecone 云端 / 本地内存向量库（自动降级） |
| 部署     | Vercel（全球边缘节点）                     |

## 快速开始

### 环境要求

- Node.js 20.9+
- pnpm（推荐）

### 安装配置

1. 克隆并安装依赖：

```bash
git clone <仓库地址>
cd my-ai-platform
pnpm install
```

2. 复制环境变量模板：

```bash
cp .env.example .env.local
```

3. 编辑 `.env.local` 填入配置：

```
DATABASE_URL=postgresql://用户名:密码@主机/数据库
DEEPSEEK_API_KEY=sk-你的密钥
OPENAI_API_KEY=sk-你的密钥      # 可选，用于嵌入向量
OLLAMA_BASE_URL=http://localhost:11434/v1  # 可选，用于本地模型
PINECONE_API_KEY=你的密钥       # 可选，配了走云端，没配走本地内存库
PINECONE_INDEX=my-ai-platform
```

4. 初始化数据库表：

```bash
npx drizzle-kit push
```

5. 启动开发服务器：

```bash
pnpm dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

### 播种知识库（RAG）

```bash
curl -X POST http://localhost:3000/api/admin/seed \
  -H "Content-Type: application/json" \
  -d '{"secret":"dev-secret"}'
```

## 项目结构

```
├── app/
│   ├── api/
│   │   ├── chat/route.ts              # 聊天 API（代码生成 + RAG 增强）
│   │   ├── workflow/route.ts          # Agent 工作流 API
│   │   ├── models/route.ts            # 可用模型列表
│   │   ├── health/route.ts            # 健康检查
│   │   ├── download/route.ts          # ZIP 下载
│   │   ├── admin/seed/route.ts        # 知识库播种
│   │   └── projects/[id]/download/    # 项目代码下载
│   ├── dashboard/page.tsx             # 仪表盘（重定向到首页）
│   ├── projects/[projectId]/page.tsx  # 项目聊天页
│   ├── page.tsx                       # 首页（仪表盘）
│   ├── layout.tsx                     # 根布局（含侧边栏）
│   ├── actions.ts                     # Server Actions（增删改查）
│   ├── loading.tsx                    # 加载骨架屏
│   ├── error.tsx                      # 错误边界
│   └── not-found.tsx                  # 404 页面
├── components/
│   ├── ProjectSidebar.tsx             # 项目列表侧边栏
│   ├── ModelSelector.tsx              # AI 模型选择器
│   ├── ChatInterface.tsx              # 可复用聊天组件
│   ├── CodeViewer.tsx                 # 代码查看器（标签页 + 语法高亮）
│   └── WorkflowViewer.tsx             # Agent 步骤可视化
├── lib/
│   ├── env.ts                         # 类型安全的环境变量
│   ├── db.ts                          # 数据库客户端
│   ├── schema.ts                      # Drizzle ORM 表结构
│   ├── models.ts                      # 多模型服务商注册表
│   ├── gateway.ts                     # 模型路由与自动降级
│   ├── stream.ts                      # 流式传输辅助
│   ├── code-gen.ts                    # 代码生成工具（解析、持久化）
│   ├── parse-code.ts                  # AI 回复解析器
│   ├── embeddings.ts                  # 嵌入向量管道
│   ├── pinecone.ts                    # 向量库客户端（Pinecone / 内存）
│   ├── vector-store.ts                # 本地内存向量库
│   ├── logger.ts                      # 结构化日志
│   ├── telemetry.ts                   # AI 调用指标
│   ├── rag/                           # RAG 管道
│   │   ├── chunker.ts                 # 文档分块
│   │   ├── indexer.ts                 # 嵌入 + 索引
│   │   ├── retriever.ts               # 语义检索
│   │   └── seed.ts                    # 知识库播种
│   ├── tools/                         # Agent 工具定义
│   │   ├── file-tools.ts              # 文件读写工具
│   │   ├── rag-tools.ts               # 知识库搜索工具
│   │   ├── web-tools.ts               # 网络搜索工具
│   │   └── index.ts                   # 工具注册表
│   ├── agent/                         # Agent 编排
│   │   ├── orchestrator.ts            # ToolLoopAgent 配置
│   │   └── templates.ts               # 预构建工作流模板
│   └── mcp/                           # MCP 协议（预留）
│       ├── server.ts                  # MCP 服务端
│       └── client.ts                  # MCP 客户端
├── generated/                         # 生成的代码文件（.gitignored）
├── proxy.ts                           # 速率限制 + 安全头
├── vercel.json                        # Vercel 部署配置
└── next.config.ts                     # Next.js 配置
```

## 部署

项目已配置 Vercel 一键部署。在 Vercel 控制台设置环境变量，连接 GitHub 仓库即可自动部署。

## 性能目标

- 代码生成：完整全栈应用 2 分钟以内
- RAG 检索 Top-3 准确率：> 85%
- Agent 工具：5+ 内置技能
- AI 生成代码首次编译通过率：> 80%
