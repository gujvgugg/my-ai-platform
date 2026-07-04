'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = ++nextId;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]); // 最多5条
    setTimeout(() => removeToast(id), 3500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      {/* Toast 渲染区 */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium cursor-pointer
              animate-[slideIn_0.3s_ease-out] transition-all hover:opacity-90 max-w-sm
              ${t.type === 'success' ? 'bg-green-600 text-white' : ''}
              ${t.type === 'error'   ? 'bg-red-600 text-white' : ''}
              ${t.type === 'warning' ? 'bg-amber-500 text-white' : ''}
              ${t.type === 'info'    ? 'bg-gray-800 text-white' : ''}
            `}
          >
            {t.type === 'success' && '✅ '}
            {t.type === 'error'   && '❌ '}
            {t.type === 'warning' && '⚠️ '}
            {t.type === 'info'    && 'ℹ️ '}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
