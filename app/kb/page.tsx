'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast, useConfirm } from '@/components/notifications';

interface DocFile {
  fileName: string;
  chunkCount: number;
}

export default function KnowledgeBasePage() {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [files, setFiles] = useState<DocFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [backend, setBackend] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/rag/upload');
      const data = await res.json();
      setFiles(data.files || []);
      setTotal(data.total || 0);
    } catch {
      /* 静默 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // 同时加载健康信息获取后端类型
  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(d => {
      setBackend(d.vectorDB || d.services?.vectorDB || '');
    }).catch(() => {});
  }, []);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fls = e.target.files;
    if (!fls || fls.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of fls) fd.append('files', f);
      const res = await fetch('/api/rag/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.indexed > 0) showToast(`已索引 ${data.indexed} 个文件，共 ${data.total} 条`, 'success');
      if (data.skipped) showToast(`跳过: ${data.skipped.join(', ')}`, 'warning');
      await loadStats();
    } catch {
      showToast('上传失败', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [loadStats, showToast]);

  const handleClear = useCallback(async () => {
    const ok = await confirm({ title: '清空知识库', message: '确定清空全部索引？', confirmText: '清空', danger: true });
    if (!ok) return;
    await fetch('/api/rag/upload', { method: 'DELETE' });
    setFiles([]);
    setTotal(0);
    showToast('已清空', 'success');
  }, [confirm, showToast]);

  const handleSeed = useCallback(async () => {
    const res = await fetch('/api/admin/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: 'dev-secret' }),
    });
    const data = await res.json();
    showToast(`已播种 ${data.indexed} 条`, 'success');
    await loadStats();
  }, [loadStats, showToast]);

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">知识库管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            向量后端: {backend || '加载中...'} · 共 {total} 条索引
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSeed} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            写入默认知识库
          </button>
          <button onClick={handleClear} className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition">
            清空全部
          </button>
        </div>
      </div>

      {/* 上传区 */}
      <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition mb-6">
        <input type="file" multiple accept=".txt,.md,.json,.ts,.tsx,.js,.jsx,.css,.html" onChange={handleUpload} disabled={uploading} className="hidden" />
        {uploading ? (
          <div>
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500">正在解析并索引...</p>
          </div>
        ) : (
          <div>
            <div className="text-3xl mb-3">📂</div>
            <p className="text-gray-700 font-medium">拖拽文档到此处或点击上传</p>
            <p className="text-sm text-gray-400 mt-1">支持 .txt .md .ts .tsx .json 等文本文件</p>
          </div>
        )}
      </label>

      {/* 文件列表 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-medium text-gray-700 text-sm">
            已索引文档 {files.length > 0 && `(${files.length} 个文件, ${total} 个分块)`}
          </h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">📭</div>
            <p>暂无已索引文档</p>
            <p className="text-sm mt-1">上传文档或点击「写入默认知识库」开始</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📄</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{f.fileName}</p>
                    <p className="text-xs text-gray-400">{f.chunkCount} 个分块</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-full">已索引</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
