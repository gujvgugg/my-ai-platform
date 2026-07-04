/**
 * AI Agent 知识库检索工具。
 * 允许 Agent 搜索已索引的知识库和代码。
 */

import { retrieveContext, formatRetrievedContext } from '../rag/retriever';

/** 在知识库中搜索相关文档 */
export const searchDocsTool = {
  description: '在 Next.js 和 React 知识库中搜索相关文档和代码示例',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: '搜索查询' },
      topK: { type: 'number', description: '返回结果数量（默认 3）' },
    },
    required: ['query'],
  },
  execute: async ({ query, topK = 3 }: { query: string; topK?: number }) => {
    const chunks = await retrieveContext(query, { topK });
    if (chunks.length === 0) return '未找到相关文档。';
    return formatRetrievedContext(chunks);
  },
};

/** 在所有项目中搜索相似的生成代码 */
export const searchCodeTool = {
  description: '在所有项目中搜索相似的生成代码',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: '要搜索的代码类型' },
      topK: { type: 'number', description: '返回结果数量（默认 3）' },
    },
    required: ['query'],
  },
  execute: async ({ query, topK = 3 }: { query: string; topK?: number }) => {
    const chunks = await retrieveContext(query, { topK, filter: { type: 'code' } });
    if (chunks.length === 0) return '未找到相似的生成代码。';
    return formatRetrievedContext(chunks);
  },
};
