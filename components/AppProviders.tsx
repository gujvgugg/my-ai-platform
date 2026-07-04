'use client';

import { type ReactNode } from 'react';
import { ToastProvider, ConfirmProvider } from './notifications';

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
      </ConfirmProvider>
    </ToastProvider>
  );
}
