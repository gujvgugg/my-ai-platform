/**
 * 流式传输辅助工具。
 */

import { createUIMessageStreamResponse, type UIMessage } from 'ai';
import type { StreamTextResult } from 'ai';

export function createStructuredStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: StreamTextResult<any, any>
): Response {
  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream(),
    headers: { 'X-Stream-Type': 'ui-message' },
  });
}

/**
 * 将数据库消息转换为 UI 消息格式。
 * 还原 __TOOL_PARTS__ 序列化的 Agent tool-call 数据，
 * 使刷新页面后 WorkflowViewer 仍可展示步骤。
 */
export function dbMessagesToUI(
  dbMessages: Array<{ id: number; role: string; content: string }>
): UIMessage[] {
  return dbMessages.map((m) => {
    const marker = '__TOOL_PARTS__';
    const idx = m.content.indexOf(marker);

    if (idx !== -1) {
      const textContent = m.content.slice(0, idx);
      const toolPartsJson = m.content.slice(idx + marker.length);
      try {
        const toolParts = JSON.parse(toolPartsJson);
        return {
          id: m.id.toString(),
          role: m.role as 'user' | 'assistant' | 'system',
          parts: [
            ...(textContent ? [{ type: 'text' as const, text: textContent }] : []),
            ...(Array.isArray(toolParts) ? toolParts : []),
          ],
        };
      } catch { /* JSON 解析失败，回退为纯文本 */ }
    }

    return {
      id: m.id.toString(),
      role: m.role as 'user' | 'assistant' | 'system',
      parts: [{ type: 'text' as const, text: m.content }],
    };
  });
}
