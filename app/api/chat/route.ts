import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { env } from '@/lib/env';
import { getModel } from '@/lib/models';
import { getFallbackModel } from '@/lib/gateway';
import { retrieveContext, formatRetrievedContext } from '@/lib/rag';
import { buildCodeGenSystemPrompt } from '@/lib/app-generator';
import { recordAICall } from '@/lib/telemetry';

// ============================================================
// 上下文限制
// ============================================================

const MAX_HISTORY_MESSAGES = 10;  // 最多保留最近 10 条消息
const MAX_RAG_CHARS = 2000;       // RAG 检索结果最多 2000 字符
const MAX_SYSTEM_CHARS = 8000;    // 系统提示词最多 8000 字符

// ============================================================
// 代码生成意图检测
// ============================================================

/**
 * 简单代码生成：单个组件、页面
 */
function isSimpleCodeGen(userContent: string): boolean {
  const patterns = [
    /生成.*(?:页面|组件|表单|按钮|导航|卡片|列表|弹窗)/,
    /创建.*(?:页面|组件|表单|按钮)/,
    /写.*(?:页面|组件|表单)/,
    /做一个.*(?:页面|组件|表单|UI)/,
  ];
  return patterns.some((p) => p.test(userContent));
}

/**
 * 复杂应用生成：完整应用、项目、系统
 */
function isComplexCodeGen(userContent: string): boolean {
  const patterns = [
    /生成.*(?:应用|项目|系统|后台|网站|平台)/,
    /创建.*(?:应用|项目|系统|后台|网站|平台)/,
    /开发.*(?:应用|项目|系统|后台|网站|平台)/,
    /搭建.*(?:应用|项目|系统|后台|网站|平台)/,
    /帮我.*(?:生成|创建|开发|搭建|做).*(?:应用|项目|系统|后台|网站|平台)/,
    /(?:待办|博客|商城|电商|论坛|聊天|仪表盘|管理|任务|笔记|相册|日历)/,
    /支持.*(?:添加|编辑|删除|修改|标记|搜索|筛选|分页|排序|登录|注册)/,
    /数据库|Server\s*Action|CRUD|Schema/i,
  ];
  return patterns.some((p) => p.test(userContent));
}

/**
 * 判断是否为代码生成请求（简单或复杂）
 */
function isCodeGenRequest(userContent: string): { isCodeGen: boolean; isComplex: boolean } {
  if (isComplexCodeGen(userContent)) return { isCodeGen: true, isComplex: true };
  if (isSimpleCodeGen(userContent)) return { isCodeGen: true, isComplex: false };
  // 通用代码生成关键词
  const generic = /生成.*代码|生成.*功能|帮我.*生成|帮我.*写|帮我.*做|^生成|^创建|^写一个|^帮我/;
  if (generic.test(userContent)) return { isCodeGen: true, isComplex: false };
  return { isCodeGen: false, isComplex: false };
}

// ============================================================
// 系统提示词
// ============================================================

const SIMPLE_CODE_GEN_PROMPT = `你是代码生成器。只输出 JSON 数组，不要任何解释、markdown。格式：[{"filePath":"...","content":"..."}]。字符串内换行用 \\n，双引号用 \\"。`;

