'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { getProjects, createProject, deleteProject } from '@/app/actions';

interface Project {
  id: number;
  name: string;
  description: string | null;
  updatedAt: Date | null;
}

export default function ProjectSidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  // 从路径中提取当前项目的 ID
  const activeProjectId = pathname.startsWith('/projects/')
    ? parseInt(pathname.split('/')[2], 10)
    : undefined;

  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      console.error('加载项目列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim() || `项目 ${projects.length + 1}`;
    try {
      await createProject(name);
      setNewName('');
      await loadProjects();
    } catch (err) {
      console.error('创建项目失败:', err);
    }
  }, [newName, projects.length, loadProjects]);

  const handleDelete = useCallback(
    async (id: number) => {
      if (!confirm('确定要删除该项目及其所有聊天消息吗？')) return;
      try {
        await deleteProject(id);
        await loadProjects();
      } catch (err) {
        console.error('删除项目失败:', err);
      }
    },
    [loadProjects]
  );

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full relative z-0">
      {/* 头部 —— 点击返回仪表盘 */}
      <div className="p-4 border-b border-gray-200">
        <a href="/" className="block hover:opacity-80 transition">
          <h1 className="text-lg font-bold text-gray-800">AI 开发平台</h1>
          <p className="text-xs text-gray-500 mt-1">全栈代码生成器</p>
        </a>
      </div>

      {/* 新建项目输入框 */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex gap-1">
          <input
            className="flex-1 p-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="新项目名称..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            className="px-2.5 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
            title="创建项目"
          >
            +
          </button>
        </div>
      </div>

      {/* 项目列表 */}
      <nav className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">暂无项目</p>
        ) : (
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id}>
                <a
                  href={`/projects/${p.id}`}
                  className={`flex items-center justify-between px-3 py-2 rounded text-sm transition ${
                    p.id === activeProjectId
                      ? 'bg-blue-100 text-blue-800'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span className="truncate flex-1">{p.name}</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    className="ml-1 text-gray-400 hover:text-red-500 text-xs transition"
                    title="删除项目"
                  >
                    ✕
                  </button>
                </a>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
