/**
 * RAG 测试知识库 — 包含极易识别的特征，用于验证 RAG 是否生效。
 * 如果 AI 生成的代码出现了这些特征，说明 RAG 检索成功。
 */

import { indexDocuments } from './indexer';
import { getVectorBackend } from '../pinecone';

export async function seedTestKnowledgeBase(): Promise<{ indexed: number; backend: string }> {
  const docs = [
    {
      content: `
# 项目强制 UI 规范（测试 RAG 专用）

## 颜色规则（必须遵守）
- 所有按钮背景色必须是 #FF6B35（橙色），悬停时变为 #FF8C5A
- 所有卡片背景色必须是 #FFF8F0（淡橙色），边框必须是 3px solid #FF6B35
- 页面主标题颜色必须是 #E84A22（深橙红），字号 32px
- 所有链接颜色必须是 #FF6B35，带下划线

## 圆角规则（必须遵守）
- 所有卡片圆角必须是 18px
- 所有按钮圆角必须是 25px（胶囊形）
- 所有输入框圆角必须是 12px

## 字体规则（必须遵守）
- 所有标题必须加 "【RAG已生效】" 前缀
- 页面底部必须有一行小字："本页面由 RAG 知识库增强生成"
- 所有按钮文字必须全部大写

## 间距规则
- 卡片之间间距 28px
- 卡片内边距 20px
- 页面最大宽度 900px
`.trim(),
      metadata: { topic: 'test', subtopic: 'rag-verify-style' },
    },
    {
      content: `
# 组件命名规则（RAG 测试标记）

## 函数/组件命名
生成的 React 组件必须以 "RagPowered" 开头命名，例如：
- export default function RagPoweredLoginPage() { ... }
- export default function RagPoweredDashboard() { ... }

## CSS 类名
所有自定义 CSS 类名必须以 "rag-" 开头，例如：
- className="rag-container"
- className="rag-button"
- className="rag-card"

## 注释标记
每个生成的文件头部必须包含注释：
// 此文件由 RAG 增强生成 | 生成时间: {当前时间}
`.trim(),
      metadata: { topic: 'test', subtopic: 'rag-verify-naming' },
    },
    {
      content: `
# 生成代码必须包含的元素（RAG 测试标记）

## 必须包含的 HTML 元素
1. 页面最顶部必须有一个醒目的横幅：<div class="rag-banner">🔍 RAG 知识库已生效 - 本页面使用了增强生成</div>
2. 横幅样式：背景 #FF6B35，文字白色，居中，padding 12px，圆角 8px
3. 页面最底部必须有：<footer class="rag-footer">📚 知识库检索时间: {Date.now()}</footer>

## 必须包含的 meta 标签
在 <head> 中添加：<meta name="generator" content="RAG-Enhanced-AI" />
`.trim(),
      metadata: { topic: 'test', subtopic: 'rag-verify-elements' },
    },
  ];

  const count = await indexDocuments(docs);
  console.log(`RAG 测试库已播种 ${count} 个块 (${getVectorBackend()})`);
  return { indexed: count, backend: getVectorBackend() };
}
