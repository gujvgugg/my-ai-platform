'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/notifications';

interface HealthInfo {
  status: string;
  services: Record<string, string>;
  models: { count: number; default: string };
  ai: { totalCalls: number; successRate: number; avgLatencyMs: number; totalTokens: number };
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">系统设置</h1>

      {/* 服务状态 */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">服务状态</h2>
        {health ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatusBadge label="API 服务" status={health.status === 'ok' ? 'ok' : 'error'} />
            <StatusBadge label="数据库" status={health.services?.dbRaw === 'ok' ? 'ok' : 'error'} />
            <StatusBadge label="向量库" status={health.services?.vectorDB?.includes('内存') ? 'local' : 'cloud'} text={health.services?.vectorDB} />
            <StatusBadge label="嵌入模型" status={health.services?.embeddings?.includes('本地') ? 'local' : 'cloud'} text={health.services?.embeddings} />
          </div>
        ) : (
          <div className="animate-pulse text-sm text-gray-400">加载中...</div>
        )}
      </section>

      {/* AI 使用统计 */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">AI 调用统计</h2>
        {health ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat label="总调用次数" value={health.ai.totalCalls} />
            <MiniStat label="成功率" value={`${health.ai.successRate}%`} />
            <MiniStat label="平均延迟" value={`${health.ai.avgLatencyMs}ms`} />
            <MiniStat label="Token 消耗" value={health.ai.totalTokens.toLocaleString()} />
          </div>
        ) : (
          <div className="animate-pulse text-sm text-gray-400">加载中...</div>
        )}
      </section>

      {/* 模型信息 */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">模型配置</h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p>可用模型: {health?.models.count || '-'} 个</p>
          <p>默认模型: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{health?.models.default}</code></p>
          <p className="text-xs text-gray-400 mt-2">
            模型配置通过环境变量管理，详见 .env.example 文件
          </p>
        </div>
      </section>

      {/* 快捷操作 */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-4">快捷操作</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              await fetch('/api/admin/seed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: 'dev-secret' }),
              });
              showToast('已播种默认知识库', 'success');
            }}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            播种知识库
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.origin);
              showToast('已复制地址', 'success');
            }}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            复制站点地址
          </button>
          <button
            onClick={() => { window.location.href = '/api/health'; }}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            查看健康检查 JSON
          </button>
        </div>
      </section>
    </div>
  );
}

// 子组件
function StatusBadge({ label, status, text }: { label: string; status: string; text?: string }) {
  const color = status === 'ok' ? 'green' : status === 'cloud' ? 'blue' : status === 'local' ? 'amber' : 'red';
  const dot = status === 'ok' || status === 'cloud' ? '🟢' : status === 'local' ? '🟡' : '🔴';
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <span>{dot}</span>
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <p className="text-xs text-gray-400 mt-1 ml-6">{text || (status === 'ok' ? '正常' : '异常')}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-blue-600">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
