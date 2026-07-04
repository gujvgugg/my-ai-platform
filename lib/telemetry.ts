/**
 * AI 调用遥测追踪。
 * 记录模型使用量、Token 消耗和延迟，用于监控。
 */

import { logger } from './logger';

export interface AICallMetrics {
  modelId: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  success: boolean;
  error?: string;
  isCodeGen?: boolean;
}

const metricsBuffer: AICallMetrics[] = [];

/**
 * 记录一次 AI 调用指标。
 */
export function recordAICall(metric: AICallMetrics): void {
  metricsBuffer.push(metric);

  logger.info('AI 调用完成', {
    模型: metric.modelId,
    延迟毫秒: metric.latencyMs,
    Token数: (metric.inputTokens || 0) + (metric.outputTokens || 0),
    成功: metric.success,
  });
}

/**
 * 获取最近 AI 调用的汇总统计。
 */
export function getAICallStats(): {
  total: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
} {
  const total = metricsBuffer.length;
  if (total === 0) {
    return { total: 0, successRate: 0, avgLatencyMs: 0, totalTokens: 0 };
  }

  const successful = metricsBuffer.filter((m) => m.success).length;
  const avgLatency =
    metricsBuffer.reduce((sum, m) => sum + m.latencyMs, 0) / total;
  const totalTokens = metricsBuffer.reduce(
    (sum, m) => sum + (m.inputTokens || 0) + (m.outputTokens || 0),
    0
  );

  return {
    total,
    successRate: Math.round((successful / total) * 100),
    avgLatencyMs: Math.round(avgLatency),
    totalTokens,
  };
}
