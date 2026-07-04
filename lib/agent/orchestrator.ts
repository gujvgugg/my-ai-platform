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
export function createCodeGenAgent(modelId?: string, projectId?: number) {
  const projectHint = projectId
    ? `\n当前项目 ID 是 ${projectId}。调用 readFile/writeFile/listProjectFiles 时使用此 projectId。`
    : '';

  return new ToolLoopAgent({
    model: getModel(modelId || 'deepseek-flash'),
    instructions: `你是一个全栈开发专家，精通 Next.js、React、TypeScript 和 Tailwind CSS。
你的目标是帮助用户逐步构建完整的应用。${projectHint}

可用工具:
- readFile(projectId, filePath): 读取项目中的文件
- writeFile(projectId, filePath, content): 创建或更新文件
- listProjectFiles(projectId): 查看项目中的所有文件
- searchDocs(query): 搜索知识库获取最佳实践
- searchCode(query): 搜索相似代码以便复用

工作流:
1. 理解用户需求，规划文件结构
2. 搜索文档获取相关模式
3. 逐个生成文件，从布局到页面再到逻辑
4. 生成完后检查整个项目

使用 TypeScript，处理错误，遵循 Next.js 约定。`,
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
