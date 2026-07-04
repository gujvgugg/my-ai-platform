// ============================================================
// 基础设施
// ============================================================
export { env } from './env';
export { db } from './db';

// ============================================================
// 数据模型
// ============================================================
export { users, projects, messages, schema } from './schema';

// ============================================================
// 模型管理
// ============================================================
export { modelRegistry, availableModels, defaultModel, getModel } from './models';
export type { ModelInfo } from './models';
export { routeModel, getFallbackModel } from './gateway';
export type { RoutingDecision } from './gateway';

// ============================================================
// 代码生成
// ============================================================
export {
  parseCodeFromText,
  validateFilePath,
  writeCodeToDisk,
  readCodeFromDisk,
  persistGeneratedCode,
} from './code-gen';
export type { CodeFile } from './code-gen';
export { parseCodeFiles, looksLikeCodeOutput } from './parse-code';

// ============================================================
// 流式传输
// ============================================================
export { createStructuredStream, dbMessagesToUI } from './stream';

// ============================================================
// 嵌入向量
// ============================================================
export { embedText, embedTexts, similarity, isUsingLocalEmbeddings } from './embeddings';

// ============================================================
// 向量存储
// ============================================================
export {
  upsertVectors,
  queryVectors,
  deleteVectors,
  isPineconeAvailable,
  getVectorBackend,
} from './pinecone';
export { memoryVectorStore } from './vector-store';

// ============================================================
// 监控
// ============================================================
export { logger } from './logger';
export { recordAICall, getAICallStats } from './telemetry';
export type { AICallMetrics } from './telemetry';

// ============================================================
// 子模块（按需导入，避免循环依赖）
// ============================================================
// - rag/    → import from '@/lib/rag'
// - tools/  → import from '@/lib/tools'
// - agent/  → import from '@/lib/agent'
// - mcp/    → import from '@/lib/mcp'
