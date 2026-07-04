/**
 * Agent 工作流 API 端点。
 * 接收用户请求并通过 Agent 运行，流式返回逐步执行进度。
 */

import { convertToModelMessages, type UIMessage } from 'ai';
import { createCodeGenAgent } from '@/lib/agent';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages as UIMessage[] | undefined;
    const modelId = (body.modelId as string) || undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: '请求体必须包含非空的 "messages" 数组' }, { status: 400 });
    }

    const agent = createCodeGenAgent(modelId);
    const modelMessages = await convertToModelMessages(
      messages.map(({ id: _id, ...rest }) => rest as UIMessage)
    );

    // 以 UI 消息流的形式流式返回 Agent 执行步骤
    const result = await agent.stream({
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('工作流错误:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
