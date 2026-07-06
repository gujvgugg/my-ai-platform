import { getProject, getMessages } from '@/app/actions';
import { dbMessagesToUI } from '@/lib/stream';
import { notFound } from 'next/navigation';
import ChatInterface from '@/components/ChatInterface';
import ChatErrorBoundary from '@/components/ChatErrorBoundary';

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ firstMessage?: string }>;
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const { firstMessage } = await searchParams;
  const id = parseInt(projectId, 10);

  if (isNaN(id)) notFound();

  const project = await getProject(id);
  if (!project) notFound();

  const dbMessages = await getMessages(id);
  const initialMessages = dbMessagesToUI(dbMessages);

  return (
    <div className="flex flex-col h-full">
      {/* 项目头部 */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold text-gray-800">{project.name}</h2>
        {project.description && (
          <p className="text-sm text-gray-500">{project.description}</p>
        )}
      </div>

      {/* 聊天界面 */}
      <div className="flex-1">
        <ChatErrorBoundary>
          <ChatInterface
            projectId={id}
            projectName={project.name}
            initialMessages={initialMessages}
            autoSend={firstMessage}
          />
        </ChatErrorBoundary>
      </div>
    </div>
  );
}
