/**
 * 应用生成引擎 —— 将自然语言描述转换为完整的 Next.js 应用代码。
 *
 * 管道: 需求分析 → 并行[Schema + Pages] → Server Actions → 配置文件
 * 目标: 2 分钟内生成可预览的完整应用。
 */

import { generateText } from 'ai';
import { getModel } from './models';
import type { CodeFile } from './code-gen';

// ============================================================
// 类型
// ============================================================

export interface AppSpec {
  name: string;
  description: string;
  features: string[];
  dataModel: { name: string; fields: { name: string; type: string; required: boolean }[] }[];
  pages: { path: string; title: string; description: string }[];
}

interface GenerateOptions {
  modelId?: string;
  signal?: AbortSignal;
}

// ============================================================
// 默认值
// ============================================================

const GEN_MODEL = 'deepseek-pro';
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 30_000;

// ============================================================
// Step 1: 需求分析
// ============================================================

const ANALYZE_SYSTEM_PROMPT = `你是一个需求分析专家。从用户的自然语言描述中提取结构化信息。

输出必须是严格的 JSON 对象（不要 markdown 包裹），格式如下:
{
  "name": "应用英文短名（kebab-case）",
  "description": "应用中文描述",
  "features": ["功能1", "功能2"],
  "dataModel": [
    {
      "name": "表名（英文复数）",
      "fields": [
        { "name": "字段名", "type": "string|number|boolean|text|timestamp", "required": true/false }
      ]
    }
  ],
  "pages": [
    { "path": "app/page.tsx", "title": "页面标题", "description": "页面功能描述" }
  ]
}

规则:
- features 列出所有用户要求的功能
- dataModel 每个表至少包含 id (serial, primary key) 和 created_at (timestamp) 字段
- 表名和字段名使用英文，类型使用上述枚举值
- pages 至少包含一个 app/page.tsx 主页`;

