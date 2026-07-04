/**
 * Agent 编排器 —— 使用 AI SDK v6 的 ToolLoopAgent。
 * 处理带工具调用的多步骤 Agent 工作流。
 */

import { ToolLoopAgent, stepCountIs } from 'ai';
import { getModel } from '../models';
import { standardTools } from '../tools';

/**
 * 创建用于全栈代码生成任务的已配置 Agent。
 */
export function createCodeGenAgent(modelId?: string) {
  return new ToolLoopAgent({
    model: getModel(modelId || 'deepseek-flash'),
    instructions: `你是一个全栈开发专家，精通 Next.js、React、TypeScript 和 Tailwind CSS。
你的目标是帮助用户逐步构建完整的应用。

可用工具:
- readFile: 读取项目中的任意文件
- writeFile: 在项目中创建或更新文件
- listProjectFiles: 查看当前项目中的所有文件
- searchDocs: 搜索 Next.js/React 知识库获取最佳实践
- searchCode: 在所有项目中搜索相似代码以便复用

工作流指南:
1. 首先理解用户想要构建什么
2. 规划所需的文件结构（页面、组件、API 路由、Schema）
3. 如有需要，搜索文档获取相关模式
4. 逐个生成文件，从布局/结构开始，再到页面，最后到逻辑
5. 生成完所有文件后，检查整个项目

始终编写完整的、可投入生产的代码。使用 TypeScript，正确处理错误，遵循 Next.js 约定。`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: standardTools as any,
    stopWhen: stepCountIs(15),
  });
}

/**
 * 创建用于代码审查和改进任务的已配置 Agent。
 */
export function createCodeReviewAgent(modelId?: string) {
  return new ToolLoopAgent({
    model: getModel(modelId || 'deepseek-flash'),
    instructions: `你是一位资深代码审查员。审查代码中的错误、安全问题、性能问题以及是否遵循最佳实践。

可用工具:
- readFile: 读取项目中的任意文件
- listProjectFiles: 查看项目中的所有文件
- searchDocs: 搜索文档获取最佳实践和模式`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: {
      readFile: standardTools.readFile,
      listProjectFiles: standardTools.listProjectFiles,
      searchDocs: standardTools.searchDocs,
    } as any,
    stopWhen: stepCountIs(8),
  });
}
