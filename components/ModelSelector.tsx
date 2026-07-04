'use client';

import { useState, useEffect } from 'react';
import type { ModelInfo } from '@/lib/models';

interface Props {
  selectedModelId: string;
  onSelect: (modelId: string) => void;
}

export default function ModelSelector({ selectedModelId, onSelect }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => {
        // 如果接口不可用，使用备用模型列表
        setModels([
          { id: 'deepseek-flash', name: 'DeepSeek Flash ⚡', provider: 'DeepSeek', type: 'chat', local: false },
          { id: 'deepseek-pro', name: 'DeepSeek Pro 🧠', provider: 'DeepSeek', type: 'chat', local: false },
        ]);
      });
  }, []);

  const selected = models.find((m) => m.id === selectedModelId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
        title="选择 AI 模型"
      >
        <span className="text-xs">🧠</span>
        <span className="text-gray-700">{selected?.name || selectedModelId}</span>
        <span className="text-gray-400 text-xs">▼</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 font-medium">选择模型</p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {/* 云端模型 */}
              <div className="px-2 pt-1">
                <p className="text-xs text-gray-400 px-2 pb-1">云端</p>
                {models
                  .filter((m) => !m.local)
                  .map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onSelect(m.id);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                        m.id === selectedModelId
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-gray-400">{m.provider}</div>
                    </button>
                  ))}
              </div>
              {/* 本地模型 */}
              {models.some((m) => m.local) && (
                <div className="px-2 pt-1 pb-1">
                  <p className="text-xs text-gray-400 px-2 pb-1">本地 (Ollama)</p>
                  {models
                    .filter((m) => m.local)
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          onSelect(m.id);
                          setOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                          m.id === selectedModelId
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-gray-400">{m.provider}</div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
