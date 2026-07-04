import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from './db';
import { projects } from './schema';
import { eq } from 'drizzle-orm';

// ============================================================
// 类型定义
// ============================================================

export interface CodeFile {
  filePath: string;
  content: string;
}

// ============================================================
// 代码解析
// ============================================================

/**
 * 从 AI 回复文本中提取结构化代码文件。
 * AI 被要求返回 {filePath, content} 的 JSON 数组。
 */
export function parseCodeFromText(text: string): { files: CodeFile[]; isCodeGen: boolean } {
  try {
    // 找到最外层的 JSON 数组
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { files: [], isCodeGen: false };
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].filePath) {
      return { files: parsed as CodeFile[], isCodeGen: true };
    }
  } catch {
    // 不是有效的 JSON —— 不是代码生成回复
  }
  return { files: [], isCodeGen: false };
}

/**
 * 验证文件路径，防止路径遍历攻击。
 * 只允许安全根目录内的路径。
 */
export function validateFilePath(filePath: string, safeRoot: string): string | null {
  const resolved = path.resolve(safeRoot, filePath);
  // 必须在 safeRoot 之内
  if (!resolved.startsWith(path.resolve(safeRoot))) {
    return null;
  }
  return resolved;
}

// ============================================================
// 文件系统持久化
// ============================================================

const GENERATED_ROOT = path.join(process.cwd(), 'generated');

/**
 * 将生成的代码文件写入磁盘 generated/{projectId}/ 目录。
 */
export async function writeCodeToDisk(
  projectId: number,
  files: CodeFile[]
): Promise<string[]> {
  const projectDir = path.join(GENERATED_ROOT, String(projectId));
  await fs.mkdir(projectDir, { recursive: true });

  const written: string[] = [];
  for (const file of files) {
    const safePath = validateFilePath(file.filePath, projectDir);
    if (!safePath) {
      console.warn(`跳过不安全的文件路径: ${file.filePath}`);
      continue;
    }
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, file.content, 'utf-8');
    written.push(safePath);
  }
  return written;
}

/**
 * 从磁盘读取项目的生成代码。
 */
export async function readCodeFromDisk(projectId: number): Promise<CodeFile[]> {
  const projectDir = path.join(GENERATED_ROOT, String(projectId));
  try {
    await fs.access(projectDir);
  } catch {
    return [];
  }

  const files: CodeFile[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过 node_modules、.next 等目录
        if (['node_modules', '.next', '.git', 'generated'].includes(entry.name)) continue;
        await walk(fullPath);
      } else {
        const content = await fs.readFile(fullPath, 'utf-8');
        const relativePath = path.relative(projectDir, fullPath).replace(/\\/g, '/');
        files.push({ filePath: relativePath, content });
      }
    }
  }
  await walk(projectDir);
  return files;
}

// ============================================================
// 数据库持久化
// ============================================================

/**
 * 将生成的代码同时保存到数据库（codeSnapshot）和磁盘。
 */
export async function persistGeneratedCode(
  projectId: number,
  files: CodeFile[]
): Promise<void> {
  // 保存到数据库
  await db
    .update(projects)
    .set({
      codeSnapshot: files as unknown as Record<string, unknown>[],
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  // 同时写入磁盘
  await writeCodeToDisk(projectId, files);

  console.log(`已持久化 ${files.length} 个文件到项目 #${projectId}`);
}