const CHAT_SYSTEM_PROMPT = `你是全栈开发助手，中文回复。收到"生成/创建/帮我做"请求时只输出 JSON 数组代码。格式：[{"filePath":"...","content":"..."}]。`;

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

    // ——— 1. 截断对话历史 ———
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

    const { isCodeGen, isComplex } = isCodeGenRequest(lastUserContent);
    console.log(`代码生成: ${isCodeGen} (复杂=${isComplex}) — "${lastUserContent.slice(0, 80)}"`);

    // ——— 3. 模型路由 ———
    const requestedModel = (body.modelId as string) || undefined;
    // 复杂应用生成自动使用 Pro 模型（如果用户没有明确指定）
    let modelId = requestedModel || (isComplex ? 'deepseek-pro' : 'deepseek-flash');
    // 如果用户明确选了 flash 但任务复杂，仍然尊重用户选择

    // ——— 4. 构建系统提示词 + RAG ———
    let systemPrompt: string;
    let temperature: number;
    let maxOutputTokens: number;

    if (isComplex) {
      // 复杂应用：使用增强提示词
      systemPrompt = buildCodeGenSystemPrompt(lastUserContent);
      temperature = 0.2;
      maxOutputTokens = 8192;

      // 附加 RAG 知识库
      if (lastUserContent) {
        try {
          const chunks = await retrieveContext(lastUserContent, { topK: 3 });
          if (chunks.length > 0) {
            let context = formatRetrievedContext(chunks);
            if (context.length > MAX_RAG_CHARS) {
              context = context.slice(0, MAX_RAG_CHARS) + '\n...(已截断)';
            }
            systemPrompt = `## 参考文档\n${context}\n---\n${systemPrompt}`;
            console.log(`[RAG] 检索到 ${chunks.length} 条 (${context.length} 字符)`);
          }
        } catch (err) {
          console.warn('RAG 检索失败:', err);
        }
      }
    } else if (isCodeGen) {
      // 简单代码生成：快速路径
      systemPrompt = SIMPLE_CODE_GEN_PROMPT;
      temperature = 0.3;
      maxOutputTokens = 4096;

      // 简单代码生成也尝试 RAG
      if (lastUserContent) {
        try {
          const chunks = await retrieveContext(lastUserContent, { topK: 2 });
          if (chunks.length > 0) {
            let context = formatRetrievedContext(chunks);
            if (context.length > MAX_RAG_CHARS) {
              context = context.slice(0, MAX_RAG_CHARS);
            }
            systemPrompt = `参考:\n${context}\n---\n${SIMPLE_CODE_GEN_PROMPT}`;
          }
        } catch { /* 失败不影响主流程 */ }
      }
    } else {
      // 普通聊天
      systemPrompt = CHAT_SYSTEM_PROMPT;
      temperature = 0.7;
      maxOutputTokens = 2048;
    }

    // 系统提示词兜底截断
    if (systemPrompt.length > MAX_SYSTEM_CHARS) {
      systemPrompt = systemPrompt.slice(0, MAX_SYSTEM_CHARS);
    }

    console.log(`上下文: system=${systemPrompt.length}字符, messages=${trimmedMessages.length}条, tokens=${maxOutputTokens}, model=${modelId}`);

    // ——— 5. 转换消息 ———
    const modelMessages = await convertToModelMessages(
      trimmedMessages.map(({ id: _id, ...rest }) => rest as UIMessage)
    );

    // ——— 6. 流式生成 ———
    const timeoutMs = isComplex ? 180_000 : 120_000;
    const chatStartTime = Date.now();

    async function tryStream(model: ReturnType<typeof getModel>, modelName: string) {
      return streamText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        temperature,
        maxOutputTokens,
        abortSignal: AbortSignal.timeout(timeoutMs),
        onFinish: ({ finishReason, usage }) => {
          recordAICall({
            modelId: modelName,
            latencyMs: Date.now() - chatStartTime,
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            success: finishReason === 'stop',
            isCodeGen,
          });
        },
      });
    }

    try {
      const streamResult = await tryStream(getModel(modelId), modelId);
      return streamResult.toTextStreamResponse();
    } catch (firstError) {
      const msg = firstError instanceof Error ? firstError.message : String(firstError);
      console.warn(`模型 "${modelId}" 失败: ${msg}`);

      // 超时不降级，直接返回错误
      if (msg.includes('timeout') || msg.includes('abort')) {
        return Response.json(
          { error: '请求超时，请简化你的问题或清空对话后重试' },
          { status: 504 }
        );
      }

      const fallbackId = getFallbackModel(modelId);
      if (fallbackId === modelId) throw firstError;

      try {
        const streamResult = await tryStream(getModel(fallbackId), fallbackId);
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
