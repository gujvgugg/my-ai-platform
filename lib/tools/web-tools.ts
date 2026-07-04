/**
 * AI Agent 网络相关工具（占位实现）。
 */

/** 网络搜索工具（占位 —— 尚未接入真实搜索 API） */
export const webSearchTool = {
  description: '搜索网络获取最新信息（占位实现，尚未配置搜索 API）',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: '搜索查询' },
    },
    required: ['query'],
  },
  execute: async ({ query }: { query: string }) => {
    return `网络搜索功能尚未配置。查询内容: "${query}"。配置搜索 API 密钥后即可启用。`;
  },
};
