'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProjects, createProject, deleteProject } from './actions';

// ============================================================
// 类型
// ============================================================

interface Project {
  id: number;
  name: string;
  description: string | null;
  codeSnapshot: unknown;
  updatedAt: Date | null;
}

// ============================================================
// 仪表盘首页
// ============================================================

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [ragCount, setRagCount] = useState(0);
  const [ragFiles, setRagFiles] = useState<Array<{ fileName: string; chunkCount: number }>>([]);
  const [ragUploading, setRagUploading] = useState(false);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      console.error('加载项目失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 创建项目
  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const project = await createProject(name);
      setNewName('');
      await loadProjects();
      // 创建后直接跳转到项目聊天页
      router.push(`/projects/${project.id}`);
    } catch (err) {
      console.error('创建项目失败:', err);
    } finally {
      setCreating(false);
    }
  }, [newName, loadProjects, router]);

  // RAG — 加载索引数量及文件列表
  const loadRagStats = useCallback(async () => {
    try {
      const res = await fetch('/api/rag/upload');
      const data = await res.json();
      setRagCount(data.total || 0);
      setRagFiles(data.files || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadRagStats(); }, [loadRagStats]);

  // RAG — 上传文件
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setRagUploading(true);
    try {
      const formData = new FormData();
      for (const f of files) formData.append('files', f);
      const res = await fetch('/api/rag/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.indexed > 0) {
        alert(`已索引 ${data.indexed} 个文件，向量库共 ${data.total} 条`);
      }
      await loadRagStats();
    } catch (err) {
      alert('上传失败');
    } finally {
      setRagUploading(false);
      e.target.value = '';
    }
  }, [loadRagStats]);

  // RAG — 播种测试知识库（用于验证 RAG 是否生效）
  const handleTestSeed = useCallback(async () => {
    try {
      const res = await fetch('/api/rag/test-seed', { method: 'POST' });
      const data = await res.json();
      alert(`测试库已播种 ${data.indexed} 条 (${data.backend})。去聊天中输入"生成一个登录页面"验证 RAG 是否生效`);
      await loadRagStats();
    } catch { alert('播种失败'); }
  }, [loadRagStats]);

  // RAG — 播种默认知识库
  const handleSeedRag = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'dev-secret' }),
      });
      const data = await res.json();
      alert(`已播种 ${data.indexed} 条知识 (${data.backend})`);
      await loadRagStats();
    } catch { alert('播种失败'); }
  }, [loadRagStats]);

  // RAG — 清空知识库
  const handleClearRag = useCallback(async () => {
    if (!confirm('确定要清空所有已索引的知识文档吗？')) return;
    try {
      await fetch('/api/rag/upload', { method: 'DELETE' });
      setRagCount(0);
      alert('已清空');
    } catch { alert('清空失败'); }
  }, []);

  // 删除项目
  const handleDelete = useCallback(
    async (id: number, name: string) => {
      if (!confirm(`确定要删除「${name}」及其所有聊天记录吗？`)) return;
      try {
        await deleteProject(id);
        await loadProjects();
      } catch (err) {
        console.error('删除项目失败:', err);
      }
    },
    [loadProjects]
  );

  // 统计数据
  const totalCodeFiles = projects.reduce(
    (sum, p) => sum + (Array.isArray(p.codeSnapshot) ? p.codeSnapshot.length : 0),
    0
  );

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      {/* 头部 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">仪表盘</h1>
        <p className="text-gray-500 mt-2">AI 原生全栈应用开发平台 — 用自然语言生成 Next.js 应用</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold text-blue-600">{projects.length}</div>
          <div className="text-xs md:text-sm text-gray-500 mt-1">项目总数</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold text-green-600">5</div>
          <div className="text-xs md:text-sm text-gray-500 mt-1">AI 模型</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold text-purple-600">5</div>
          <div className="text-xs md:text-sm text-gray-500 mt-1">Agent 工具</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold text-orange-600">{totalCodeFiles}</div>
          <div className="text-xs md:text-sm text-gray-500 mt-1">生成文件</div>
        </div>
      </div>

      {/* 快速创建 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">快速创建项目</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="输入项目名称，例如「博客系统」或「在线商城」..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium text-sm whitespace-nowrap"
          >
            {creating ? '创建中...' : '创建并进入 →'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">创建后会自动跳转到项目聊天页面，直接开始对话生成代码</p>
      </div>

      {/* 知识库管理 */}
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
            <button
              onClick={handleTestSeed}
              className="px-3 py-1.5 text-xs border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 transition font-medium"
              title="播种 RAG 测试知识库，用于验证 RAG 是否生效"
            >
              🧪 RAG 验证库
            </button>
            <button
              onClick={handleSeedRag}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              title="写入默认的 Next.js 知识文档"
            >
              写入默认知识库
            </button>
            <button
              onClick={handleClearRag}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition"
            >
              清空
            </button>
          </div>
        </div>

        {/* 上传区域 */}
        <label className="block border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition">
          <input
            type="file"
            multiple
            accept=".txt,.md,.json,.ts,.tsx,.js,.jsx,.css,.html"
            onChange={handleFileUpload}
            disabled={ragUploading}
            className="hidden"
          />
          {ragUploading ? (
            <div>
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">正在解析并索引...</p>
            </div>
          ) : (
            <div>
              <div className="text-2xl mb-2">📂</div>
              <p className="text-sm text-gray-600 font-medium">点击上传文档</p>
              <p className="text-xs text-gray-400 mt-1">
                支持 .txt .md .ts .tsx .json 等文本文件
              </p>
            </div>
          )}
        </label>

        {/* 已上传文件列表 */}
        {ragFiles.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">已索引文件：</p>
            <div className="flex flex-wrap gap-1.5">
              {ragFiles.map((f) => (
                <span
                  key={f.fileName}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md border border-green-200"
                  title={`${f.chunkCount} 个分块`}
                >
                  📄 {f.fileName}
                  <span className="text-green-400">×{f.chunkCount}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 项目列表 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          项目列表
          {projects.length > 0 && (
            <span className="text-sm font-normal text-gray-400 ml-2">({projects.length} 个)</span>
          )}
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
              <div
                key={p.id}
                className="group bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition"
              >
                <Link href={`/projects/${p.id}`} className="block p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{p.name}</div>
                      <div className="text-sm text-gray-400 mt-1 truncate">
                        {p.description || '暂无描述'}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(p.id, p.name);
                      }}
                      className="ml-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                      title="删除项目"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                    <span>
                      {Array.isArray(p.codeSnapshot) ? `${p.codeSnapshot.length} 个文件` : '暂无代码'}
                    </span>
                    <span>
                      更新于 {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('zh-CN') : '未知'}
                    </span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
