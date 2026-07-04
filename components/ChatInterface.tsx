'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport, UIMessage, isTextUIPart } from 'ai';
import { useState, useEffect, useRef, useCallback } from 'react';
import { saveMessage, saveGeneratedCode } from '@/app/actions';
import ModelSelector from './ModelSelector';
import CodeViewer from './CodeViewer';
import { parseCodeFiles } from '@/lib/parse-code';

/** 从 UIMessage 中提取纯文本内容 */
function getTextContent(message: UIMessage): string {
  return (
    message.parts
      ?.filter(isTextUIPart)
      .map((part) => part.text)
      .join('') || ''
  );
}

// ============================================================
// 组件
// ============================================================

interface Props {
  projectId: number;
  projectName?: string;
  initialMessages?: UIMessage[];
}

export default function ChatInterface({ projectId, projectName, initialMessages = [] }: Props) {
  const [input, setInput] = useState('');
  const [modelId, setModelId] = useState('deepseek-flash');

  const { messages, sendMessage, status } = useChat<UIMessage>({
    transport: new TextStreamChatTransport({
      api: '/api/chat',
    }),
    messages: initialMessages,
  });

  const savedIds = useRef<Set<string>>(new Set());

  // 将初始消息标记为已保存
  useEffect(() => {
    initialMessages.forEach((m) => savedIds.current.add(m.id));
  }, [initialMessages]);

  // 将新消息保存到数据库，并持久化生成的代码
  useEffect(() => {
    if (messages.length === 0 || status === 'streaming') return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || savedIds.current.has(lastMessage.id)) return;

    const textContent = getTextContent(lastMessage);
    if (!textContent || lastMessage.role === 'system') return;

    const formData = new FormData();
    formData.append('role', lastMessage.role);
    formData.append('content', textContent);
    formData.append('projectId', String(projectId));
    saveMessage(formData);
    savedIds.current.add(lastMessage.id);

    const { files, isCodeGen } = parseCodeFiles(textContent);
    if (isCodeGen && files.length > 0 && lastMessage.role === 'assistant') {
      saveGeneratedCode(projectId, files);
    }
  }, [messages, status, projectId]);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (input.trim()) {
        sendMessage({ text: input });
        setInput('');
      }
    },
    [input, sendMessage]
  );

  return (
    <div className="flex flex-col h-full">
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="text-4xl mb-4">💬</div>
            <p className="text-lg font-medium">开始对话</p>
            <p className="text-sm mt-1">
              描述你想要构建的应用，例如"创建一个登录页面"
            </p>
          </div>
        )}

        {messages.map((m) => {
          const content = getTextContent(m);
          const { files, isCodeGen } = parseCodeFiles(content);

          return (
            <div key={m.id} className="pb-4 border-b border-gray-100 last:border-0">
              <strong className="text-sm text-gray-500">
                {m.role === 'user' ? '👤 用户' : '🤖 AI'}
              </strong>

              {isCodeGen && files.length > 0 ? (
                <CodeViewer files={files} projectName={projectName} />
              ) : (
                <div className="mt-1 whitespace-pre-wrap text-gray-800">{content}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 输入区域 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 p-4 bg-white"
      >
        <div className="flex gap-2 items-center">
          <input
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={input}
            placeholder="描述你想构建的应用..."
            onChange={(e) => setInput(e.target.value)}
          />
          <ModelSelector selectedModelId={modelId} onSelect={setModelId} />
          <button
            type="submit"
            disabled={status === 'streaming'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
          >
            {status === 'streaming' ? '生成中...' : '发送'}
          </button>
        </div>
      </form>
    </div>
  );
}
