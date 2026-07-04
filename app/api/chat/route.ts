import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { env } from '@/lib/env';
import { getModel } from '@/lib/models';
import { getFallbackModel } from '@/lib/gateway';
import { retrieveContext, formatRetrievedContext } from '@/lib/rag/retriever';

// ============================================================
// 代码生成意图检测（宽松匹配）
// ============================================================

function isCodeGenRequest(userContent: string): boolean {
  // 只要包含以下任一动词 + 名词组合，就触发代码生成模式
  const codeGenPatterns = [
    // 完整中文短语
    /生成.*页面/,
    /生成.*应用/,
    /生成.*组件/,
    /生成.*代码/,
    /生成.*项目/,
    /生成.*功能/,
    /生成.*表单/,
    /生成.*后台/,
    /创建.*应用/,
    /创建.*项目/,
    /创建.*页面/,
    /帮我.*生成/,
    /帮我.*创建/,
    /帮我.*写/,
    /帮我.*开发/,
    /帮我.*做/,
    /写.*页面/,
    /写.*组件/,
    /写.*应用/,
    /开发.*应用/,
    /开发.*网站/,
    /搭建.*网站/,
    /搭建.*项目/,
    /做一个/,
    /给我做/,
    // 简短触发词（单独一个短语就够）
    /^生成/,
    /^创建/,
    /^写一个/,
    /^帮我/,
    // 英文
    /\bgenerate\b.*\b(app|page|component|website|site|form)\b/i,
    /\bcreate\b.*\b(app|page|component|website|site|form)\b/i,
    /\bbuild\b.*\b(app|page|component|website|site|form)\b/i,
    /\bmake\b.*\b(app|page|component|website|site|form)\b/i,
  ];

  return codeGenPatterns.some((pattern) => pattern.test(userContent));
}

// ============================================================
// 系统提示词
// ============================================================

const CODE_GEN_SYSTEM_PROMPT = `你是一个代码生成器。你必须严格按照 JSON 格式输出，不要写任何解释、问候语、markdown 标记或其他内容。

规则：
1. 你的回复必须是且仅是一个 JSON 数组
2. 数组中每个元素包含 "filePath" 和 "content" 两个字段
3. "filePath" 是文件路径（如 "app/page.tsx"）
4. "content" 是完整的文件源代码
5. 字符串中的换行用 \n，双引号用 \" 转义
6. 不要输出 \`\`\`json 或任何代码块标记
7. 不要输出任何解释性文字

正确示例：
[
  {
    "filePath": "app/page.tsx",
    "content": "'use client';\n\nexport default function Home() {\n  return <div>Hello World</div>;\n}"
  },
  {
    "filePath": "app/layout.tsx",
    "content": "export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html><body>{children}</body></html>;\n}"
  }
]

请严格遵守以上格式。`;

const CHAT_SYSTEM_PROMPT = `你是一个全栈开发助手，精通 Next.js、React、TypeScript 和 Tailwind CSS。用中文回复，给出清晰的解答和代码示例。

重要：如果你收到一个"生成xxx"、"创建xxx"或"帮我做xxx"的请求，你必须用 JSON 数组格式回复：
[
  { "filePath": "app/page.tsx", "content": "...代码..." },
  { "filePath": "app/actions.ts", "content": "...代码..." }
]
不要写解释，不要写 markdown 代码块，只要 JSON 数组。`;

// ============================================================
// POST 处理函数
// ============================================================

export async function POST(req: Request) {
  try {
    if (!env.DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: '未配置 DEEPSEEK_API_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: '无效的 JSON 请求体' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messages = body.messages as UIMessage[] | undefined;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: '请求体必须包含非空的 "messages" 数组' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从最后一条用户消息中检测代码生成意图
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const lastUserContent = lastUserMessage
      ? lastUserMessage.parts
          ?.filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('') || ''
      : '';

    const isCodeGen = isCodeGenRequest(lastUserContent);
    console.log(`聊天请求 — 代码生成模式: ${isCodeGen} — 用户输入: "${lastUserContent.slice(0, 80)}"`);

    // 模型路由
    const requestedModel = (body.modelId as string) || undefined;
    let modelId = requestedModel || 'deepseek-flash';

    // 转换消息
    const modelMessages = await convertToModelMessages(
      messages.map(({ id: _id, ...rest }) => rest as UIMessage)
    );

    // 构建系统提示词
    let systemPrompt = isCodeGen ? CODE_GEN_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;

    // RAG 增强
    if (isCodeGen && lastUserContent) {
      try {
        const chunks = await retrieveContext(lastUserContent, { topK: 3 });
        if (chunks.length > 0) {
          const context = formatRetrievedContext(chunks);
          systemPrompt = `以下是与用户需求相关的 Next.js 文档和最佳实践:\n\n${context}\n\n---\n\n${CODE_GEN_SYSTEM_PROMPT}`;
        }
      } catch (err) {
        console.warn('RAG 检索失败:', err);
      }
    }

    // 流式生成（带模型降级）
    async function tryStream(model: ReturnType<typeof getModel>) {
      return streamText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        temperature: isCodeGen ? 0.3 : 0.7, // 代码生成降低温度，提高确定性
        maxOutputTokens: isCodeGen ? 4096 : 2048,
      });
    }

    let result: Awaited<ReturnType<typeof tryStream>>;
    try {
      result = await tryStream(getModel(modelId));
    } catch (firstError) {
      console.warn(`模型 "${modelId}" 调用失败，尝试降级:`, String(firstError));
      const fallbackId = getFallbackModel(modelId);
      if (fallbackId === modelId) throw firstError;
      modelId = fallbackId;
      try {
        result = await tryStream(getModel(modelId));
      } catch {
        throw firstError;
      }
    }

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('聊天接口错误:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
