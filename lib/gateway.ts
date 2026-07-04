/**
 * 网关路由 —— 智能模型选择与自动降级。
 *
 * 策略:
 * 1. 优先尝试用户请求的模型
 * 2. 如果不可用（如 Ollama 未运行），降级到 DeepSeek 云端
 * 3. 如果 DeepSeek 失败，尝试 OpenAI（如果已配置）
 */

import { availableModels, getModel, defaultModel } from './models';

export interface RoutingDecision {
  modelId: string;
  provider: string;
  reason: 'requested' | 'fallback_local_unavailable' | 'fallback_cloud' | 'default';
}

/**
 * 确定使用哪个模型，包含降级逻辑。
 */
export function routeModel(requestedModelId?: string): RoutingDecision {
  if (!requestedModelId) {
    return { modelId: defaultModel, provider: 'DeepSeek', reason: 'default' };
  }

  const model = availableModels.find((m) => m.id === requestedModelId);
  if (!model) {
    return { modelId: defaultModel, provider: 'DeepSeek', reason: 'default' };
  }

  return { modelId: requestedModelId, provider: model.provider, reason: 'requested' };
}

/**
 * 获取当前模型的下一个降级备选模型。
 */
export function getFallbackModel(currentModelId: string): string {
  // 本地模型失败 → 降级到 DeepSeek
  if (currentModelId.startsWith('ollama-')) {
    return 'deepseek-flash';
  }
  // DeepSeek 失败 → 尝试 OpenAI
  if (currentModelId.startsWith('deepseek-')) {
    const openaiModel = availableModels.find((m) => m.id.startsWith('openai-'));
    return openaiModel?.id || defaultModel;
  }
  return defaultModel;
}
