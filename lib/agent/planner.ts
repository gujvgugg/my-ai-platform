/**
 * Agent 规划器 —— 将任意用户自然语言描述动态拆解为可执行步骤。
 *
 * 不依赖固定模板。用户说"博客系统"、"笔记小程序"、"企业OA"都能自适应拆解。
 * 使用标准 Plan → Execute → Verify Agent 架构。
 */

import { generateText } from 'ai';
import { getModel } from '../models';

// ============================================================
// 类型
// ============================================================

export interface PlanStep {
  /** 步骤编号（从 1 开始） */
  id: number;
  /** 步骤简短标题（中文，如"创建数据库 Schema"） */
  title: string;
  /** 步骤详细描述，指导 LLM 如何执行 */
  description: string;
  /** 此步骤涉及的文件路径列表（供前端预览） */
  expectedFiles: string[];
  /** 步骤类别 */
  category: 'planning' | 'schema' | 'api' | 'pages' | 'components' | 'config' | 'review' | 'other';
}

export interface Plan {
  /** 总任务概述 */
  summary: string;
  /** 技术栈建议 */
  techStack: string[];
  /** 执行步骤列表 */
  steps: PlanStep[];
}

// ============================================================
// 规划系统提示词
// ============================================================

const PLANNER_SYSTEM_PROMPT = `你是一个资深的软件架构师和项目规划专家。你的任务是将用户的自然语言需求拆解为可执行的具体开发步骤。

## 输出格式
你必须输出严格的 JSON 对象（不要 markdown 包裹），格式如下：

{
  "summary": "项目概述（一句话，中文）",
  "techStack": ["Next.js 16", "React 19", "Tailwind CSS 4", "Drizzle ORM", "Neon PostgreSQL"],
  "steps": [
    {
      "id": 1,
      "title": "步骤标题（简短，中文）",
      "description": "此步骤要做什么，包含哪些关键文件或逻辑",
      "expectedFiles": ["app/page.tsx", "lib/schema.ts"],
      "category": "pages"
    }
  ]
}

## 步骤类别（category）
- planning: 需求分析、架构设计、文件规划
- schema: 数据库表结构、ORM Schema、数据模型
- api: API 路由、Server Actions、后端逻辑
- pages: 页面组件、路由页面
- components: 可复用 UI 组件、业务组件
- config: 项目配置（package.json, tsconfig, 环境变量等）
- review: 代码审查、验证、测试
- other: 其他

## 拆解规则
1. 每个步骤应产生具体可交付的文件
2. 步骤粒度要合理：不要太细（一个文件一个步骤）也不要太粗（所有文件一个步骤）
3. 步骤数量根据需求复杂度自适应：简单需求 4-6 步，中等 7-10 步，复杂 10-15 步
4. 步骤顺序要符合软件工程最佳实践：先配置 → 再数据模型 → 再 API → 再页面组件 → 最后审查
5. 分析用户提到的每个功能，确保都被覆盖
6. expectedFiles 列出此步骤预期生成的关键文件路径
7. 无需询问用户，直接根据需求做出最佳技术选型

## 技术栈建议
默认推荐：Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4 + Drizzle ORM + Neon PostgreSQL
如果用户明确要求其他技术栈，优先尊重用户选择。
如果用户做的是小程序/移动端/OA系统等非 Web 应用，仍然用 Next.js Web 方案实现（可模拟类似体验）。

## 示例
用户说："搭建一个博客系统，需要文章列表页、详情页、管理后台，支持 Markdown 编辑器"

{
  "summary": "全栈博客系统：文章列表、详情、管理后台、Markdown 编辑器",
  "techStack": ["Next.js 16", "React 19", "Tailwind CSS 4", "Drizzle ORM", "Neon PostgreSQL"],
  "steps": [
    {"id":1,"title":"项目初始化","description":"创建 package.json、next.config.ts、tsconfig.json、.gitignore 等配置文件","expectedFiles":["package.json","next.config.ts","tsconfig.json"],"category":"config"},
    {"id":2,"title":"数据库 Schema","description":"设计博客文章表(posts)、标签表(tags)等数据模型，使用 Drizzle ORM","expectedFiles":["lib/schema.ts","lib/db.ts"],"category":"schema"},
    {"id":3,"title":"根布局与导航","description":"创建 app/layout.tsx 根布局和 globals.css 全局样式，含导航栏","expectedFiles":["app/layout.tsx","app/globals.css"],"category":"config"},
    {"id":4,"title":"博客文章 API","description":"创建 Server Actions 实现文章的 CRUD 操作：创建、读取、更新、删除","expectedFiles":["app/actions.ts"],"category":"api"},
    {"id":5,"title":"文章列表页","description":"创建首页 app/page.tsx，展示文章列表，支持分页和搜索","expectedFiles":["app/page.tsx"],"category":"pages"},
    {"id":6,"title":"文章详情页","description":"创建文章详情页，展示完整内容和 Markdown 渲染","expectedFiles":["app/posts/[id]/page.tsx"],"category":"pages"},
    {"id":7,"title":"管理后台","description":"创建管理后台页面，支持文章的增删改查操作","expectedFiles":["app/admin/page.tsx"],"category":"pages"},
    {"id":8,"title":"Markdown 编辑器组件","description":"创建 Markdown 编辑器组件，支持实时预览、语法高亮","expectedFiles":["components/MarkdownEditor.tsx"],"category":"components"},
    {"id":9,"title":"集成验证","description":"检查所有文件完整性，确保导入路径正确、组件衔接正常","expectedFiles":[],"category":"review"}
  ]
}`;