async function analyzeRequirements(prompt: string, opts?: GenerateOptions): Promise<AppSpec> {
  const result = await generateText({
    model: getModel(opts?.modelId || GEN_MODEL),
    system: ANALYZE_SYSTEM_PROMPT,
    prompt,
    temperature: 0.1,
    maxOutputTokens: 1024,
    abortSignal: opts?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = result.text.trim();
  // 尝试提取 JSON（可能被 markdown 包裹）
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // 回退：构造默认 spec
    return buildFallbackSpec(prompt);
  }
  try {
    const spec = JSON.parse(jsonMatch[0]) as AppSpec;
    return { ...buildFallbackSpec(prompt), ...spec };
  } catch {
    return buildFallbackSpec(prompt);
  }
}

/** 当 LLM 输出无法解析时，根据 prompt 构造回退 spec */
function buildFallbackSpec(prompt: string): AppSpec {
  const name = prompt.slice(0, 20).replace(/[^a-zA-Z一-龥]/g, '-').toLowerCase() || 'my-app';
  return {
    name: name.replace(/[一-龥]/g, 'app'),
    description: prompt.slice(0, 100),
    features: ['从描述中提取的功能'],
    dataModel: [
      {
        name: 'items',
        fields: [
          { name: 'id', type: 'number', required: true },
          { name: 'title', type: 'string', required: true },
          { name: 'created_at', type: 'timestamp', required: true },
        ],
      },
    ],
    pages: [
      { path: 'app/page.tsx', title: '主页', description: '应用主页' },
    ],
  };
}

// ============================================================
// Step 2a: 生成数据库 Schema
// ============================================================

const SCHEMA_SYSTEM_PROMPT = `你是 Drizzle ORM 专家。根据数据模型定义生成 TypeScript schema 代码。

规则:
- 使用 drizzle-orm/pg-core 的 pgTable, serial, text, integer, boolean, timestamp
- 表名为英文复数形式
- 每个表必须包含 id: serial('id').primaryKey()
- 时间字段使用 timestamp('name').defaultNow()
- 导出 schema 对象聚合所有表
- 只输出 TypeScript 代码，不要解释、不要 markdown

输出格式（纯代码）:
import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  completed: integer('completed').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const schema = { items };`;

async function generateDbSchema(spec: AppSpec, opts?: GenerateOptions): Promise<CodeFile> {
  const modelDesc = spec.dataModel
    .map((m) => {
      const fields = m.fields
        .map((f) => `    ${f.name}: ${mapFieldType(f.type)}('${f.name}')${f.required ? '.notNull()' : ''}`)
        .join(',\n');
      return `表: ${m.name}\n字段:\n${fields}`;
    })
    .join('\n\n');

  const result = await generateText({
    model: getModel(opts?.modelId || GEN_MODEL),
    system: SCHEMA_SYSTEM_PROMPT,
    prompt: `生成以下数据模型的 Drizzle schema 代码：\n\n${modelDesc}`,
    temperature: TEMPERATURE,
    maxOutputTokens: 1024,
    abortSignal: opts?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });

  const code = extractCodeBlock(result.text);
  return { filePath: 'lib/schema.ts', content: code };
}

function mapFieldType(type: string): string {
  switch (type) {
    case 'number': return 'integer';
    case 'boolean': return 'integer'; // SQLite 兼容
    case 'timestamp': return 'timestamp';
    case 'text':
    case 'string':
    default: return 'text';
  }
}

// ============================================================
// Step 2b: 生成页面组件（与 schema 并行）
// ============================================================

const PAGES_SYSTEM_PROMPT = `你是 React + Next.js 16 + Tailwind CSS v4 专家。生成高质量的前端页面组件。

规则:
- 使用 Next.js 16 App Router 约定
- 客户端组件以 'use client' 开头
- 使用 React 19 hooks (useState, useEffect, useCallback, useOptimistic)
- 使用 Tailwind CSS v4 类名进行样式设计
- 设计现代、专业的 UI（间距合理、配色协调、响应式）
- Server Actions 从 @/app/actions 导入，格式: import { actionName } from '@/app/actions'
- 类型导入: import type { Item } from '@/lib/schema'
- 处理 loading 和 empty 状态
- 使用语义化表单，支持键盘操作
- 每个文件只输出 TypeScript/JSX 代码，不要解释

输出格式（纯代码，不要 markdown 包裹）:
'use client';
import { useState } from 'react';
// ... 完整组件代码`;

async function generatePages(spec: AppSpec, opts?: GenerateOptions): Promise<CodeFile[]> {
  // 并行生成每个页面
  const pageFiles = await Promise.all(
    spec.pages.map(async (page) => {
      const result = await generateText({
        model: getModel(opts?.modelId || GEN_MODEL),
        system: PAGES_SYSTEM_PROMPT,
        prompt: buildPagePrompt(spec, page),
        temperature: TEMPERATURE,
        maxOutputTokens: 2048,
        abortSignal: opts?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      });
      const code = extractCodeBlock(result.text);
      return { filePath: page.path, content: code };
    })
  );

  return pageFiles;
}

function buildPagePrompt(spec: AppSpec, page: PageSpec): string {
  const modelInfo = spec.dataModel
    .map((m) => `表 ${m.name}: ${m.fields.map((f) => f.name).join(', ')}`)
    .join('; ');

  return `为「${spec.name}」应用生成页面组件。

应用描述: ${spec.description}
功能列表: ${spec.features.join(', ')}

数据模型: ${modelInfo}

页面: ${page.title} — ${page.description}
文件路径: ${page.path}
${page.path === 'app/page.tsx' ? '这是主页面，需要作为应用入口展示所有核心功能。' : ''}
${page.path.includes('layout') ? '这是布局文件，需要包含导航和子组件渲染。' : ''}

生成完整的 React 组件代码（包含 'use client' 指令和所有必要的 import）。`;
}

// ============================================================
// Step 3: 生成 Server Actions
// ============================================================

const ACTIONS_SYSTEM_PROMPT = `你是 Next.js Server Actions 专家。生成完整的 CRUD Server Actions。

规则:
- 使用 'use server' 指令
- 使用 drizzle-orm 进行数据库操作
- 从 @/lib/db 导入 db
- 从 @/lib/schema 导入表定义
- 使用 revalidatePath 刷新页面缓存
- 处理错误并返回有意义的消息
- 输入验证（非空检查）
- 每个操作独立导出
- 只输出 TypeScript 代码，不要解释

输出格式（纯代码）:
'use server';
import { db } from '@/lib/db';
import { items } from '@/lib/schema';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

export async function addItem(formData: FormData) {
  const title = formData.get('title') as string;
  if (!title?.trim()) return { error: '标题不能为空' };
  await db.insert(items).values({ title: title.trim() });
  revalidatePath('/');
}

// ... 其他 CRUD 操作`;

async function generateServerActions(
  spec: AppSpec,
  schemaCode: string,
  opts?: GenerateOptions
): Promise<CodeFile> {
  const modelNames = spec.dataModel.map((m) => m.name);
  const featureList = spec.features.join('\n- ');

  const result = await generateText({
    model: getModel(opts?.modelId || GEN_MODEL),
    system: ACTIONS_SYSTEM_PROMPT,
    prompt: `根据以下信息生成 Server Actions：

应用: ${spec.name}
功能需求:
- ${featureList}

数据表: ${modelNames.join(', ')}

Schema 参考:
\`\`\`typescript
${schemaCode}
\`\`\`

为每个功能需求生成对应的 Server Action 函数。`,
    temperature: TEMPERATURE,
    maxOutputTokens: 2048,
    abortSignal: opts?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });

  const code = extractCodeBlock(result.text);
  return { filePath: 'app/actions.ts', content: code };
}

// ============================================================
// Step 4: 模板化配置文件（无需 LLM）
// ============================================================

function generateConfigFiles(spec: AppSpec): CodeFile[] {
  const safeName = spec.name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() || 'my-app';

  return [
    {
      filePath: 'package.json',
      content: JSON.stringify(
        {
          name: safeName,
          version: '1.0.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
          dependencies: {
            next: '^16.0.0',
            react: '^19.0.0',
            'react-dom': '^19.0.0',
            'drizzle-orm': '^0.45.0',
            '@neondatabase/serverless': '^1.0.0',
          },
          devDependencies: {
            typescript: '^5',
            '@types/node': '^20',
            '@types/react': '^19',
            '@types/react-dom': '^19',
            'drizzle-kit': '^0.31.0',
          },
        },
        null,
        2
      ),
    },
    {
      filePath: 'next.config.ts',
      content: `import type { NextConfig } from 'next';\n\nconst nextConfig: NextConfig = {\n  output: 'standalone',\n  experimental: {\n    serverActions: { bodySizeLimit: '5mb' },\n  },\n};\n\nexport default nextConfig;\n`,
    },
    {
      filePath: 'tsconfig.json',
      content: JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2
      ),
    },
  ];
}

