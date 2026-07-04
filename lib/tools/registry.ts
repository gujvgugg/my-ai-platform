/**
 * Agent 工具注册表。
 * 聚合所有可供 AI Agent 使用的工具。
 */

import { readFileTool, writeFileTool, listProjectFilesTool } from './file-tools';
import { searchDocsTool, searchCodeTool } from './rag-tools';
import { webSearchTool } from './web-tools';

/** 所有 Agent 公用的标准工具集 */
export const standardTools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  listProjectFiles: listProjectFilesTool,
  searchDocs: searchDocsTool,
  searchCode: searchCodeTool,
  webSearch: webSearchTool,
};
