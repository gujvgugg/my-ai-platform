/**
 * MCP（模型上下文协议）服务端占位实现。
 *
 * MCP 允许 AI 应用向外部 AI 客户端（如 Claude Desktop、Cursor 等）
 * 暴露工具、资源和提示词。
 *
 * 这是未来实现的占位。就绪后，此模块将:
 * - 定义 MCP 服务端能力（工具、资源、提示词）
 * - 处理 MCP 协议消息（通过 stdio/SSE 的 JSON-RPC）
 * - 将平台的 AI 代码生成能力暴露为 MCP 工具
 */

export interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
}

/**
 * 占位 MCP 服务端配置。
 * 正式版本中将与 MCP SDK 对接。
 */
export function createMCPServerConfig(): MCPServerConfig {
  return {
    name: 'ai-fullstack-platform',
    version: '0.1.0',
    description: 'AI 原生全栈应用开发平台 —— 通过 MCP 协议生成 Next.js 应用',
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
  };
}
