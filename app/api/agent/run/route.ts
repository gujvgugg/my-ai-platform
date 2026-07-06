/**
 * Agent 运行端点 —— Plan → Execute → Stream 架构。
 *
 * 流程：
 * 1. 接收用户消息，调用规划器分解为步骤
 * 2. 依次执行每个步骤（LLM + 工具）
 * 3. 通过 SSE 实时推送事件到前端
 *
 * SSE 事件格式：
 * - plan: 完整的执行计划
 * - step_start: 步骤开始执行
 * - progress: 步骤执行中的文本输出
 * - tool_call: 工具调用
 * - tool_result: 工具结果
 * - step_complete: 步骤执行完成
 * - step_error: 步骤执行失败
 * - done: 全部完成
 * - error: 整体错误
 */

import { generateText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { getModel } from '@/lib/models';
import { getFallbackModel } from '@/lib/gateway';
import { agentTools } from '@/lib/tools/stream-text-tools';
import { retrieveContext, formatRetrievedContext } from '@/lib/rag';
import { generatePlan, buildFallbackPlan, type PlanStep } from '@/lib/agent/planner';
import { recordAICall } from '@/lib/telemetry';

// ============================================================
// 配置
// ============================================================

const MAX_EXECUTION_STEPS = 10;
const STEP_TIMEOUT_MS = 180_000;   // 单步超时 3 分钟（含多轮工具调用）
const PLAN_TIMEOUT_MS = 60_000;    // 规划超时 1 分钟
const EXECUTION_MODEL = 'deepseek-flash';
const PLAN_MODEL = 'deepseek-pro';
const MAX_RAG_CHARS = 2000;

// ============================================================
// SSE 辅助函数
// ============================================================

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const encoder = new TextEncoder();

// ============================================================
// 步骤执行系统提示词
// ============================================================

function buildStepSystemPrompt(
  step: PlanStep,
  planSummary: string,
  techStack: string[],
  projectId: number,
  allSteps: PlanStep[]
): string {
  const previousSteps = allSteps.filter((s) => s.id < step.id);
  const remainingSteps = allSteps.filter((s) => s.id > step.id);

  let prompt = `你是全栈开发专家。你正在执行一个多步骤开发计划中的第 ${step.id}/${allSteps.length} 步。

## 项目概述
${planSummary}

## 技术栈
${techStack.join(' + ')}

## 当前项目 ID: ${projectId}

`;

  if (previousSteps.length > 0) {
    prompt += `## 已完成的步骤
${previousSteps.map((s) => `- ✅ [步骤${s.id}] ${s.title}`).join('\n')}

`;
  }

  prompt += `## 当前任务：${step.title}
${step.description}

## 输出规则
1. 使用工具（writeFile/readFile/listProjectFiles/searchDocs/searchCode）完成任务
2. 生成的文件必须是完整可用的代码，不要写占位符或省略号
3. 文件写入后，简单说明写入内容和完成状态
4. TypeScript 严格模式，Next.js 16 App Router 规范
5. Tailwind CSS v4 类名
6. 代码风格：中文注释、现代 UI 设计

`;

  if (remainingSteps.length > 0) {
    prompt += `## 后续步骤（仅供上下文参考，不要提前执行）
${remainingSteps.map((s) => `- ⏳ [步骤${s.id}] ${s.title}: ${s.description}`).join('\n')}
`;
  }

  return prompt;
}

// ============================================================
// 主处理函数
// ============================================================

export async function POST(req: Request) {
  const streamController = new AbortController();
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '无效的 JSON 请求体' }, { status: 400 });
  }

  const messages = body.messages as UIMessage[] | undefined;
  const requestedModel = (body.modelId as string) || EXECUTION_MODEL;
  const projectId = (body.projectId as number) || 0;

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: '请求体必须包含非空的 messages 数组' },
      { status: 400 }
    );
  }

  // 提取最后一条用户消息
  const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
  const userContent = lastUserMsg
    ? lastUserMsg.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('') || ''
    : '';

  if (!userContent.trim()) {
    return Response.json({ error: '用户消息为空' }, { status: 400 });
  }

  // 创建可读流
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const enqueue = (data: string) =>
          controller.enqueue(encoder.encode(data));

        // ============================================================
        // 阶段 1: 规划
        // ============================================================

        console.log(`[Agent] 规划中... "${userContent.slice(0, 80)}"`);
        enqueue(sseEvent('progress', { message: '正在分析需求，生成执行计划...' }));

        let plan;
        try {
          plan = await generatePlan(userContent, PLAN_MODEL);
        } catch (planErr) {
          console.warn('[Agent] 规划失败，使用回退计划:', planErr);
          plan = buildFallbackPlan(userContent);
        }

        console.log(`[Agent] 计划: ${plan.steps.length} 个步骤, ${plan.summary}`);
        enqueue(sseEvent('plan', plan));

        // ============================================================
        // 阶段 2: 逐步执行
        // ============================================================

        const stepsToExecute = plan.steps.slice(0, MAX_EXECUTION_STEPS);
        let completedCount = 0;
        let failedCount = 0;

        for (const step of stepsToExecute) {
          // 检查中断
          if (streamController.signal.aborted) {
            enqueue(sseEvent('error', { message: '执行已被取消' }));
            break;
          }

          console.log(
            `[Agent] 执行步骤 ${step.id}/${plan.steps.length}: ${step.title}`
          );
          enqueue(
            sseEvent('step_start', {
              stepId: step.id,
              title: step.title,
              description: step.description,
              category: step.category,
            })
          );

          try {
            // 构建此步骤的系统提示词
            const systemPrompt = buildStepSystemPrompt(
              step,
              plan.summary,
              plan.techStack,
              projectId,
              plan.steps
            );

            // 注入 RAG 知识库
            let enhancedPrompt = systemPrompt;
            try {
              const chunks = await retrieveContext(
                `${plan.summary} ${step.title} ${step.description}`,
                { topK: 3 }
              );
              if (chunks.length > 0) {
                let ctx = formatRetrievedContext(chunks);
                if (ctx.length > MAX_RAG_CHARS)
                  ctx = ctx.slice(0, MAX_RAG_CHARS);
                enhancedPrompt += `\n\n## 参考知识库\n${ctx}`;
              }
            } catch {
              /* RAG 不影响主流程 */
            }

            // 转换消息历史（最多 6 条以聚焦当前步骤）
            const recentMessages = messages.slice(-6);
            const modelMessages = await convertToModelMessages(
              recentMessages.map(
                ({ id: _id, ...rest }) =>
                  rest as UIMessage
              )
            );

            // 执行此步骤
            const stepStartTime = Date.now();
            const result = await generateText({
              model: getModel(requestedModel),
              system: enhancedPrompt,
              messages: modelMessages,
              tools: agentTools,
              toolChoice: 'auto',
              stopWhen: stepCountIs(8), // 每个步骤最多 8 次工具调用
              temperature: 0.3,
              maxOutputTokens: 4096,
              abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS),
              onStepFinish: (event) => {
                // 发送工具调用事件
                if (event.toolCalls && event.toolCalls.length > 0) {
                  for (const tc of event.toolCalls) {
                    enqueue(
                      sseEvent('tool_call', {
                        stepId: step.id,
                        toolName: tc.toolName,
                        input: tc.input,
                      })
                    );
                  }
                }
                if (event.toolResults && event.toolResults.length > 0) {
                  for (const tr of event.toolResults) {
                    enqueue(
                      sseEvent('tool_result', {
                        stepId: step.id,
                        toolName: tr.toolName,
                        output:
                          typeof tr.output === 'string'
                            ? tr.output.slice(0, 500)
                            : JSON.stringify(tr.output).slice(0, 500),
                      })
                    );
                  }
                }
              },
            });

            // 记录此步骤的 AI 调用统计
            recordAICall({
              modelId: requestedModel,
              latencyMs: Date.now() - stepStartTime,
              inputTokens: result.usage?.inputTokens || 0,
              outputTokens: result.usage?.outputTokens || 0,
              success: true,
            });

            // 发送步骤的文本输出
            const stepText = result.text.trim();
            if (stepText) {
              enqueue(
                sseEvent('progress', {
                  stepId: step.id,
                  message: stepText.slice(0, 2000),
                })
              );
            }

            completedCount++;
            enqueue(
              sseEvent('step_complete', {
                stepId: step.id,
                title: step.title,
              })
            );
            console.log(`[Agent] 步骤 ${step.id} 完成`);
          } catch (stepErr) {
            failedCount++;
            const errMsg =
              stepErr instanceof Error ? stepErr.message : String(stepErr);
            console.error(`[Agent] 步骤 ${step.id} 失败:`, errMsg);

            // 超时不停止全部
            if (errMsg.includes('timeout') || errMsg.includes('abort')) {
              enqueue(
                sseEvent('step_error', {
                  stepId: step.id,
                  title: step.title,
                  error: '步骤执行超时，已跳过',
                })
              );
              // 继续执行下一步
              continue;
            }

            enqueue(
              sseEvent('step_error', {
                stepId: step.id,
                title: step.title,
                error: errMsg.slice(0, 300),
              })
            );

            // 非超时错误也继续执行
            continue;
          }
        }

        // ============================================================
        // 阶段 3: 完成
        // ============================================================

        const totalSteps = stepsToExecute.length;
        console.log(
          `[Agent] 完成! ${completedCount}/${totalSteps} 成功, ${failedCount} 失败`
        );
        enqueue(
          sseEvent('done', {
            totalSteps,
            completedSteps: completedCount,
            failedSteps: failedCount,
            summary: plan.summary,
          })
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[Agent] 整体错误:', errMsg);
        try {
          controller.enqueue(
            encoder.encode(sseEvent('error', { message: errMsg }))
          );
        } catch {
          /* 流可能已关闭 */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* 已经关闭 */
        }
      }
    },
    cancel() {
      streamController.abort();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
