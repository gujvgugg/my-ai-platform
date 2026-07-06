'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProjects, createProject, deleteProject } from '@/app/actions';
import { useConfirm, useToast } from './notifications';

interface Project {
  id: number;
  name: string;
  description: string | null;
  updatedAt: Date | null;
}

// 导航菜单项
const NAV_ITEMS = [
  { href: '/',           label: '仪表盘',   icon: '📊', exact: true },
  { href: '/kb',         label: '知识库',   icon: '📚' },
  { href: '/kb/test',    label: '检索测试', icon: '🔍' },
  { href: '/settings',   label: '系统设置', icon: '⚙️' },
];

export default function ProjectSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  // 当前项目 ID
  const activeProjectId = pathname.startsWith('/projects/')
    ? parseInt(pathname.split('/')[2], 10)
    : undefined;

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await getProjects());
    } catch {
      /* 静默 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // 监听空白对话页创建项目事件，及时刷新侧边栏
  useEffect(() => {
    const handler = () => {
      loadProjects();
    };
    window.addEventListener('project-created', handler);
    return () => window.removeEventListener('project-created', handler);
  }, [loadProjects]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim() || `项目 ${projects.length + 1}`;
    if (!name) return;
    try {
      await createProject(name);
      setNewName('');
      await loadProjects();
      showToast('项目已创建', 'success');
    } catch {
      showToast('创建失败', 'error');
    }
  }, [newName, projects.length, loadProjects, showToast]);

  const handleDelete = useCallback(async (id: number, name: string) => {
    const ok = await confirm({
      title: '删除项目',
      message: `确定删除「${name}」及其所有消息？`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteProject(id);
      await loadProjects();
      // 如果删除的是当前正在浏览的项目，跳转到空白对话页
      if (activeProjectId === id) {
        router.push('/projects/new');
      }
      showToast('已删除', 'success');
    } catch {
      showToast('删除失败', 'error');
    }
  }, [loadProjects, confirm, showToast, activeProjectId, router]);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-gray-50 border-r border-gray-200 flex flex-col h-full transition-all duration-200 shrink-0 relative z-0`}>
      {/* 头部 */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        {!collapsed && (
          <Link href="/" className="hover:opacity-80 transition">
            <h1 className="text-sm font-bold text-gray-800">AI 开发平台</h1>
            <p className="text-[10px] text-gray-400">全栈代码生成器</p>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-gray-600 text-xs p-1"
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* 主导航 */}
      <nav className="p-2 border-b border-gray-100">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition mb-0.5 ${
              isActive(item.href, item.exact)
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={collapsed ? item.label : undefined}
          >
            <span className="text-base shrink-0">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* 项目区域 */}
      {!collapsed && (
        <>
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">项目</span>
              <span className="text-xs text-gray-300">{projects.length}</span>
            </div>
            {/* 新对话按钮 */}
            <Link
              href="/projects/new"
              className={`flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg text-sm transition ${
                pathname === '/projects/new'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="text-base">💬</span>
              <span>新对话</span>
            </Link>
            <div className="flex gap-1 mt-1.5">
              <input
                className="flex-1 p-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="新建项目..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <button
                onClick={handleCreate}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1">
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : projects.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">暂无项目</p>
            ) : (
              <ul className="space-y-0.5">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/projects/${p.id}`}
                      className={`group flex items-center justify-between px-3 py-1.5 rounded text-sm transition ${
                        p.id === activeProjectId
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="truncate flex-1 text-xs">{p.name}</span>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(p.id, p.name); }}
                        className="ml-1 text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition"
                      >
                        ✕
                      </button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
