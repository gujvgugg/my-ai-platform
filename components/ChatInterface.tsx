'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport, UIMessage, isTextUIPart, isToolUIPart, getToolName } from 'ai';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { saveMessage, saveGeneratedCode } from '@/app/actions';
import { parseCodeFiles } from '@/lib/parse-code';
import { useToast } from './notifications';
import ModelSelector from './ModelSelector';
import CodeViewer from './CodeViewer';
import WorkflowViewer from './WorkflowViewer';

// ============================================================
// 类型
// ============================================================

interface Props {
  projectId: number;
  projectName?: string;
  initialMessages?: UIMessage[];
}

interface WorkflowStep {
  stepNumber: number;
  type: 'thinking' | 'tool-call' | 'tool-result' | 'done';
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  reasoning?: string;
}

// ============================================================
// 组件
// ============================================================

export default function ChatInterface({ projectId, projectName, initialMessages = [] }: Props) {
  const [input, setInput] = useState('');
  const [modelId, setModelId] = useState('deepseek-flash');
  const [agentMode, setAgentMode] = useState(false);
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const { showToast } = useToast();

  // Agent 模式用 /api/workflow，普通模式用 /api/chat
  const apiEndpoint = agentMode ? '/api/workflow' : '/api/chat';

  const { messages, sendMessage, status } = useChat<UIMessage>({
    transport: useMemo(
      () =>
        new TextStreamChatTransport({
          api: apiEndpoint,
          body: () => ({ modelId: modelIdRef.current }),
        }),
      [apiEndpoint]
    ),
    messages: initialMessages,
  });

  const savedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    initialMessages.forEach((m) => savedIds.current.add(m.id));
  }, [initialMessages]);

  useEffect(() => {
    if (messages.length === 0 || status === 'streaming') return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || savedIds.current.has(lastMessage.id)) return;

    const textContent = getTextContent(lastMessage);
    if (!textContent || lastMessage.role === 'system') return;

    const fd = new FormData();
    fd.append('role', lastMessage.role);
    fd.append('content', textContent);
    fd.append('projectId', String(projectId));
    saveMessage(fd).catch(() => {});
    savedIds.current.add(lastMessage.id);

    const { files, isCodeGen } = parseCodeFiles(textContent);
    if (isCodeGen && files.length > 0 && lastMessage.role === 'assistant') {
      saveGeneratedCode(projectId, files)
        .then(() => showToast(`已生成 ${files.length} 个文件`, 'success'))
        .catch(() => showToast('代码保存失败', 'error'));
    }
  }, [messages, status, projectId, showToast]);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (input.trim() && status !== 'streaming') {
        sendMessage({ text: input });
        setInput('');
      }
    },
    [input, sendMessage, status]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState agentMode={agentMode} />
        ) : (
          messages.map((m) => <ChatBubble key={m.id} message={m} agentMode={agentMode} />)
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 bg-white shrink-0">
        <div className="flex gap-2 items-center">
          {/* Agent 模式开关 */}
          <button
            type="button"
            onClick={() => setAgentMode(!agentMode)}
            className={`px-2.5 py-1.5 text-xs rounded-lg font-medium transition shrink-0 ${
              agentMode
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={agentMode ? 'Agent 模式：AI 可使用工具逐步完成任务' : '普通模式：直接对话'}
          >
            {agentMode ? '🤖 Agent' : '💬'}
          </button>
          <input
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={input}
            placeholder={
              agentMode
                ? '描述复杂任务，Agent 会分步执行...'
                : '描述你想构建的应用...'
            }
            onChange={(e) => setInput(e.target.value)}
            disabled={status === 'streaming'}
          />
          <ModelSelector selectedModelId={modelId} onSelect={setModelId} />
          <button
            type="submit"
            disabled={status === 'streaming'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm shrink-0"
          >
            {status === 'streaming' ? '...' : '发送'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================
// 子组件
// ============================================================

function EmptyState({ agentMode }: { agentMode: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 chat-message">
      <div className="text-4xl mb-4">{agentMode ? '🤖' : '💬'}</div>
      <p className="text-lg font-medium">{agentMode ? 'Agent 工作流模式' : '开始对话'}</p>
      <p className="text-sm mt-1">
        {agentMode
          ? 'Agent 会使用工具逐步完成任务，每步都可展开查看详情'
          : '描述你想要构建的应用，例如"创建一个登录页面"'}
      </p>
    </div>
  );
}

function ChatBubble({ message, agentMode }: { message: UIMessage; agentMode: boolean }) {
  const content = getTextContent(message);
  const { files, isCodeGen } =
    message.role === 'assistant' ? parseCodeFiles(content) : { files: [], isCodeGen: false };

  // 从消息部件中提取 Agent 步骤
  const agentSteps = useMemo(() => extractAgentSteps(message), [message]);

  return (
    <div className="pb-4 border-b border-gray-100 last:border-0 chat-message">
      <strong className="text-sm text-gray-500">
        {message.role === 'user' ? '👤 用户' : agentMode ? '🤖 Agent' : '🤖 AI'}
      </strong>

      {/* Agent 步骤可视化 */}
      {agentSteps.length > 0 && <WorkflowViewer steps={agentSteps} />}

      {/* 代码或纯文本 */}
      {isCodeGen && files.length > 0 ? (
        <CodeViewer files={files} projectName={undefined} />
      ) : content ? (
        <div className="mt-1 whitespace-pre-wrap text-gray-800">{content}</div>
      ) : null}
    </div>
  );
}

// ============================================================
// 工具函数
// ============================================================

function getTextContent(message: UIMessage): string {
  return (
    message.parts
      ?.filter(isTextUIPart)
      .map((p) => p.text)
      .join('') || ''
  );
}

/** 从 UIMessage 的 tool-call/tool-result 部件中提取 Agent 步骤 */
function extractAgentSteps(message: UIMessage): WorkflowStep[] {
  if (message.role !== 'assistant') return [];

  return message.parts
    .filter(isToolUIPart)
    .map((part, i) => {
      const toolName = getToolName(part);
      const state = (part as { state?: string }).state;
      const input = (part as { input?: unknown }).input;
      const output = (part as { output?: unknown }).output;

      let type: WorkflowStep['type'] = 'thinking';
      if (state === 'input-available' || state === 'input-streaming') type = 'tool-call';
      else if (state === 'output-available') type = 'tool-result';
      else if (state === 'output-error' || state === 'output-denied') type = 'done';

      return {
        stepNumber: i + 1,
        type,
        toolName,
        toolInput: input,
        toolOutput: output,
      };
    });
}
