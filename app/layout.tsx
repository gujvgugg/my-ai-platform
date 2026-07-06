import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';
import { ProjectSidebar } from '@/components';
import AppProviders from '@/components/AppProviders';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AI 原生全栈应用开发平台',
  description: '基于 AI 驱动的全栈应用开发平台 —— 用自然语言生成 Next.js 应用',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex">
        <AppProviders>
          <ProjectSidebar />
          <main className="flex-1 overflow-y-auto relative z-10">{children}</main>
        </AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
