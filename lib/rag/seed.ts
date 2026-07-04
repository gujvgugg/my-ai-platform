/**
 * 知识库播种器。
 * 将 Next.js 文档片段和常见模式索引到 Pinecone，
 * 使 RAG 管道能够为代码生成检索相关上下文。
 */

import { indexDocuments } from './indexer';
import { getVectorBackend } from '../pinecone';

/**
 * 播种 Next.js 和 React 最佳实践知识库。
 */
export async function seedKnowledgeBase(): Promise<{ indexed: number; backend: string }> {
  console.log(`正在播种知识库 (后端: ${getVectorBackend()})...`);

  const docs = [
    {
      content: `
# Next.js App Router 基础
App Router 是推荐的构建方式。页面默认是服务端组件。
创建页面: 在 app 目录下添加 page.tsx 文件。布局包裹页面并在导航间保持。

核心约定:
- app/layout.tsx — 根布局（必需）
- app/page.tsx — 首页
- app/loading.tsx — 加载 UI（Suspense 边界）
- app/error.tsx — 错误边界
- app/not-found.tsx — 404 页面
- app/api/*/route.ts — API 路由处理
`.trim(),
      metadata: { topic: 'nextjs', subtopic: 'app-router' },
    },
    {
      content: `
# 服务端组件 vs 客户端组件
服务端组件（默认）: 可直接访问数据库、密钥，减少发往客户端的 JS。不能使用 hooks、state 或浏览器 API。
客户端组件（'use client' 指令）: 可使用 state、effects、事件处理器、浏览器 API。

模式: 页面结构（布局、元数据）用服务端组件，交互部分（按钮、表单）抽离为客户端组件。
`.trim(),
      metadata: { topic: 'nextjs', subtopic: 'server-client-components' },
    },
    {
      content: `
# Server Actions（服务端操作）
Server Actions 是在服务端运行的异步函数。在文件顶部或异步函数内添加 'use server'。

用法:
- 传递给 <form action={serverAction}>
- 从客户端组件中调用（从 'use server' 文件导入）
- 使用 formData.get() 提取字段
- 始终在 Server Action 中验证身份认证

示例:
\`\`\`ts
'use server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const title = formData.get('title')
  // ... 保存到数据库
  revalidatePath('/posts')
}
\`\`\`
`.trim(),
      metadata: { topic: 'nextjs', subtopic: 'server-actions' },
    },
    {
      content: `
# Route Handlers（路由处理器）
使用 route.ts 文件定义自定义 API 端点。为 HTTP 方法导出异步函数: GET、POST、PUT、PATCH、DELETE。

\`\`\`ts
export async function GET(request: Request) {
  return Response.json({ data: 'hello' })
}

export async function POST(request: Request) {
  const body = await request.json()
  return Response.json({ success: true })
}
\`\`\`

路由处理器默认不缓存。使用 dynamic = 'force-static' 缓存 GET 响应。
`.trim(),
      metadata: { topic: 'nextjs', subtopic: 'route-handlers' },
    },
    {
      content: `
# Drizzle ORM 数据库集成
Drizzle ORM 提供 TypeScript 类型安全的 SQL 查询。使用 pgTable 或 sqliteTable 定义 schema。

Schema 示例:
\`\`\`ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
})
\`\`\`

查询: db.query.users.findMany() 或 db.select().from(users).where(...)
`.trim(),
      metadata: { topic: 'database', subtopic: 'drizzle-orm' },
    },
    {
      content: `
# Tailwind CSS v4 与 Next.js 集成
TailwindCSS v4 在 globals.css 中使用 @import "tailwindcss" 替代 @tailwind 指令。

在 CSS 中定义主题变量:
\`\`\`css
@import "tailwindcss";

@theme inline {
  --color-primary: #3b82f6;
  --font-sans: var(--font-geist-sans);
}
\`\`\`

Turbopack 是 Next.js 16 的默认打包工具。
`.trim(),
      metadata: { topic: 'frontend', subtopic: 'tailwind' },
    },
    {
      content: `
# React 19 模式
React 19 将服务端组件升级为稳定特性，引入了 useActionState 处理表单、useOptimistic 乐观更新、use() 在渲染中读取 Promise。

使用 useActionState 处理表单:
\`\`\`tsx
const [state, action, pending] = useActionState(serverAction, initialState)
\`\`\`
`.trim(),
      metadata: { topic: 'react', subtopic: 'react-19' },
    },
    {
      content: `
# AI SDK v6 集成
使用 Vercel AI SDK v6 实现流式聊天、工具调用和 Agent 编排。

聊天设置:
\`\`\`ts
// API 路由
import { streamText } from 'ai'
export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = await streamText({ model, messages })
  return result.toTextStreamResponse()
}

// 客户端
import { useChat } from '@ai-sdk/react'
const { messages, sendMessage } = useChat({
  transport: new TextStreamChatTransport({ api: '/api/chat' })
})
\`\`\`
`.trim(),
      metadata: { topic: 'ai', subtopic: 'ai-sdk' },
    },
  ];

  const count = await indexDocuments(docs);
  console.log(`已播种 ${count} 个知识库块 (${getVectorBackend()})`);
  return { indexed: count, backend: getVectorBackend() };
}
