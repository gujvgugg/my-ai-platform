import { seedTestKnowledgeBase } from '@/lib/rag';
import { memoryVectorStore } from '@/lib/vector-store';

export async function POST() {
  const result = await seedTestKnowledgeBase();
  return Response.json({ success: true, ...result });
}

export async function DELETE() {
  memoryVectorStore.clear();
  return Response.json({ success: true, total: 0 });
}
