'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/notifications';

interface TestResult {
  score: number;
  content: string;
  source: string;
}

export default function RetrievalTestPage() {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(3);
  const [results, setResults] = useState<TestResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [meta, setMeta] = useState<Record<string, unknown>>({});

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/rag/test?q=${encodeURIComponent(query)}&topK=${topK}`);
      const data = await res.json();
      setResults(data.results || []);
      setMeta({ found: data.found, backend: data.backend, embeddings: data.embeddings, elapsedMs: data.elapsedMs, totalDocs: data.totalDocs });
      if (data.found === 0) showToast('未检索到匹配结果', 'warning');
    } catch {
      showToast('检索失败', 'error');
    } finally {
      setSearching(false);
    }
  }, [query, topK, showToast]);

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">检索测试</h1>
      <p className="text-sm text-gray-500 mb-6">调试 RAG 检索效果，查看命中的知识库内容</p>

      {/* 搜索区 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex gap-3 mb-3">
          <input
            className="flex-1 p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="输入测试查询，例如：如何创建 Server Action"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm font-medium"
          >
            {searching ? '检索中...' : '检索'}
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <label className="flex items-center gap-2">
            Top-K:
            <input
              type="range" min="1" max="10" value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="w-24"
            />
            <span className="font-mono">{topK}</span>
          </label>
          {meta.found !== undefined && (
            <span>返回 {meta.found as number} 条 · 耗时 {meta.elapsedMs as number}ms · 后端: {meta.backend as string}</span>
          )}
        </div>
      </div>

      {/* 结果区 */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-gray-400">#{i + 1}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  r.score > 0.5 ? 'bg-green-100 text-green-700' :
                  r.score > 0.3 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  相似度: {r.score.toFixed(4)}
                </span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  {r.source}
                </span>
              </div>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                {r.content}
              </pre>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !searching && meta.found !== undefined && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <p>未检索到匹配结果</p>
          <p className="text-sm mt-1">尝试换个关键词或先播种知识库</p>
        </div>
      )}
    </div>
  );
}
