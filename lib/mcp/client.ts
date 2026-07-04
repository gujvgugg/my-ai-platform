/**
 * MCP（模型上下文协议）客户端占位实现。
 *
 * 管理与外部 MCP 服务端（代码编辑器、数据库等）的连接。
 * 此占位定义了未来 MCP 客户端集成的接口。
 */

export interface MCPConnection {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  status: 'connected' | 'disconnected' | 'error';
  tools: string[];
}

/**
 * 占位: 已连接的 MCP 服务端列表。
 * 正式版本中将追踪实际连接。
 */
export function getMCPConnections(): MCPConnection[] {
  return [];
}

/**
 * 占位: 连接到 MCP 服务端。
 */
export async function connectToMCPServer(
  _command: string,
  _args: string[]
): Promise<MCPConnection> {
  throw new Error('MCP 客户端尚未实现');
}
