/**
 * 预构建的工作流模板，用于常见的 Agent 任务。
 */

/** 工作流：生成全栈应用 */
export const generateFullStackApp = {
  name: '生成全栈应用',
  description: '规划架构，生成布局、页面、API 路由和数据库 Schema',
  steps: [
    '理解用户需求并规划架构',
    '生成根布局 (app/layout.tsx)',
    '生成主页面 (app/page.tsx 等)',
    '生成 Server Actions (app/actions.ts)',
    '生成数据库 Schema (lib/schema.ts)',
    '按需生成 API 路由',
    '生成组件',
    '审查并验证所有生成的文件',
  ],
};

/** 工作流：为已有项目添加功能 */
export const addFeature = {
  name: '添加功能',
  description: '理解当前项目，规划功能，生成/修改文件',
  steps: [
    '读取现有项目文件以理解结构',
    '规划功能实现方案',
    '为功能生成新文件',
    '按需修改已有文件（如添加路由、更新布局）',
    '验证与现有代码的集成',
  ],
};

/** 工作流：修复 Bug */
export const fixBug = {
  name: '修复 Bug',
  description: '定位相关文件，分析代码，提出修复方案，应用修复，验证',
  steps: [
    '读取与报告 Bug 相关的文件',
    '分析代码以识别根本原因',
    '搜索文档获取正确的实现模式',
    '应用修复',
    '验证修复不会破坏其他功能',
  ],
};

/** 工作流：代码审查 */
export const codeReview = {
  name: '代码审查',
  description: '审查生成代码的错误、安全问题和最佳实践',
  steps: [
    '列出项目中的所有文件',
    '逐个读取并检查问题',
    '按需搜索文档获取最佳实践',
    '报告发现的问题及建议修复方案',
  ],
};

export const allTemplates = [generateFullStackApp, addFeature, fixBug, codeReview] as const;
