'use server';

import { db } from '@/lib/db';
import { messages, projects } from '@/lib/schema';
import { writeCodeToDisk } from '@/lib/code-gen';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

// ============================================================
// 项目 CRUD（增删改查）
// ============================================================

/** 获取所有项目列表，按更新时间倒序 */
export async function getProjects() {
  return db.query.projects.findMany({
    orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
  });
}

/** 获取单个项目详情 */
export async function getProject(id: number) {
  return db.query.projects.findFirst({
    where: (projects, { eq }) => eq(projects.id, id),
  });
}

/** 创建新项目 */
export async function createProject(name: string, description?: string) {
  const [project] = await db
    .insert(projects)
    .values({
      name,
      description: description || null,
    })
    .returning();
  revalidatePath('/');
  return project;
}

/** 删除项目及其关联的所有消息 */
export async function deleteProject(id: number) {
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath('/');
}

/** 重命名项目 */
export async function renameProject(id: number, name: string) {
  await db
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(eq(projects.id, id));
  revalidatePath('/');
}

// ============================================================
// 消息管理
// ============================================================

/** 获取指定项目的聊天消息列表 */
export async function getMessages(projectId: number) {
  return db.query.messages.findMany({
    where: (messages, { eq }) => eq(messages.projectId, projectId),
    orderBy: (messages, { asc }) => [asc(messages.createdAt)],
  });
}

/** 保存一条聊天消息到数据库 */
export async function saveMessage(formData: FormData) {
  const role = formData.get('role') as string;
  const content = formData.get('content') as string;
  const projectIdStr = formData.get('projectId') as string;

  if (!role || !content) {
    console.error('缺少消息的角色或内容');
    return;
  }

  const projectId = projectIdStr ? parseInt(projectIdStr, 10) : null;

  // 如果没有指定项目ID，获取或创建默认项目
  let finalProjectId = projectId;
  if (!finalProjectId) {
    const existing = await db.query.projects.findFirst({
      where: (projects, { eq }) => eq(projects.id, 1),
    });
    if (existing) {
      finalProjectId = existing.id;
    } else {
      const [p] = await db
        .insert(projects)
        .values({ id: 1, name: '默认项目', description: '系统自动创建' })
        .returning();
      finalProjectId = p.id;
    }
  }

  try {
    await db.insert(messages).values({
      projectId: finalProjectId,
      role: role as 'user' | 'assistant' | 'system',
      content,
      createdAt: new Date(),
    });
    revalidatePath('/');
  } catch (error) {
    console.error('保存消息失败:', error);
  }
}

// ============================================================
// 代码生成持久化
// ============================================================

/** 将 AI 生成的代码文件保存到数据库和磁盘 */
export async function saveGeneratedCode(
  projectId: number,
  files: Array<{ filePath: string; content: string }>
) {
  try {
    // 1. 保存到数据库
    await db
      .update(projects)
      .set({
        codeSnapshot: files as unknown as Record<string, unknown>[],
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    // 2. 同时写入磁盘（预览 API 需要从磁盘读取）
    await writeCodeToDisk(projectId, files);

    revalidatePath('/');
    console.log(`已保存 ${files.length} 个代码文件到项目 #${projectId}（DB + 磁盘）`);
  } catch (error) {
    console.error('保存生成代码失败:', error);
  }
}