// ============================================================
// Step 5: 生成 layout 文件
// ============================================================

function generateLayout(spec: AppSpec): CodeFile {
  return {
    filePath: 'app/layout.tsx',
    content: `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '${spec.name}',
  description: '${spec.description}',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 antialiased">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-800">${spec.name}</h1>
            <nav className="flex gap-4 text-sm text-gray-600">
              <a href="/" className="hover:text-blue-600 transition">首页</a>
            </nav>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}`,
  };
}

// ============================================================
// 主编排器
// ============================================================

/**
 * 从自然语言描述生成完整的 Next.js 应用代码。
 * 使用并行 LLM 调用在 30-60 秒内完成。
 */
export async function generateApp(
  prompt: string,
  opts?: GenerateOptions
): Promise<CodeFile[]> {
  const signal = opts?.signal ?? AbortSignal.timeout(120_000);
  const model = opts?.modelId || GEN_MODEL;

  // Step 1: 分析需求 (~5s)
  console.log('[AppGen] 阶段 1/4: 分析需求...');
  const spec = await analyzeRequirements(prompt, { modelId: model, signal });
  console.log(`[AppGen] 应用: ${spec.name}, 功能: ${spec.features.length}, 表: ${spec.dataModel.length}, 页面: ${spec.pages.length}`);

  // Step 2: 并行生成 Schema + Pages (~15s)
  console.log('[AppGen] 阶段 2/4: 并行生成 Schema 和页面...');
  const [schemaFile, pageFiles] = await Promise.all([
    generateDbSchema(spec, { modelId: model, signal }),
    generatePages(spec, { modelId: model, signal }),
  ]);

  // Step 3: 生成 Server Actions（依赖 Schema）(~10s)
  console.log('[AppGen] 阶段 3/4: 生成 Server Actions...');
  const actionsFile = await generateServerActions(spec, schemaFile.content, {
    modelId: model,
    signal,
  });

  // Step 4: 组装配置文件 + 全局样式 (~0s, 模板化)
  console.log('[AppGen] 阶段 4/4: 组装项目...');
  const configFiles = generateConfigFiles(spec);
  const layoutFile = generateLayout(spec);
  const cssFile: CodeFile = {
    filePath: 'app/globals.css',
    content: `@import "tailwindcss";\n\n@theme inline {\n  --font-sans: system-ui, -apple-system, sans-serif;\n}\n`,
  };
  const dbFile: CodeFile = {
    filePath: 'lib/db.ts',
    content: `import { neon } from '@neondatabase/serverless';\nimport { drizzle } from 'drizzle-orm/neon-http';\nimport * as schema from './schema';\n\nconst sql = neon(process.env.DATABASE_URL!);\nexport const db = drizzle(sql, { schema: schema.schema });\n`,
  };
  const envFile: CodeFile = {
    filePath: '.env.example',
    content: `DATABASE_URL=postgresql://user:password@host/dbname\n`,
  };
  const gitignoreFile: CodeFile = {
    filePath: '.gitignore',
    content: `node_modules\n.next\n.env\n.env.local\n*.tsbuildinfo\n`,
  };

  const allFiles: CodeFile[] = [
    ...configFiles,
    layoutFile,
    cssFile,
    schemaFile,
    dbFile,
    actionsFile,
    ...pageFiles,
    envFile,
    gitignoreFile,
  ];

  console.log(`[AppGen] 完成! 共生成 ${allFiles.length} 个文件`);
  return allFiles;
}

