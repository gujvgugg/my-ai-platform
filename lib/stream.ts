/**
 * 流式传输辅助工具。
 * 使用 AI SDK v6 的 createUIMessageStreamResponse 进行结构化流式传输。
 */

import { createUIMessageStreamResponse, type UIMessage } from 'ai';
import type { StreamTextResult } from 'ai';

/**
 * 从 streamText 结果创建结构化 UI 消息流响应。
 * 允许客户端接收类型化的部件，而不仅仅是纯文本。
 */
export function createStructuredStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: StreamTextResult<any, any>
): Response {
  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream(),
    headers: {
      'X-Stream-Type': 'ui-message',
    },
  });
}

/**
 * 将数据库消息记录转换为 UI 消息格式。
 */
export function dbMessagesToUI(
  dbMessages: Array<{ id: number; role: string; content: string }>
): UIMessage[] {
  return dbMessages.map((m) => ({
    id: m.id.toString(),
    role: m.role as 'user' | 'assistant' | 'system',
    parts: [{ type: 'text' as const, text: m.content }],
  }));
}
