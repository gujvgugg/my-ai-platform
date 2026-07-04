/**
 * Agent 工作流 API 端点。
 * streamText + dynamicTool() 工具，实时流式输出。
 * 与客户端 TextStreamChatTransport 兼容。
 */

import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from 'ai';
import { getModel } from '@/lib/models';
import { getFallbackModel } from '@/lib/gateway';
import { agentTools } from '@/lib/tools/stream-text-tools';
import { retrieveContext, formatRetrievedContext } from '@/lib/rag';

const AGENT_SYSTEM_PROMPT = `你是全栈开发 Agent。优先使用 Next.js App Router + Tailwind CSS 技术栈。

## 强制工作流
1. 用 searchDocs 搜索相关最佳实践
2. 列出将要生成的文件清单
3. 用 writeFile 逐个创建，确认写入成功再生成下一个
4. 用 listProjectFiles 验证所有文件就位

## 强制规则
- ❌ 禁止不调用工具只输出代码文本
- ✅ 每次工具调用前先说进度
- ✅ 完成后用 listProjectFiles 验证`;

const MAX_STEPS = 15;
const TIMEOUT_MS = 180_000;
const MAX_RAG_CHARS = 2000;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages as UIMessage[] | undefined;
    const requestedModel = (body.modelId as string) || 'deepseek-flash';
    const projectId = (body.projectId as number) || undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: '请求体必须包含非空的 "messages" 数组' }, { status: 400 });
    }

    // RAG
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
    const lastUserContent = lastUserMsg
      ? lastUserMsg.parts?.filter((p) => p.type === 'text').map((p) => (p as { type: 'text'; text: string }).text).join('') || ''
      : '';

    let systemPrompt = AGENT_SYSTEM_PROMPT;
    if (projectId) {
      systemPrompt += `\n\n当前项目 ID: ${projectId}。writeFile/readFile/listProjectFiles 必须使用 projectId=${projectId}。`;
    }
    if (lastUserContent) {
      try {
        const chunks = await retrieveContext(lastUserContent, { topK: 3 });
        if (chunks.length > 0) {
          let ctx = formatRetrievedContext(chunks);
          if (ctx.length > MAX_RAG_CHARS) ctx = ctx.slice(0, MAX_RAG_CHARS);
          systemPrompt += `\n\n## 参考知识库\n${ctx}`;
        }
      } catch { /* RAG 失败不影响主流程 */ }
    }

    const modelMessages = await convertToModelMessages(
      messages.map(({ id: _id, ...rest }) => rest as UIMessage)
    );

    async function tryStream(model: ReturnType<typeof getModel>) {
      return streamText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        tools: agentTools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(MAX_STEPS),
        temperature: 0.3,
        maxOutputTokens: 4096,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }

    try {
      const result = await tryStream(getModel(requestedModel));
      return result.toTextStreamResponse();
    } catch (firstError) {
      const msg = firstError instanceof Error ? firstError.message : String(firstError);
      console.warn(`Agent "${requestedModel}" 失败: ${msg}`);
      if (msg.includes('timeout') || msg.includes('abort')) {
        return Response.json({ error: 'Agent 执行超时，请简化任务后重试' }, { status: 504 });
      }
      const fallbackId = getFallbackModel(requestedModel);
      if (fallbackId === requestedModel) throw firstError;
      try {
        const result = await tryStream(getModel(fallbackId));
        console.log(`Agent 降级到 ${fallbackId}`);
        return result.toTextStreamResponse();
      } catch {
        throw firstError;
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Agent 错误:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
