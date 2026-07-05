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
import AppPreview from './AppPreview';

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

interface CodeFile {
  filePath: string;
  content: string;
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
  const agentModeRef = useRef(agentMode);
  agentModeRef.current = agentMode;
  const { showToast } = useToast();

  // 预览状态
  const [showPreview, setShowPreview] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<CodeFile[]>([]);

  const apiEndpoint = agentMode ? '/api/workflow' : '/api/chat';

  // 切换模式时重置 useChat 内部状态
  const [modeKey, setModeKey] = useState(0);
  const handleToggleMode = useCallback(() => {
    setAgentMode((prev) => !prev);
    setModeKey((k) => k + 1);
  }, []);

  const { messages, sendMessage, status, error, regenerate } = useChat<UIMessage>({
    transport: useMemo(
      () =>
        new TextStreamChatTransport({
          api: apiEndpoint,
          body: () => ({
            modelId: modelIdRef.current,
            ...(agentModeRef.current ? { projectId } : {}),
          }),
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [apiEndpoint]
    ),
    messages: initialMessages,
    id: `chat-${modeKey}`,
  });

  const savedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    initialMessages.forEach((m) => savedIds.current.add(m.id));
  }, [initialMessages]);

  // 消息到达时保存到数据库，并提取代码文件用于预览
  useEffect(() => {
    if (messages.length === 0 || status === 'streaming') return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || savedIds.current.has(lastMessage.id)) return;
    if (lastMessage.role === 'system') return;

    const textContent = getTextContent(lastMessage);
    const toolParts = lastMessage.parts?.filter(isToolUIPart) || [];
    const hasToolCalls = toolParts.length > 0;

    const contentToSave = hasToolCalls
      ? `${textContent}\n__TOOL_PARTS__${JSON.stringify(toolParts)}`
      : textContent;

    if (contentToSave) {
      const fd = new FormData();
      fd.append('role', lastMessage.role);
      fd.append('content', contentToSave);
      fd.append('projectId', String(projectId));
      saveMessage(fd).catch((err) => console.error('保存消息失败:', err));
    }
    savedIds.current.add(lastMessage.id);

    // 解析代码文件
    const { files, isCodeGen } = parseCodeFiles(textContent);
    if (isCodeGen && files.length > 0 && lastMessage.role === 'assistant') {
      saveGeneratedCode(projectId, files)
        .then(() => showToast(`已生成 ${files.length} 个文件`, 'success'))
        .catch(() => showToast('代码保存失败', 'error'));

      // 如果生成的文件 >= 3 个（说明是完整应用），自动显示预览按钮
      setPreviewFiles(files);
    }
  }, [messages, status, projectId, showToast]);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (input.trim() && status !== 'streaming') {
        sendMessage({ text: input });
        setInput('');
        setShowPreview(false); // 新消息时隐藏预览
      }
    },
    [input, sendMessage, status]
  );

  const handleTogglePreview = useCallback(() => {
    setShowPreview((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* 主内容区：消息 + 可选预览 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between">
            <span>⚠️ {error.message || '请求失败'}</span>
            <button onClick={() => regenerate?.()} className="text-red-600 underline text-xs shrink-0 ml-3">
              重试
            </button>
          </div>
        )}
        {messages.length === 0 ? (
          <EmptyState agentMode={agentMode} />
        ) : (
          messages.map((m) => (
            <ChatBubble key={m.id} message={m} agentMode={agentMode} />
          ))
        )}

        {/* 预览面板 */}
        {showPreview && previewFiles.length > 0 && (
          <div className="mt-2">
            <AppPreview
              projectId={projectId}
              files={previewFiles}
              projectName={projectName}
            />
          </div>
        )}
      </div>

      {/* 底部输入栏 */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 bg-white shrink-0">
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={handleToggleMode}
            className={`px-2.5 py-1.5 text-xs rounded-lg font-medium transition shrink-0 ${
              agentMode
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={
              agentMode ? 'Agent 模式：AI 使用工具逐步完成任务' : '普通模式：直接对话'
            }
          >
            {agentMode ? '🤖 Agent' : '💬'}
          </button>
          {previewFiles.length >= 3 && (
            <button
              type="button"
              onClick={handleTogglePreview}
              className={`px-2.5 py-1.5 text-xs rounded-lg font-medium transition shrink-0 ${
                showPreview
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="预览生成的应用"
            >
              {showPreview ? '👁️ 预览中' : '📱 预览'}
            </button>
          )}
          <input
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={input}
            placeholder={
              agentMode
                ? '描述复杂任务，Agent 会分步执行...'
                : '描述你想构建的应用，例如"帮我生成一个待办事项管理应用，支持添加、编辑、删除和标记完成"...'
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
      <p className="text-sm mt-1 max-w-md text-center">
        {agentMode
          ? 'Agent 会使用工具逐步完成任务，每步都可展开查看详情'
          : '描述你想要构建的应用。例如：\n"帮我生成一个待办事项管理应用，支持添加、编辑、删除和标记完成"'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        <SuggestionChip text="生成一个待办事项管理应用" />
        <SuggestionChip text="生成一个博客系统" />
        <SuggestionChip text="生成一个简单的登录页面" />
        <SuggestionChip text="生成一个商品管理后台" />
      </div>
    </div>
  );
}

function SuggestionChip({ text }: { text: string }) {
  return (
    <span className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded-full border border-blue-100">
      {text}
    </span>
  );
}

function ChatBubble({ message, agentMode }: { message: UIMessage; agentMode: boolean }) {
  const content = getTextContent(message);
  const { files, isCodeGen } =
    message.role === 'assistant'
      ? parseCodeFiles(content)
      : { files: [], isCodeGen: false };
  const agentSteps = useMemo(() => extractAgentSteps(message), [message]);

  return (
    <div className="pb-4 border-b border-gray-100 last:border-0 chat-message">
      <strong className="text-sm text-gray-500">
        {message.role === 'user' ? '用户' : agentMode ? '🤖 Agent' : '🤖 AI'}
      </strong>
      {agentSteps.length > 0 && <WorkflowViewer steps={agentSteps} />}
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

function extractAgentSteps(message: UIMessage): WorkflowStep[] {
  if (message.role !== 'assistant') return [];
  return message.parts.filter(isToolUIPart).map((part, i) => {
    const toolName = getToolName(part);
    const state = (part as { state?: string }).state;
    const input = (part as { input?: unknown }).input;
    const output = (part as { output?: unknown }).output;
    let type: WorkflowStep['type'] = 'thinking';
    if (state === 'input-available' || state === 'input-streaming') type = 'tool-call';
    else if (state === 'output-available') type = 'tool-result';
    else if (state === 'output-error' || state === 'output-denied') type = 'done';
    return { stepNumber: i + 1, type, toolName, toolInput: input, toolOutput: output };
  });
}
