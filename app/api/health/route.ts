import { db } from '@/lib/db';
import { getAICallStats } from '@/lib/telemetry';
import { getVectorBackend } from '@/lib/pinecone';
import { isUsingLocalEmbeddings } from '@/lib/embeddings';
import { availableModels } from '@/lib/models';

export async function GET() {
  let dbStatus: 'ok' | 'error' = 'error';
  try {
    await db.query.projects.findFirst();
    dbStatus = 'ok';
  } catch {
    dbStatus = 'error';
  }

  const stats = getAICallStats();

  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus === 'ok' ? '正常' : '异常',
      vectorDB: getVectorBackend() === 'pinecone' ? 'Pinecone 云端' : '本地内存库',
      embeddings: isUsingLocalEmbeddings() ? '本地算法' : '云端模型',
      dbRaw: dbStatus,
    },
    models: {
      count: availableModels.length,
      default: 'deepseek-flash',
    },
    ai: {
      totalCalls: stats.total,
      successRate: stats.successRate,
      avgLatencyMs: stats.avgLatencyMs,
      totalTokens: stats.totalTokens,
    },
  });
}
