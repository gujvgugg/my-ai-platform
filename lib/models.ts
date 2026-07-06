import { createOpenAI } from '@ai-sdk/openai';
import { customProvider } from 'ai';
import { env } from './env';

// ============================================================
// 服务商实例
// ============================================================

const deepseekProvider = createOpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: env.DEEPSEEK_API_KEY,
});

const ollamaProvider = createOpenAI({
  baseURL: env.OLLAMA_BASE_URL,
  apiKey: 'ollama',
});

const openaiProvider = env.OPENAI_API_KEY
  ? createOpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

// ============================================================
// 服务商注册表
// ============================================================

export const modelRegistry = customProvider({
  languageModels: {
    // ——— DeepSeek ———
    'deepseek-flash': deepseekProvider.chat('deepseek-v4-flash'),   // 快速轻量
    'deepseek-pro': deepseekProvider.chat('deepseek-v4-pro'),       // 强力精准

    // ——— Ollama 本地 ———
    'ollama-qwen3': ollamaProvider.chat('qwen3'),
    'ollama-deepseek': ollamaProvider.chat('deepseek-coder'),
    'ollama-llama3': ollamaProvider.chat('llama3'),

    // ——— OpenAI ———
    ...(openaiProvider
      ? {
          'openai-gpt5-nano': openaiProvider.chat('gpt-5.4-nano'),
          'openai-gpt5-mini': openaiProvider.chat('gpt-5.4-mini'),
        }
      : {}),
  },
  embeddingModels: {
    'text-embedding-3-small': openaiProvider
      ? openaiProvider.embedding('text-embedding-3-small')
      : deepseekProvider.embedding('deepseek-embedding'),
  },
  fallbackProvider: deepseekProvider,
});

// ============================================================
// 模型信息（供 UI 展示）
// ============================================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  type: 'chat' | 'embedding';
  local: boolean;
}

export const availableModels: ModelInfo[] = [
  // DeepSeek 云端
  {
    id: 'deepseek-flash',
    name: 'DeepSeek Flash ⚡',
    provider: 'DeepSeek',
    type: 'chat',
    local: false,
  },
  {
    id: 'deepseek-pro',
    name: 'DeepSeek Pro 🧠',
    provider: 'DeepSeek',
    type: 'chat',
    local: false,
  },
  // Ollama 本地
  {
    id: 'ollama-deepseek',
    name: 'DeepSeek-Coder（本地）',
    provider: 'Ollama',
    type: 'chat',
    local: true,
  },
  {
    id: 'ollama-qwen3',
    name: 'Qwen 3（本地）',
    provider: 'Ollama',
    type: 'chat',
    local: true,
  },
  {
    id: 'ollama-llama3',
    name: 'Llama 3（本地）',
    provider: 'Ollama',
    type: 'chat',
    local: true,
  },
  // OpenAI
  ...(openaiProvider
    ? [
        { id: 'openai-gpt5-nano', name: 'GPT-5.4 Nano', provider: 'OpenAI', type: 'chat' as const, local: false },
        { id: 'openai-gpt5-mini', name: 'GPT-5.4 Mini', provider: 'OpenAI', type: 'chat' as const, local: false },
      ]
    : []),
];

/** 默认模型 — Flash 用于日常问答，代码生成建议切到 Pro */
export const defaultModel = 'deepseek-flash';

/**
 * 根据模型 ID 获取语言模型实例。
 */
export function getModel(modelId?: string) {
  const id = modelId || defaultModel;
  return modelRegistry.languageModel(id);
}