// ============================================================
// 主函数
// ============================================================

const PLAN_MODEL = 'deepseek-pro';
const PLAN_TIMEOUT_MS = 60_000; // 规划超时 1 分钟（慢模型也能完成）

/**
 * 根据用户的自然语言描述生成结构化执行计划。
 * @param userRequest - 用户的自然语言需求描述
 * @param modelId - 可选模型 ID，默认使用 deepseek-pro
 * @returns 结构化的执行计划
 */
export async function generatePlan(
  userRequest: string,
  modelId?: string
): Promise<Plan> {
  const result = await generateText({
    model: getModel(modelId || PLAN_MODEL),
    system: PLANNER_SYSTEM_PROMPT,
    prompt: `请为以下需求生成开发计划：\n\n${userRequest}`,
    temperature: 0.2,
    maxOutputTokens: 4096,
    abortSignal: AbortSignal.timeout(PLAN_TIMEOUT_MS),
  });

  const text = result.text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`规划器输出无法解析: ${text.slice(0, 200)}`);
  }

  try {
    const plan = JSON.parse(jsonMatch[0]) as Plan;
    validatePlan(plan);
    return plan;
  } catch (err) {
    if (err instanceof PlanValidationError) throw err;
    throw new Error(`规划器 JSON 解析失败: ${(err as Error).message}`);
  }
}

// ============================================================
// 验证
// ============================================================

class PlanValidationError extends Error {
  constructor(message: string) {
    super(`计划验证失败: ${message}`);
    this.name = 'PlanValidationError';
  }
}

function validatePlan(plan: Plan): void {
  if (!plan.summary || typeof plan.summary !== 'string') {
    throw new PlanValidationError('缺少 summary 字段');
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new PlanValidationError('steps 必须是非空数组');
  }
  if (!Array.isArray(plan.techStack) || plan.techStack.length === 0) {
    plan.techStack = ['Next.js 16', 'React 19', 'Tailwind CSS 4', 'Drizzle ORM'];
  }
  plan.steps.forEach((step, i) => {
    if (!step.id) step.id = i + 1;
    if (!step.title || typeof step.title !== 'string') {
      throw new PlanValidationError(`步骤 ${i + 1} 缺少 title`);
    }
    if (!step.description || typeof step.description !== 'string') {
      throw new PlanValidationError(`步骤 ${i + 1} 缺少 description`);
    }
    if (!Array.isArray(step.expectedFiles)) {
      step.expectedFiles = [];
    }
    const validCategories = ['planning', 'schema', 'api', 'pages', 'components', 'config', 'review', 'other'];
    if (!validCategories.includes(step.category)) {
      step.category = 'other';
    }
  });
}

// ============================================================
// 回退计划（当 LLM 规划失败时使用）
// ============================================================

/**
 * 构造简单的回退计划，确保系统不会因规划失败而中断。
 */
export function buildFallbackPlan(userRequest: string): Plan {
  const summary = userRequest.slice(0, 100);
  return {
    summary,
    techStack: ['Next.js 16', 'React 19', 'Tailwind CSS 4', 'Drizzle ORM'],
    steps: [
      {
        id: 1,
        title: '项目初始化',
        description: '创建必要的项目配置文件',
        expectedFiles: ['package.json', 'next.config.ts', 'tsconfig.json'],
        category: 'config',
      },
      {
        id: 2,
        title: '数据库设计',
        description: '根据需求设计数据库表结构和 Schema',
        expectedFiles: ['lib/schema.ts', 'lib/db.ts'],
        category: 'schema',
      },
      {
        id: 3,
        title: '应用布局',
        description: '创建根布局、全局样式和导航',
        expectedFiles: ['app/layout.tsx', 'app/globals.css'],
        category: 'config',
      },
      {
        id: 4,
        title: 'API 与 Server Actions',
        description: '实现后端逻辑和数据操作',
        expectedFiles: ['app/actions.ts'],
        category: 'api',
      },
      {
        id: 5,
        title: '页面组件',
        description: '根据需求生成所有页面组件',
        expectedFiles: ['app/page.tsx'],
        category: 'pages',
      },
      {
        id: 6,
        title: '功能组件',
        description: '生成可复用的业务组件',
        expectedFiles: [],
        category: 'components',
      },
      {
        id: 7,
        title: '验证与审查',
        description: '检查所有文件完整性',
        expectedFiles: [],
        category: 'review',
      },
    ],
  };
}
