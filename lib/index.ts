// ============================================================
// 客户端安全模块（可在 Browser 端导入）
// ============================================================

// 基础设施
export { env } from './env';

// 类型定义
export type { CodeFile } from './code-gen';
export type { ModelInfo } from './models';

// 代码解析（纯前端，无服务端依赖）
export { parseCodeFiles, looksLikeCodeOutput } from './parse-code';

// ============================================================
// 注意：以下模块仅限服务端使用，请直接从子路径导入：
//   - '@/lib/db'          数据库
//   - '@/lib/schema'      ORM 表结构
//   - '@/lib/models'      模型注册
//   - '@/lib/gateway'     模型路由
//   - '@/lib/pinecone'    向量库（Node.js）
//   - '@/lib/embeddings'  嵌入向量（Node.js）
//   - '@/lib/code-gen'    代码生成（Node.js fs）
//   - '@/lib/stream'      流式传输（服务端）
//   - '@/lib/logger'      日志
//   - '@/lib/telemetry'   遥测
// ============================================================
