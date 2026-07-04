'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport, UIMessage, isTextUIPart } from 'ai';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { saveMessage, saveGeneratedCode } from '@/app/actions';
import { parseCodeFiles } from '@/lib/parse-code';
import { useToast } from './notifications';
import ModelSelector from './ModelSelector';
import CodeViewer from './CodeViewer';

// ============================================================
// 类型
// ============================================================

interface Props {
  projectId: number;
  projectName?: string;
  initialMessages?: UIMessage[];
}

// ============================================================
// 组件
// ============================================================

export default function ChatInterface({ projectId, projectName, initialMessages = [] }: Props) {
  const [input, setInput] = useState('');
  const [modelId, setModelId] = useState('deepseek-flash');
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const { showToast } = useToast();

  const { messages, sendMessage, status } = useChat<UIMessage>({
    transport: useMemo(
      () =>
        new TextStreamChatTransport({
          api: '/api/chat',
          body: () => ({ modelId: modelIdRef.current }),
        }),
      []
    ),
    messages: initialMessages,
  });

  const savedIds = useRef<Set<string>>(new Set());

  // 标记初始消息
  useEffect(() => {
    initialMessages.forEach((m) => savedIds.current.add(m.id));
  }, [initialMessages]);

  // 持久化新消息和生成代码
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
    saveMessage(fd);
    savedIds.current.add(lastMessage.id);

    const { files, isCodeGen } = parseCodeFiles(textContent);
    if (isCodeGen && files.length > 0 && lastMessage.role === 'assistant') {
      saveGeneratedCode(projectId, files);
      showToast(`已生成 ${files.length} 个文件`, 'success');
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
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m) => <ChatBubble key={m.id} message={m} />)
        )}
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 bg-white shrink-0">
        <div className="flex gap-2 items-center">
          <input
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={input}
            placeholder="描述你想构建的应用..."
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 chat-message">
      <div className="text-4xl mb-4">💬</div>
      <p className="text-lg font-medium">开始对话</p>
      <p className="text-sm mt-1">描述你想要构建的应用，例如"创建一个登录页面"</p>
    </div>
  );
}

function ChatBubble({ message }: { message: UIMessage }) {
  const content = getTextContent(message);
  // 只解析 assistant 消息的代码输出，跳过用户消息
  const { files, isCodeGen } = message.role === 'assistant' ? parseCodeFiles(content) : { files: [], isCodeGen: false };

  return (
    <div className="pb-4 border-b border-gray-100 last:border-0 chat-message">
      <strong className="text-sm text-gray-500">
        {message.role === 'user' ? '👤 用户' : '🤖 AI'}
      </strong>

      {isCodeGen && files.length > 0 ? (
        <CodeViewer files={files} />
      ) : (
        <div className="mt-1 whitespace-pre-wrap text-gray-800">{content}</div>
      )}
    </div>
  );
}

// ============================================================
// 工具函数
// ============================================================

function getTextContent(message: UIMessage): string {
  return message.parts?.filter(isTextUIPart).map((p) => p.text).join('') || '';
}
