'use client';

import { useState, useCallback, memo } from 'react';

// ============================================================
// 类型
// ============================================================

interface CodeFile {
  filePath: string;
  content: string;
}

interface Props {
  projectId: number;
  files: CodeFile[];
  projectName?: string;
}

// ============================================================
// 组件
// ============================================================

const AppPreview = memo(function AppPreview({ projectId, files, projectName }: Props) {
  const [previewKey, setPreviewKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const previewUrl = `/api/preview/${projectId}`;
  const hasPages = files.some(
    (f) => f.filePath.includes('page.tsx') || f.filePath.endsWith('.tsx')
  );

  const handleRefresh = useCallback(() => {
    setPreviewKey((k) => k + 1);
    setLoading(true);
    setError(null);
  }, []);

  const handleOpenNewWindow = useCallback(() => {
    window.open(previewUrl, '_blank', 'width=430,height=900');
  }, [previewUrl]);

  const handleIframeLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setLoading(false);
    setError('预览加载失败，请检查代码是否有语法错误');
  }, []);

  if (!hasPages) {
    return (
      <div className="border border-gray-200 rounded-xl p-6 text-center text-gray-400">
        <div className="text-3xl mb-2">📱</div>
        <p className="text-sm">暂无可预览的页面</p>
        <p className="text-xs mt-1">生成包含 .tsx 文件的代码后即可预览</p>
      </div>
    );
  }

  return (
    <div className={`border border-gray-200 rounded-xl overflow-hidden ${expanded ? 'fixed inset-4 z-50 bg-white shadow-2xl' : ''}`}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between bg-gray-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono truncate max-w-[180px]">
            📱 {projectName || '预览'}
          </span>
          {loading && (
            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition"
            title="刷新预览"
          >
            🔄
          </button>
          <button
            onClick={handleOpenNewWindow}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition"
            title="在新窗口打开"
          >
            🔗
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition"
            title={expanded ? '缩小' : '放大'}
          >
            {expanded ? '↙️' : '↗️'}
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="relative bg-white" style={{ height: expanded ? 'calc(100% - 36px)' : '450px' }}>
        {/* 加载遮罩 — 仅在 iframe 连接阶段显示 */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
            <div className="text-center w-64">
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-sm text-gray-500">正在连接预览服务...</p>
              <p className="text-xs text-gray-400 mt-1">加载完成后页面内会显示详细进度</p>
            </div>
          </div>
        )}

        {/* 错误展示 */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-10">
            <div className="text-center p-6 max-w-sm">
              <div className="text-2xl mb-2">⚠️</div>
              <p className="text-sm text-red-600 mb-1">{error}</p>
              <p className="text-xs text-red-400 mb-3">查看浏览器控制台 (F12) 了解详情</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {/* iframe 预览 */}
        <iframe
          key={previewKey}
          src={previewUrl}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms"
          title="应用预览"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      </div>
    </div>
  );
});

export default AppPreview;
