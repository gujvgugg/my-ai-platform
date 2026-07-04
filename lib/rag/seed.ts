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
    {
      content: `
# RAG 前端界面生成规范

## 设计原则
核心目标: 降低认知负荷，将检索-生成流程可视化；即时反馈，任何操作300ms内给出状态反馈；可调试性，提供透明化的检索中间结果。
设计范式: 双栏布局为主（左侧知识库管理，右侧对话/检索测试区）；卡片化信息呈现；状态用颜色+图标+文字三重编码。

## 颜色体系
Primary: #2563EB（按钮、链接、高亮）
Secondary: #64748B（次要文本、图标）
Success: #10B981（成功、就绪）
Warning: #F59E0B（警告、索引中）
Error: #EF4444（错误、异常）
Background: #F8FAFC（页面背景）
Surface: #FFFFFF（卡片、弹窗背景）
Surface-Container: #F1F5F9（用户消息背景）
Text-Primary: #0F172A（主文本）
Text-Secondary: #475569（次要文本）
Border: #E2E8F0（边框）

## 字体规范
字体栈: Inter, PingFang SC, Microsoft YaHei, sans-serif
页面标题: 24px font-weight 600
卡片标题: 16px font-weight 500
正文: 14px font-weight 400 line-height 1.6
辅助文本: 12px
代码/数据: JetBrains Mono monospace 13px

## 间距规范
基础单位 4px，页面边距 24px，卡片内边距 16px 或 24px，卡片间距 16px，表单字段间距 16px，按钮内边距 横向16px 纵向8px

## 圆角规范
卡片/弹窗: 12px
按钮/输入框: 8px
标签/徽章: 9999px（全圆角）
消息气泡: 16px

## 消息气泡规范
用户消息: 背景色 #F1F5F9，圆角16px（左下直角），最大宽度70%
AI消息: 背景色 #FFFFFF，圆角16px（右下直角），最大宽度85%，含引用来源角标和反馈按钮

## 状态标签
未索引: 灰色
索引中: 蓝色带旋转图标
已就绪: 绿色
异常: 红色，悬停显示错误详情

## 响应式断点
Desktop: >= 1280px 完整双栏/多栏布局
Tablet: 768px-1279px 侧边栏折叠为图标
Mobile: <768px 单栏布局，侧边栏变为抽屉

## 交互规范
Hover效果: 卡片阴影加深，按钮背景加深5%
点击反馈: 按钮缩放0.98持续100ms
加载态: 列表使用骨架屏，按钮内嵌圆形进度条
生成中动画: AI消息底部显示"正在思考..."加跳动圆点
打字机效果: AI回复逐字显示20ms/字

## 上传区域规范
拖拽上传虚线边框区域，支持多文件，显示文件类型限制
上传列表显示文件名、大小、进度条、状态
批量操作勾选后顶部浮动工具栏
超过10MB文件自动分片上传

## 导航栏规范
高度56px
元素: Logo、知识库选择器下拉、全局搜索框、用户头像菜单
侧边栏宽度240px可折叠至64px
底部固定系统状态指示器

## 可访问性
键盘Tab聚焦所有交互元素，Esc关闭弹窗
图片必须alt文本，状态变化用aria-live通知
正文对比度 >= 4.5:1，焦点环2px solid primary + 2px offset
按钮最小点击区域44x44px

## 技术栈建议
框架: React 19 + TypeScript
UI组件: shadcn/ui + Tailwind CSS
状态管理: Zustand + React Query
图表: Recharts
实时通信: EventSource (SSE)
`.trim(),
      metadata: { topic: 'frontend', subtopic: 'rag-ui-spec' },
    },
  ];

  const count = await indexDocuments(docs);
  console.log(`已播种 ${count} 个知识库块 (${getVectorBackend()})`);
  return { indexed: count, backend: getVectorBackend() };
}
