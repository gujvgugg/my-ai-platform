/**
 * AI Agent 文件系统工具。
 * 允许 Agent 读写生成的项目文件。
 */

import { readCodeFromDisk, writeCodeToDisk, type CodeFile } from '../code-gen';

/** 从生成的项目中读取文件 */
export const readFileTool = {
  description: '从生成的项目中读取文件内容',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'number', description: '项目 ID' },
      filePath: { type: 'string', description: '项目内的相对文件路径' },
    },
    required: ['projectId', 'filePath'],
  },
  execute: async ({ projectId, filePath }: { projectId: number; filePath: string }) => {
    const files = await readCodeFromDisk(projectId);
    const file = files.find((f) => f.filePath === filePath);
    if (!file) return `文件未找到: ${filePath}`;
    return file.content;
  },
};

/** 向生成的项目中写入文件 */
export const writeFileTool = {
  description: '将内容写入生成的项目文件中',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'number', description: '项目 ID' },
      filePath: { type: 'string', description: '项目内的相对文件路径' },
      content: { type: 'string', description: '要写入的文件内容' },
    },
    required: ['projectId', 'filePath', 'content'],
  },
  execute: async ({ projectId, filePath, content }: {
    projectId: number;
    filePath: string;
    content: string;
  }) => {
    const files: CodeFile[] = [{ filePath, content }];
    const written = await writeCodeToDisk(projectId, files);
    return `成功写入 ${written.length} 个文件`;
  },
};

/** 列出生成项目中的所有文件 */
export const listProjectFilesTool = {
  description: '列出生成项目中的所有文件',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'number', description: '项目 ID' },
    },
    required: ['projectId'],
  },
  execute: async ({ projectId }: { projectId: number }) => {
    const files = await readCodeFromDisk(projectId);
    if (files.length === 0) return `项目 #${projectId} 中暂无文件`;
    return files.map((f) => `${f.filePath} (${f.content.length} 字节)`).join('\n');
  },
};