// ============================================================
// 用于 Chat API 的增强系统提示词
// ============================================================

/**
 * 构建用于 Chat API 的增强代码生成系统提示词。
 * 适用于复杂应用生成（非简单组件）。
 */
export function buildCodeGenSystemPrompt(userPrompt: string): string {
  return `你是 Next.js 16 全栈应用代码生成器。根据用户需求生成完整的项目代码。

## 输出格式
只输出 JSON 数组，每个元素包含 filePath 和 content:
[{ "filePath": "app/page.tsx", "content": "..." }, { "filePath": "lib/schema.ts", "content": "..." }]

## 强制生成文件清单
1. package.json — 项目配置
2. next.config.ts — Next.js 配置
3. tsconfig.json — TypeScript 配置
4. app/layout.tsx — 根布局（含导航栏）
5. app/globals.css — 全局样式（@import "tailwindcss"）
6. app/page.tsx — 主页（'use client', 完整功能页面）
7. app/actions.ts — Server Actions（'use server', CRUD 操作）
8. lib/schema.ts — Drizzle ORM Schema
9. lib/db.ts — 数据库连接
10. .gitignore — Git 忽略规则

## 代码规则
- 所有组件使用 TypeScript
- 交互页面使用 'use client' 指令
- 使用 Tailwind CSS v4 类名
- 设计现代专业的 UI（间距合理、配色协调、响应式、圆角和阴影）
- Server Actions 使用 'use server' 指令
- 数据库使用 Drizzle ORM + Neon PostgreSQL
- 表单使用 FormData + Server Actions 模式
- 处理 loading、empty、error 状态
- 使用 React 19 hooks

## 用户需求
${userPrompt}

## 输出要求
- 字符串内换行用 \\n
- 双引号用 \\" 转义
- 不要在 JSON 外添加任何解释文字
- content 字段包含完整的文件内容`;
}

// ============================================================
// 内部辅助函数
// ============================================================

/** 从 LLM 输出中提取代码块 */
function extractCodeBlock(text: string): string {
  // 提取 markdown 代码块
  const fenceMatch = text.match(/```(?:tsx?|typescript|jsx?|javascript)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // 去掉可能的首尾说明文字，返回主体
  return text.trim();
}

// 从 AppSpec 中重新导出 PageSpec 类型供内部使用
type PageSpec = AppSpec['pages'][number];
