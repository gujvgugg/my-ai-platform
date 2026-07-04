/**
 * 类型安全的环境变量访问。
 * 所有 process.env 读取都应通过此模块。
 */

function getRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`缺少必需的环境变量: ${key}`);
  }
  return value;
}

function getOptional(key: string): string | undefined {
  return process.env[key] || undefined;
}

export const env = {
  // 数据库
  DATABASE_URL: getRequired('DATABASE_URL'),

  // AI 服务商
  DEEPSEEK_API_KEY: getRequired('DEEPSEEK_API_KEY'),
  OPENAI_API_KEY: getOptional('OPENAI_API_KEY'),
  OLLAMA_BASE_URL: getOptional('OLLAMA_BASE_URL') || 'http://localhost:11434/v1',

  // Pinecone 向量数据库（RAG）
  PINECONE_API_KEY: getOptional('PINECONE_API_KEY'),
  PINECONE_INDEX: getOptional('PINECONE_INDEX') || 'my-ai-platform',

  // 管理员密钥
  ADMIN_SEED_SECRET: getOptional('ADMIN_SEED_SECRET') || 'dev-secret',
} as const;
