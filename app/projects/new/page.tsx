'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '@/app/actions';
import { useToast } from '@/components/notifications';

export default function NewProjectPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || loading) return;

      setLoading(true);
      try {
        // 用用户第一条消息的前 50 字符作为项目名称
        const name =
          text.slice(0, 50).replace(/\n/g, ' ') +
          (text.length > 50 ? '...' : '');
        const project = await createProject(name);

        // 通知侧边栏刷新项目列表
        window.dispatchEvent(
          new CustomEvent('project-created', { detail: project })
        );

        // 跳转到真实项目页，firstMessage 携带用户输入
        router.push(
          `/projects/${project.id}?firstMessage=${encodeURIComponent(text)}`
        );
      } catch {
        showToast('创建项目失败', 'error');
        setLoading(false);
      }
    },
    [input, loading, router, showToast]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-4xl mb-4">💬</div>
        <h2 className="text-lg font-medium text-gray-800 mb-1">新对话</h2>
        <p className="text-sm text-gray-400 mb-8 max-w-md text-center">
          描述你想要构建的应用，AI 将帮你生成代码
        </p>
        <form onSubmit={handleSubmit} className="w-full max-w-xl">
          <div className="flex gap-2">
            <input
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={input}
              placeholder='例如："帮我生成一个待办事项管理应用"'
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm font-medium shrink-0"
            >
              {loading ? '创建中...' : '发送'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
