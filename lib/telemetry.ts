/**
 * AI 调用遥测追踪。
 * 同时记录到内存（快速统计）+ 数据库（持久化）。
 */

import { logger } from './logger';
import { db } from './db';
import { aiMetrics } from './schema';

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

export function recordAICall(metric: AICallMetrics): void {
  metricsBuffer.push(metric);

  // 持久化到数据库（异步，不阻塞）
  db.insert(aiMetrics)
    .values({
      modelId: metric.modelId,
      latencyMs: metric.latencyMs,
      inputTokens: metric.inputTokens || 0,
      outputTokens: metric.outputTokens || 0,
      success: metric.success ? 1 : 0,
      error: metric.error || null,
      isCodeGen: metric.isCodeGen ? 1 : 0,
      createdAt: new Date(),
    })
    .execute()
    .catch((err) => logger.warn('遥测写入失败', { error: String(err) }));

  logger.info('AI 调用完成', {
    模型: metric.modelId,
    延迟毫秒: metric.latencyMs,
    Token: (metric.inputTokens || 0) + (metric.outputTokens || 0),
    成功: metric.success,
  });
}

export function getAICallStats(): {
  total: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
} {
  const total = metricsBuffer.length;
  if (total === 0) return { total: 0, successRate: 0, avgLatencyMs: 0, totalTokens: 0 };

  const successful = metricsBuffer.filter((m) => m.success).length;
  const avgLatency = metricsBuffer.reduce((s, m) => s + m.latencyMs, 0) / total;
  const totalTokens = metricsBuffer.reduce((s, m) => s + (m.inputTokens || 0) + (m.outputTokens || 0), 0);

  return { total, successRate: Math.round((successful / total) * 100), avgLatencyMs: Math.round(avgLatency), totalTokens };
}
