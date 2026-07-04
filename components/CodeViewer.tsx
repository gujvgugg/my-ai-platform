'use client';

import { useState, useCallback } from 'react';

interface CodeFile {
  filePath: string;
  content: string;
}

interface Props {
  files: CodeFile[];
  projectName?: string;
}

export default function CodeViewer({ files, projectName = 'generated-code' }: Props) {
  const [selectedFile, setSelectedFile] = useState<string>(files[0]?.filePath || '');

  const activeFile = files.find((f) => f.filePath === selectedFile) || files[0];

  // 下载单个文件
  const downloadFile = useCallback((file: CodeFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filePath.split('/').pop() || 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="mt-2 border border-gray-300 rounded-lg overflow-hidden">
      {/* 文件标签栏 */}
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

      {/* 工具栏 */}
      <div className="flex items-center justify-between bg-gray-800 px-3 py-1.5">
        <span className="text-xs text-gray-400 font-mono truncate max-w-xs">
          {activeFile?.filePath}
        </span>
        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => {
              if (activeFile) navigator.clipboard.writeText(activeFile.content);
            }}
            className="text-xs text-gray-400 hover:text-white transition px-1.5 py-0.5"
            title="复制"
          >
            📋 复制
          </button>
          <button
            onClick={() => activeFile && downloadFile(activeFile)}
            className="text-xs text-gray-400 hover:text-white transition px-1.5 py-0.5"
            title="下载"
          >
            📥 下载
          </button>
        </div>
      </div>

      {/* 代码内容 */}
      <div className="bg-gray-900 text-gray-100 p-4 overflow-auto max-h-96">
        <pre className="text-sm font-mono whitespace-pre-wrap">
          {activeFile?.content || '// 暂无代码'}
        </pre>
      </div>
    </div>
  );
}
