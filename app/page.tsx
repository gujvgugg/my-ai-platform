'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProjects, createProject, deleteProject } from './actions';
import { useToast, useConfirm } from '@/components/notifications';

interface Project {
  id: number;
  name: string;
  description: string | null;
  codeSnapshot: unknown;
  updatedAt: Date | null;
}

export default function HomePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [ragCount, setRagCount] = useState(0);
  const [ragFiles, setRagFiles] = useState<Array<{ fileName: string; chunkCount: number }>>([]);
  const [ragUploading, setRagUploading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await getProjects());
    } catch {
      showToast('加载项目列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const project = await createProject(name);
      setNewName('');
      await loadProjects();
      showToast(`项目「${project.name}」创建成功`, 'success');
      router.push(`/projects/${project.id}`);
    } catch {
      showToast('创建项目失败', 'error');
    } finally {
      setCreating(false);
    }
  }, [newName, loadProjects, router, showToast]);

  const handleDelete = useCallback(async (id: number, name: string) => {
    const ok = await confirm({
      title: '删除项目',
      message: `确定要删除「${name}」及其所有聊天记录吗？此操作不可撤销。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteProject(id);
      await loadProjects();
      showToast(`项目「${name}」已删除`, 'success');
    } catch {
      showToast('删除失败', 'error');
    }
  }, [loadProjects, confirm, showToast]);

  // RAG
  const loadRagStats = useCallback(async () => {
    try {
      const res = await fetch('/api/rag/upload');
      const data = await res.json();
      setRagCount(data.total || 0);
      setRagFiles(data.files || []);
    } catch { /* 静默 */ }
  }, []);

  useEffect(() => { loadRagStats(); }, [loadRagStats]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setRagUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch('/api/rag/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.indexed > 0) {
        showToast(`已索引 ${data.indexed} 个文件，共 ${data.total} 条`, 'success');
      }
      await loadRagStats();
    } catch {
      showToast('上传失败', 'error');
    } finally {
      setRagUploading(false);
      e.target.value = '';
    }
  }, [loadRagStats, showToast]);

  const handleTestSeed = useCallback(async () => {
    try {
      const res = await fetch('/api/rag/test-seed', { method: 'POST' });
      const data = await res.json();
      showToast(`测试库已播种 ${data.indexed} 条，去聊天中验证 RAG 是否生效`, 'success');
      await loadRagStats();
    } catch {
      showToast('播种失败', 'error');
    }
  }, [loadRagStats, showToast]);

  const handleSeedRag = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'dev-secret' }),
      });
      const data = await res.json();
      showToast(`已播种 ${data.indexed} 条知识 (${data.backend})`, 'success');
      await loadRagStats();
    } catch {
      showToast('播种失败', 'error');
    }
  }, [loadRagStats, showToast]);

  const handleClearRag = useCallback(async () => {
    const ok = await confirm({
      title: '清空知识库',
      message: '确定要清空所有已索引的知识文档吗？',
      confirmText: '清空',
      danger: true,
    });
    if (!ok) return;
    try {
      await fetch('/api/rag/upload', { method: 'DELETE' });
      setRagCount(0);
      setRagFiles([]);
      showToast('知识库已清空', 'success');
    } catch {
      showToast('清空失败', 'error');
    }
  }, [confirm, showToast]);

  const totalCodeFiles = useMemo(
    () => projects.reduce((s, p) => s + (Array.isArray(p.codeSnapshot) ? p.codeSnapshot.length : 0), 0),
    [projects]
  );

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      {/* 头部 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">仪表盘</h1>
        <p className="text-gray-500 mt-2">AI 原生全栈应用开发平台 — 用自然语言生成 Next.js 应用</p>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard value={projects.length} label="项目总数" color="blue" />
        <StatCard value={5} label="AI 模型" color="green" />
        <StatCard value={6} label="Agent 工具" color="purple" />
        <StatCard value={totalCodeFiles} label="生成文件" color="orange" />
      </div>

      {/* 快速创建 */}
      <CreateProjectCard
        newName={newName}
        setNewName={setNewName}
        creating={creating}
        onCreate={handleCreate}
      />

      {/* 知识库 */}
      <RagCard
        ragCount={ragCount}
        ragFiles={ragFiles}
        ragUploading={ragUploading}
        onUpload={handleFileUpload}
        onTestSeed={handleTestSeed}
        onSeed={handleSeedRag}
        onClear={handleClearRag}
      />

      {/* 项目列表 */}
      <ProjectList projects={projects} loading={loading} onDelete={handleDelete} />
    </div>
  );
}

// ============================================================
// 子组件（React.memo 优化渲染）
// ============================================================

const COLOR_CLASSES: Record<string, string> = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  purple: 'text-purple-600',
  orange: 'text-orange-600',
};

const StatCard = ({ value, label, color }: { value: number; label: string; color: string }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
    <div className={`text-2xl md:text-3xl font-bold ${COLOR_CLASSES[color] || 'text-gray-600'}`}>
      {value}
    </div>
    <div className="text-xs md:text-sm text-gray-500 mt-1">{label}</div>
  </div>
);

const CreateProjectCard = ({
  newName, setNewName, creating, onCreate,
}: {
  newName: string;
  setNewName: (v: string) => void;
  creating: boolean;
  onCreate: () => void;
}) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 mb-8">
    <h2 className="text-lg font-semibold text-gray-800 mb-3">快速创建项目</h2>
    <div className="flex gap-2">
      <input
        className="flex-1 p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        placeholder="输入项目名称，例如「博客系统」或「在线商城」..."
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onCreate()}
      />
      <button
        onClick={onCreate}
        disabled={creating || !newName.trim()}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium text-sm whitespace-nowrap"
      >
        {creating ? '创建中...' : '创建并进入 →'}
      </button>
    </div>
    <p className="text-xs text-gray-400 mt-2">创建后会自动跳转到项目聊天页面，直接开始对话生成代码</p>
  </div>
);

const RagCard = ({
  ragCount, ragFiles, ragUploading,
  onUpload, onTestSeed, onSeed, onClear,
}: {
  ragCount: number;
  ragFiles: Array<{ fileName: string; chunkCount: number }>;
  ragUploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTestSeed: () => void;
  onSeed: () => void;
  onClear: () => void;
}) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 mb-8">
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">知识库管理 (RAG)</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          上传文档后 AI 生成代码时会自动参考，已索引
          <span className="font-medium text-blue-600 mx-1">{ragCount}</span>条
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={onTestSeed} className="px-3 py-1.5 text-xs border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 transition font-medium">
          🧪 RAG 验证库
        </button>
        <button onClick={onSeed} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition">
          写入默认知识库
        </button>
        <button onClick={onClear} className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition">
          清空
        </button>
      </div>
    </div>

    <label className="block border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition">
      <input type="file" multiple accept=".txt,.md,.json,.ts,.tsx,.js,.jsx,.css,.html" onChange={onUpload} disabled={ragUploading} className="hidden" />
      {ragUploading ? (
        <div>
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">正在解析并索引...</p>
        </div>
      ) : (
        <div>
          <div className="text-2xl mb-2">📂</div>
          <p className="text-sm text-gray-600 font-medium">点击上传文档</p>
          <p className="text-xs text-gray-400 mt-1">支持 .txt .md .ts .tsx .json 等文本文件</p>
        </div>
      )}
    </label>

    {ragFiles.length > 0 && (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 mb-2">已索引文件：</p>
        <div className="flex flex-wrap gap-1.5">
          {ragFiles.map((f) => (
            <span key={f.fileName} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md border border-green-200" title={`${f.chunkCount} 个分块`}>
              📄 {f.fileName}
              <span className="text-green-400">×{f.chunkCount}</span>
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ProjectList = ({
  projects, loading, onDelete,
}: {
  projects: Project[];
  loading: boolean;
  onDelete: (id: number, name: string) => void;
}) => (
  <div>
    <h2 className="text-lg font-semibold text-gray-800 mb-3">
      项目列表
      {projects.length > 0 && <span className="text-sm font-normal text-gray-400 ml-2">({projects.length} 个)</span>}
    </h2>

    {loading ? (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ) : projects.length === 0 ? (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <div className="text-5xl mb-4">🚀</div>
        <p className="text-gray-600 font-medium">还没有项目</p>
        <p className="text-sm text-gray-400 mt-1">在上方输入项目名称，创建你的第一个项目</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {projects.map((p) => (
          <div key={p.id} className="group bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition">
            <Link href={`/projects/${p.id}`} className="block p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 truncate">{p.name}</div>
                  <div className="text-sm text-gray-400 mt-1 truncate">{p.description || '暂无描述'}</div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(p.id, p.name); }}
                  className="ml-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                  title="删除项目"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span>{Array.isArray(p.codeSnapshot) ? `${p.codeSnapshot.length} 个文件` : '暂无代码'}</span>
                <span>更新于 {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('zh-CN') : '未知'}</span>
              </div>
            </Link>
          </div>
        ))}
      </div>
    )}
  </div>
);
