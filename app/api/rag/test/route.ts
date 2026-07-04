import { retrieveContext } from '@/lib/rag/retriever';
import { getVectorBackend, isPineconeAvailable } from '@/lib/pinecone';
import { isUsingLocalEmbeddings } from '@/lib/embeddings';
import { memoryVectorStore } from '@/lib/vector-store';

/**
 * GET /api/rag/test?q=你的问题&topK=3
 * 测试检索效果，返回命中的知识库内容（不调用 LLM）。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get('q') || '';
  const topK = parseInt(url.searchParams.get('topK') || '3', 10);

  if (!query.trim()) {
    return Response.json({
      usage: 'GET /api/rag/test?q=你的问题&topK=3',
      totalDocs: memoryVectorStore.size(),
      backend: getVectorBackend(),
      embeddings: isUsingLocalEmbeddings() ? '本地算法' : '云端模型',
    });
  }

  const startTime = Date.now();
  const chunks = await retrieveContext(query, { topK });
  const elapsed = Date.now() - startTime;

  return Response.json({
    query,
    backend: getVectorBackend(),
    embeddings: isUsingLocalEmbeddings() ? '本地算法' : '云端模型',
    totalDocs: memoryVectorStore.size(),
    found: chunks.length,
    elapsedMs: elapsed,
    results: chunks.map((c) => ({
      score: c.score,
      content: c.content.substring(0, 200),
      source: (c.metadata?.fileName as string) || (c.metadata?.topic as string) || 'unknown',
    })),
  });
}
