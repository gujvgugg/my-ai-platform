'use client';

import { useState, useCallback, memo } from 'react';
import { useToast } from './notifications';

interface CodeFile {
  filePath: string;
  content: string;
}

interface Props {
  files: CodeFile[];
  projectName?: string;
}

const CodeViewer = memo(function CodeViewer({ files, projectName }: Props) {
  const [selectedFile, setSelectedFile] = useState<string>(files[0]?.filePath || '');
  const { showToast } = useToast();

  const activeFile = files.find((f) => f.filePath === selectedFile) || files[0];

  const handleCopy = useCallback(() => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.content);
      showToast('已复制到剪贴板', 'success');
    }
  }, [activeFile, showToast]);

  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.filePath.split('/').pop() || 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('下载完成', 'success');
  }, [activeFile, showToast]);

  return (
    <div className="mt-2 border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-1 bg-gray-100 p-2 border-b border-gray-300 items-center">
        {files.map((f) => (
          <button
            key={f.filePath}
            onClick={() => setSelectedFile(f.filePath)}
            className={`px-3 py-1 text-xs rounded-full transition ${
              selectedFile === f.filePath
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f.filePath.split('/').pop()}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between bg-gray-800 px-3 py-1.5">
        <span className="text-xs text-gray-400 font-mono truncate max-w-xs">{activeFile?.filePath}</span>
        <div className="flex gap-1.5 items-center">
          <button onClick={handleCopy} className="text-xs text-gray-400 hover:text-white transition px-1.5 py-0.5" title="复制">
            📋 复制
          </button>
          <button onClick={handleDownload} className="text-xs text-gray-400 hover:text-white transition px-1.5 py-0.5" title="下载">
            📥 下载
          </button>
        </div>
      </div>

      <div className="bg-gray-900 text-gray-100 p-4 overflow-auto max-h-96">
        <pre className="text-sm font-mono whitespace-pre-wrap">
          {activeFile?.content || '// 暂无代码'}
        </pre>
      </div>
    </div>
  );
});

export default CodeViewer;
