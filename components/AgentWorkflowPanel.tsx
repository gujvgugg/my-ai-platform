'use client';

/**
 * Agent Workflow Panel —— 展示 Agent 执行计划和实时步骤状态。
 *
 * 接收 SSE 事件流，渲染步骤列表，显示每个步骤的状态（pending/running/completed/error）。
 * 步骤可展开查看工具调用细节。
 */

import { useState, useEffect, useRef, useCallback, useReducer } from 'react';

// ============================================================
// 类型
// ============================================================

export interface PlanStep {
  id: number;
  title: string;
  description: string;
  expectedFiles: string[];
  category: string;
}

export interface Plan {
  summary: string;
  techStack: string[];
  steps: PlanStep[];
}

export interface ToolCall {
  toolName: string;
  input: unknown;
  output?: string;
}

interface StepState {
  id: number;
  title: string;
  description: string;
  category: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  messages: string[];
  toolCalls: ToolCall[];
  error?: string;
}

interface WorkflowState {
  plan: Plan | null;
  steps: StepState[];
  status: 'planning' | 'executing' | 'done' | 'error';
  summary: string;
  techStack: string[];
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  globalError?: string;
}

type WorkflowAction =
  | { type: 'progress'; message: string }
  | { type: 'plan'; plan: Plan }
  | { type: 'step_start'; stepId: number; title: string; description: string; category: string }
  | { type: 'progress_step'; stepId: number; message: string }
  | { type: 'tool_call'; stepId: number; toolName: string; input: unknown }
  | { type: 'tool_result'; stepId: number; toolName: string; output: string }
  | { type: 'step_complete'; stepId: number }
  | { type: 'step_error'; stepId: number; error: string }
  | { type: 'done'; totalSteps: number; completedSteps: number; failedSteps: number; summary: string }
  | { type: 'error'; message: string };

// ============================================================
// Reducer
// ============================================================

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'progress':
      return state.status === 'planning'
        ? { ...state, summary: action.message }
        : state;

    case 'plan': {
      const steps: StepState[] = action.plan.steps.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        category: s.category,
        status: 'pending' as const,
        messages: [],
        toolCalls: [],
      }));
      return {
        ...state,
        plan: action.plan,
        steps,
        summary: action.plan.summary,
        techStack: action.plan.techStack,
        totalSteps: steps.length,
        status: 'executing',
      };
    }

    case 'step_start':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === action.stepId ? { ...s, status: 'running' as const } : s
        ),
      };

    case 'progress_step':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === action.stepId
            ? { ...s, messages: [...s.messages, action.message] }
            : s
        ),
      };

    case 'tool_call':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === action.stepId
            ? {
                ...s,
                toolCalls: [...s.toolCalls, { toolName: action.toolName, input: action.input }],
              }
            : s
        ),
      };

    case 'tool_result':
      return {
        ...state,
        steps: state.steps.map((s) => {
          if (s.id !== action.stepId) return s;
          const toolCalls = [...s.toolCalls];
          const lastIdx = toolCalls.length - 1;
          if (lastIdx >= 0 && toolCalls[lastIdx].toolName === action.toolName) {
            toolCalls[lastIdx] = { ...toolCalls[lastIdx], output: action.output };
          }
          return { ...s, toolCalls };
        }),
      };

    case 'step_complete':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === action.stepId ? { ...s, status: 'completed' as const } : s
        ),
        completedSteps: state.completedSteps + 1,
      };

    case 'step_error':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === action.stepId
            ? { ...s, status: 'error' as const, error: action.error }
            : s
        ),
        failedSteps: state.failedSteps + 1,
      };

    case 'done':
      return {
        ...state,
        status: 'done',
        totalSteps: action.totalSteps,
        completedSteps: action.completedSteps,
        failedSteps: action.failedSteps,
        summary: action.summary || state.summary,
      };

    case 'error':
      return {
        ...state,
        status: 'error',
        globalError: action.message,
      };

    default:
      return state;
  }
}

// ============================================================
// 初始状态
// ============================================================

