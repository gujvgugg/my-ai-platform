import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { env } from '@/lib/env';
import { getModel } from '@/lib/models';
import { getFallbackModel } from '@/lib/gateway';
import { retrieveContext, formatRetrievedContext } from '@/lib/rag/retriever';

// ============================================================
// 上下文限制
// ============================================================

const MAX_HISTORY_MESSAGES = 10;  // 最多保留最近 10 条消息
const MAX_RAG_CHARS = 2000;       // RAG 检索结果最多 2000 字符
const MAX_SYSTEM_CHARS = 8000;    // 系统提示词最多 8000 字符

// ============================================================
// 代码生成意图检测
// ============================================================

function isCodeGenRequest(userContent: string): boolean {
  const patterns = [
    /生成.*页面/, /生成.*应用/, /生成.*组件/, /生成.*代码/, /生成.*项目/,
    /生成.*功能/, /生成.*表单/, /生成.*后台/, /创建.*应用/, /创建.*项目/,
    /创建.*页面/, /帮我.*生成/, /帮我.*创建/, /帮我.*写/, /帮我.*开发/,
    /帮我.*做/, /写.*页面/, /写.*组件/, /写.*应用/, /开发.*应用/,
    /开发.*网站/, /搭建.*网站/, /搭建.*项目/, /做一个/, /给我做/,
    /^生成/, /^创建/, /^写一个/, /^帮我/,
    /\bgenerate\b.*\b(app|page|component|website|site|form)\b/i,
    /\bcreate\b.*\b(app|page|component|website|site|form)\b/i,
    /\bbuild\b.*\b(app|page|component|website|site|form)\b/i,
  ];
  return patterns.some((p) => p.test(userContent));
}

// ============================================================
// 系统提示词（精简版，减少 token 占用）
// ============================================================

const CODE_GEN_SYSTEM_PROMPT = `你是代码生成器。只输出 JSON 数组，不要任何解释、markdown。格式：[{"filePath":"...","content":"..."}]。字符串内换行用 \n，双引号用 \"。`;

const CHAT_SYSTEM_PROMPT = `你是全栈开发助手，用中文回复。收到"生成/创建/帮我做"请求时只输出 JSON 数组代码。`;

// ============================================================
// POST 处理函数
// ============================================================

export async function POST(req: Request) {
  try {
    if (!env.DEEPSEEK_API_KEY) {
      return Response.json({ error: '未配置 DEEPSEEK_API_KEY' }, { status: 500 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: '无效的 JSON 请求体' }, { status: 400 });
    }

    const messages = body.messages as UIMessage[] | undefined;
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: '请求体必须包含非空的 messages 数组' }, { status: 400 });
    }

    // ——— 1. 截断对话历史，防止上下文溢出 ———
    const trimmedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    console.log(`消息: ${messages.length} 条 → 截断为 ${trimmedMessages.length} 条`);

    // ——— 2. 检测代码生成意图 ———
    const lastUserMessage = trimmedMessages.filter((m) => m.role === 'user').pop();
    const lastUserContent = lastUserMessage
      ? lastUserMessage.parts
          ?.filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('') || ''
      : '';

    const isCodeGen = isCodeGenRequest(lastUserContent);
    console.log(`代码生成模式: ${isCodeGen} — "${lastUserContent.slice(0, 60)}"`);

    // ——— 3. 模型路由 ———
    const requestedModel = (body.modelId as string) || undefined;
    let modelId = requestedModel || 'deepseek-flash';

    // ——— 4. 构建系统提示词 + RAG ———
    let systemPrompt = isCodeGen ? CODE_GEN_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;

    if (isCodeGen && lastUserContent) {
      try {
        const chunks = await retrieveContext(lastUserContent, { topK: 3 });
        if (chunks.length > 0) {
          let context = formatRetrievedContext(chunks);
          if (context.length > MAX_RAG_CHARS) {
            context = context.slice(0, MAX_RAG_CHARS) + '\n...(已截断)';
          }
          systemPrompt = `参考文档:\n${context}\n---\n${CODE_GEN_SYSTEM_PROMPT}`;
          console.log(`[RAG] 检索到 ${chunks.length} 条 (${context.length} 字符)`);
        }
      } catch (err) {
        console.warn('RAG 检索失败:', err);
      }
    }

    // 系统提示词兜底截断
    if (systemPrompt.length > MAX_SYSTEM_CHARS) {
      systemPrompt = systemPrompt.slice(0, MAX_SYSTEM_CHARS);
    }

    console.log(`上下文大小: system=${systemPrompt.length}字符, messages=${trimmedMessages.length}条`);

    // ——— 5. 转换消息 ———
    const modelMessages = await convertToModelMessages(
      trimmedMessages.map(({ id: _id, ...rest }) => rest as UIMessage)
    );

    // ——— 6. 流式生成 ———
    async function tryStream(model: ReturnType<typeof getModel>) {
      return streamText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        temperature: isCodeGen ? 0.3 : 0.7,
        maxOutputTokens: isCodeGen ? 4096 : 2048,
        abortSignal: AbortSignal.timeout(120_000), // 2分钟超时
      });
    }

    try {
      const streamResult = await tryStream(getModel(modelId));
      return streamResult.toTextStreamResponse();
    } catch (firstError) {
      const msg = firstError instanceof Error ? firstError.message : String(firstError);
      console.warn(`模型 "${modelId}" 失败: ${msg}`);

      // 超时不降级，直接返回错误
      if (msg.includes('timeout') || msg.includes('abort')) {
        return Response.json({ error: '请求超时，请简化你的问题或清空对话后重试' }, { status: 504 });
      }

      const fallbackId = getFallbackModel(modelId);
      if (fallbackId === modelId) throw firstError;

      try {
        const streamResult = await tryStream(getModel(fallbackId));
        console.log(`已降级到 ${fallbackId}`);
        return streamResult.toTextStreamResponse();
      } catch {
        throw firstError;
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('聊天接口错误:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
