'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('页面错误:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-semibold text-gray-800">出了点问题</h2>
        <p className="text-sm text-gray-500">
          {error.message || '发生了意外错误，请重试。'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          重试
        </button>
      </div>
    </div>
  );
}