function createInitialState(): WorkflowState {
  return {
    plan: null,
    steps: [],
    status: 'planning',
    summary: '',
    techStack: [],
    totalSteps: 0,
    completedSteps: 0,
    failedSteps: 0,
  };
}

// ============================================================
// Props
// ============================================================

interface Props {
  /** SSE 流 URL */
  endpoint: string;
  /** 请求体 */
  body: Record<string, unknown>;
  /** 完成回调 */
  onDone?: (state: WorkflowState) => void;
  /** 错误回调 */
  onError?: (error: string) => void;
  /** 取消信号 */
  abortSignal?: AbortSignal;
}

// ============================================================
// 组件
// ============================================================

export default function AgentWorkflowPanel({
  endpoint,
  body,
  onDone,
  onError,
  abortSignal,
}: Props) {
  const [state, dispatch] = useReducer(workflowReducer, undefined, createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 解析 SSE 流
  const processStream = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    // 合并外部取消信号
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = (errData as { error?: string }).error || `HTTP ${res.status}`;
        dispatch({ type: 'error', message: msg });
        onError?.(msg);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        dispatch({ type: 'error', message: '无法读取响应流' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              processEvent(currentEvent, data);
            } catch {
              // 跳过无法解析的数据
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'error', message: msg });
      onError?.(msg);
    }
  }, [endpoint, body, onError, abortSignal]);

  // 处理单个 SSE 事件
  const processEvent = useCallback((eventType: string, data: Record<string, unknown>) => {
    switch (eventType) {
      case 'progress':
        // 带 stepId 的 progress 走 progress_step，否则是全局进度
        if (data.stepId != null) {
          dispatch({
            type: 'progress_step',
            stepId: data.stepId as number,
            message: data.message as string,
          });
        } else {
          dispatch({ type: 'progress', message: data.message as string });
        }
        break;

      case 'plan':
        dispatch({ type: 'plan', plan: data as unknown as Plan });
        break;

      case 'step_start':
        dispatch({
          type: 'step_start',
          stepId: data.stepId as number,
          title: data.title as string,
          description: data.description as string,
          category: data.category as string,
        });
        break;

      case 'tool_call':
        dispatch({
          type: 'tool_call',
          stepId: data.stepId as number,
          toolName: data.toolName as string,
          input: data.input,
        });
        break;

      case 'tool_result':
        dispatch({
          type: 'tool_result',
          stepId: data.stepId as number,
          toolName: data.toolName as string,
          output: (data.output as string) || '',
        });
        break;

      case 'step_complete':
        dispatch({ type: 'step_complete', stepId: data.stepId as number });
        break;

      case 'step_error':
        dispatch({
          type: 'step_error',
          stepId: data.stepId as number,
          error: (data.error as string) || '未知错误',
        });
        break;

      case 'done':
        dispatch({
          type: 'done',
          totalSteps: data.totalSteps as number,
          completedSteps: data.completedSteps as number,
          failedSteps: data.failedSteps as number,
          summary: (data.summary as string) || '',
        });
        // 用 ref 确保回调拿到最新状态
        onDone?.(stateRef.current);
        break;

      case 'error':
        dispatch({ type: 'error', message: data.message as string });
        onError?.(data.message as string);
        break;
    }
  }, [onDone, onError, state]);

  // 启动流
  useEffect(() => {
    processStream();
    return () => {
      abortRef.current?.abort();
    };
  }, [processStream]);

  // 切换展开
  const toggleStep = useCallback((stepId: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
    setAllExpanded(false);
  }, []);

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedSteps(new Set());
      setAllExpanded(false);
    } else {
      setExpandedSteps(new Set(state.steps.map((s) => s.id)));
      setAllExpanded(true);
    }
  }, [allExpanded, state.steps]);

  // 自动展开当前运行中的步骤
  useEffect(() => {
    const runningStep = state.steps.find((s) => s.status === 'running');
    if (runningStep) {
      setExpandedSteps((prev) => new Set(prev).add(runningStep.id));
    }
  }, [state.steps]);

  // ============================================================
  // 渲染
  // ============================================================

  const progress =
    state.totalSteps > 0
      ? Math.round((state.completedSteps / state.totalSteps) * 100)
      : 0;

  return (
    <div className="border border-purple-200 rounded-xl overflow-hidden bg-white">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-5 py-4 border-b border-purple-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-purple-800 flex items-center gap-2">
              <span>🤖 Agent 工作流</span>
              {state.status === 'planning' && (
                <span className="text-xs font-normal text-purple-500 animate-pulse">
                  规划中...
                </span>
              )}
              {state.status === 'executing' && (
                <span className="text-xs font-normal text-blue-500">
                  执行中 ({state.completedSteps}/{state.totalSteps})
                </span>
              )}
              {state.status === 'done' && state.failedSteps === 0 && (
                <span className="text-xs font-normal text-green-500">✅ 全部完成</span>
              )}
              {state.status === 'done' && state.failedSteps > 0 && (
                <span className="text-xs font-normal text-yellow-500">
                  ⚠️ {state.completedSteps}/{state.totalSteps} 成功，{state.failedSteps} 失败
                </span>
              )}
              {state.status === 'error' && (
                <span className="text-xs font-normal text-red-500">❌ 执行失败</span>
              )}
            </h3>
            {state.summary && (
              <p className="text-sm text-purple-600 mt-1">{state.summary}</p>
            )}
          </div>
          {state.steps.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-xs text-purple-500 hover:text-purple-700 underline shrink-0"
            >
              {allExpanded ? '收起全部' : '展开全部'}
            </button>
          )}
        </div>

        {/* 进度条 */}
        {state.totalSteps > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-purple-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 font-mono">{progress}%</span>
          </div>
        )}

        {/* 技术栈标签 */}
        {state.techStack.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {state.techStack.map((tech) => (
              <span
                key={tech}
                className="px-2 py-0.5 text-xs bg-white/70 text-purple-600 rounded-full border border-purple-200"
              >
                {tech}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 全局错误 */}
      {state.globalError && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
          ❌ {state.globalError}
        </div>
      )}

      {/* 步骤列表 */}
      <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
        {state.steps.length === 0 && state.status === 'planning' && (
          <div className="px-5 py-8 text-center">
            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">正在分析需求，生成执行计划...</p>
          </div>
        )}

        {state.steps.map((step, index) => (
          <StepItem
            key={step.id}
            step={step}
            index={index}
            isExpanded={expandedSteps.has(step.id)}
            onToggle={() => toggleStep(step.id)}
          />
        ))}
      </div>

      {/* 完成状态 */}
      {state.status === 'done' && (
        <div className="px-5 py-3 bg-green-50 border-t border-green-100 text-center">
          <p className="text-sm text-green-700 font-medium">
            ✅ Agent 执行完成 — 共 {state.totalSteps} 个步骤，
            {state.completedSteps} 成功{state.failedSteps > 0 ? `，${state.failedSteps} 失败` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 单个步骤项
// ============================================================

function StepItem({
  step,
  index,
  isExpanded,
  onToggle,
}: {
  step: StepState;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const categoryColors: Record<string, string> = {
    planning: 'bg-gray-100 text-gray-600',
    schema: 'bg-yellow-100 text-yellow-700',
    api: 'bg-green-100 text-green-700',
    pages: 'bg-blue-100 text-blue-700',
    components: 'bg-purple-100 text-purple-700',
    config: 'bg-gray-100 text-gray-600',
    review: 'bg-orange-100 text-orange-700',
    other: 'bg-gray-100 text-gray-600',
  };

  const categoryLabels: Record<string, string> = {
    planning: '规划',
    schema: '数据',
    api: 'API',
    pages: '页面',
    components: '组件',
    config: '配置',
    review: '审查',
    other: '其他',
  };

  return (
    <div className={`transition-colors ${step.status === 'running' ? 'bg-blue-50/50' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors"
      >
        {/* 状态图标 */}
        <div className="shrink-0 mt-0.5">
          {step.status === 'pending' && (
            <div className="w-5 h-5 rounded-full border-2 border-gray-200" />
          )}
          {step.status === 'running' && (
            <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          )}
          {step.status === 'completed' && (
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          {step.status === 'error' && (
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        {/* 步骤内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">{String(index + 1).padStart(2, '0')}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${categoryColors[step.category] || categoryColors.other}`}>
              {categoryLabels[step.category] || step.category}
            </span>
            <span
              className={`text-sm font-medium ${
                step.status === 'completed'
                  ? 'text-gray-500'
                  : step.status === 'running'
                    ? 'text-blue-700'
                    : step.status === 'error'
                      ? 'text-red-600'
                      : 'text-gray-400'
              }`}
            >
              {step.title}
            </span>
            {step.status === 'running' && (
              <span className="text-xs text-blue-400 animate-pulse ml-auto">执行中...</span>
            )}
            {step.status === 'error' && (
              <span className="text-xs text-red-400 ml-auto">失败</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-7 line-clamp-1">{step.description}</p>
        </div>

        {/* 展开/折叠 */}
        <div className="shrink-0 text-gray-300 text-xs mt-1">
          {isExpanded ? '▲' : '▼'}
        </div>
      </button>

      {/* 展开详情 */}
      {isExpanded && (
        <div className="px-4 pb-3 ml-12 space-y-2">
          {/* 步骤描述 */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
            <strong>📋 任务：</strong>
            {step.description}
          </div>

          {/* 错误信息 */}
          {step.error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3">
              <strong>❌ 错误：</strong>
              {step.error}
            </div>
          )}

          {/* 工具调用 */}
          {step.toolCalls.map((tc, i) => (
            <ToolCallItem key={i} toolCall={tc} index={i} />
          ))}

          {/* 文本输出 */}
          {step.messages.map((msg, i) => (
            <div key={i} className="text-xs text-gray-600 bg-blue-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-sans">{msg}</pre>
            </div>
          ))}

          {step.toolCalls.length === 0 && step.messages.length === 0 && step.status === 'running' && (
            <div className="text-xs text-gray-400 text-center py-2">等待工具调用...</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 工具调用项
// ============================================================

function ToolCallItem({ toolCall, index }: { toolCall: ToolCall; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const toolNameMap: Record<string, string> = {
    writeFile: '📝 写入文件',
    readFile: '📖 读取文件',
    listProjectFiles: '📂 列出文件',
    searchDocs: '🔍 搜索文档',
    searchCode: '💻 搜索代码',
  };

  const input_ = toolCall.input as Record<string, unknown> | undefined;
  const label = toolNameMap[toolCall.toolName] || `🔧 ${toolCall.toolName}`;
  const filePath = input_?.filePath as string | undefined;
  const hasOutput = toolCall.output != null && toolCall.output !== '';
  const outputIsDone = hasOutput && toolCall.output!.startsWith('✅');
  const outputIsError = hasOutput && toolCall.output!.startsWith('❌');

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center gap-2 text-xs hover:bg-gray-50 transition-colors"
      >
        <span
          className={`font-medium ${
            hasOutput ? (outputIsError ? 'text-red-600' : 'text-green-600') : 'text-yellow-600'
          }`}
        >
          {label}
        </span>
        {filePath && (
          <span className="text-gray-400 font-mono truncate">{filePath}</span>
        )}
        {hasOutput && (
          <span className={`ml-auto text-xs ${outputIsError ? 'text-red-400' : 'text-green-400'}`}>
            {outputIsDone ? '✅' : outputIsError ? '❌' : '📋'}
          </span>
        )}
        {!hasOutput && (
          <span className="ml-auto text-yellow-400 animate-pulse text-xs">⏳</span>
        )}
        <span className="text-gray-300">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {input_ && (
            <div>
              <strong className="text-xs text-gray-500">输入参数：</strong>
              <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-auto max-h-32">
                {JSON.stringify(input_, null, 2)}
              </pre>
            </div>
          )}
          {hasOutput && (
            <div>
              <strong className="text-xs text-gray-500">输出结果：</strong>
              <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-auto max-h-32 whitespace-pre-wrap font-sans">
                {toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
