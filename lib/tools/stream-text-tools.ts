/**
 * streamText 兼容的工具 — dynamicTool() + jsonSchema()。
 * 与 streamText() 原生兼容，通过 TextStreamChatTransport 实时流式输出。
 */

import { dynamicTool, jsonSchema } from 'ai';
import { readCodeFromDisk, writeCodeToDisk, type CodeFile } from '../code-gen';
import { retrieveContext, formatRetrievedContext } from '../rag/retriever';

// ============================================================
// 文件操作工具
// ============================================================

export const writeFileTool = dynamicTool({
  description: '创建或更新项目中的文件',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      projectId: { type: 'number', description: '项目 ID' },
      filePath: { type: 'string', description: '文件路径，如 app/page.tsx' },
      content: { type: 'string', description: '完整的文件内容' },
    },
    required: ['projectId', 'filePath', 'content'],
  }),
  execute: async (input: unknown) => {
    const { projectId, filePath, content } = input as {
      projectId: number;
      filePath: string;
      content: string;
    };
    try {
      const files: CodeFile[] = [{ filePath, content }];
      const written = await writeCodeToDisk(projectId, files);
      return `✅ 已写入 ${written.length} 个文件: ${written.join(', ')}`;
    } catch (e) {
      return `❌ 写入失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});

export const readFileTool = dynamicTool({
  description: '读取项目中的文件内容',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      projectId: { type: 'number', description: '项目 ID' },
      filePath: { type: 'string', description: '文件路径' },
    },
    required: ['projectId', 'filePath'],
  }),
  execute: async (input: unknown) => {
    const { projectId, filePath } = input as { projectId: number; filePath: string };
    try {
      const files = await readCodeFromDisk(projectId);
      const file = files.find((f) => f.filePath === filePath);
      if (!file) return `❌ 文件未找到: ${filePath}`;
      return file.content;
    } catch (e) {
      return `❌ 读取失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});

export const listProjectFilesTool = dynamicTool({
  description: '列出项目中的所有文件',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      projectId: { type: 'number', description: '项目 ID' },
    },
    required: ['projectId'],
  }),
  execute: async (input: unknown) => {
    const { projectId } = input as { projectId: number };
    try {
      const files = await readCodeFromDisk(projectId);
      if (files.length === 0) return '项目中没有文件。';
      return files.map((f) => `📄 ${f.filePath} (${f.content.length} 字符)`).join('\n');
    } catch (e) {
      return `❌ 列出失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});

// ============================================================
// 知识库检索工具
// ============================================================

export const searchDocsTool = dynamicTool({
  description: '搜索 Next.js/React 知识库获取最佳实践和文档',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      topK: { type: 'number', description: '返回结果数量，默认 3' },
    },
    required: ['query'],
  }),
  execute: async (input: unknown) => {
    const { query, topK = 3 } = input as { query: string; topK?: number };
    try {
      const chunks = await retrieveContext(query, { topK });
      if (chunks.length === 0) return '未找到相关文档。';
      return formatRetrievedContext(chunks);
    } catch (e) {
      return `❌ 搜索失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});

export const searchCodeTool = dynamicTool({
  description: '搜索已生成的代码文件，用于代码复用',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词或代码类型' },
      topK: { type: 'number', description: '返回结果数量，默认 3' },
    },
    required: ['query'],
  }),
  execute: async (input: unknown) => {
    const { query, topK = 3 } = input as { query: string; topK?: number };
    try {
      const chunks = await retrieveContext(query, {
        topK,
        filter: { type: 'code' },
      });
      if (chunks.length === 0) return '未找到相似代码。';
      return formatRetrievedContext(chunks);
    } catch (e) {
      return `❌ 搜索失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});

// ============================================================
// streamText 专用工具集
// ============================================================

export const agentTools = {
  writeFile: writeFileTool,
  readFile: readFileTool,
  listProjectFiles: listProjectFilesTool,
  searchDocs: searchDocsTool,
  searchCode: searchCodeTool,
};
