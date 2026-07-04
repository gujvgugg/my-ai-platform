'use client';

import { useState } from 'react';

interface WorkflowStep {
  stepNumber: number;
  type: 'thinking' | 'tool-call' | 'tool-result' | 'done';
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  reasoning?: string;
}

interface Props {
  steps: WorkflowStep[];
}

export default function WorkflowViewer({ steps }: Props) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (steps.length === 0) return null;

  return (
    <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
      <div className="bg-blue-50 px-4 py-2 border-b border-blue-200">
        <h3 className="text-sm font-medium text-blue-800">
          🔧 Agent 工作流 — {steps.length} 步骤
        </h3>
      </div>
      <div className="divide-y divide-gray-100">
        {steps.map((step, i) => (
          <div key={i} className="px-4 py-2">
            <button
              onClick={() => setExpandedStep(expandedStep === i ? null : i)}
              className="w-full text-left flex items-center gap-2 text-sm"
            >
              <span className="text-xs text-gray-400 font-mono">
                {String(step.stepNumber).padStart(2, '0')}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  step.type === 'tool-call'
                    ? 'bg-yellow-100 text-yellow-700'
                    : step.type === 'tool-result'
                      ? 'bg-green-100 text-green-700'
                      : step.type === 'done'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                }`}
              >
                {step.type === 'tool-call'
                  ? `工具调用: ${step.toolName || '未知'}`
                  : step.type === 'tool-result'
                    ? '执行结果'
                    : step.type === 'done'
                      ? '完成'
                      : '思考中...'}
              </span>
              <span className="text-xs text-gray-400 ml-auto">
                {expandedStep === i ? '▲' : '▼'}
              </span>
            </button>
            {expandedStep === i && (
              <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2 max-h-48 overflow-auto">
                {step.reasoning && (
                  <div className="mb-2">
                    <strong>推理过程:</strong>
                    <pre className="whitespace-pre-wrap mt-1">{step.reasoning}</pre>
                  </div>
                )}
                {step.toolInput != null && (
                  <div className="mb-2">
                    <strong>输入:</strong>
                    <pre className="whitespace-pre-wrap mt-1">
                      {JSON.stringify(step.toolInput, null, 2)}
                    </pre>
                  </div>
                )}
                {step.toolOutput != null && (
                  <div>
                    <strong>输出:</strong>
                    <pre className="whitespace-pre-wrap mt-1">
                      {typeof step.toolOutput === 'string'
                        ? step.toolOutput
                        : JSON.stringify(step.toolOutput, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
