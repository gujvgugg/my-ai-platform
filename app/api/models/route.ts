import { availableModels } from '@/lib/models';

export async function GET() {
  const models = availableModels.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    type: m.type,
    local: m.local,
  }));

  return Response.json({ models });
}
