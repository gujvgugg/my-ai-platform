/**
 * 网络搜索工具 — 支持基础 HTTP 获取。
 */

export const webSearchTool = {
  description: '从指定 URL 获取内容（用于查阅在线文档）',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: '要获取的 URL（仅限 HTTP/HTTPS）' },
    },
    required: ['url'],
  },
  execute: async ({ url }: { url: string }) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return '错误: 仅支持 HTTP/HTTPS 协议的 URL';
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return `HTTP ${res.status}: 请求失败`;
      const text = await res.text();
      // 返回前 3000 字符
      return text.length > 3000 ? text.slice(0, 3000) + '\n...(已截断)' : text;
    } catch (e) {
      return `网络请求失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};
