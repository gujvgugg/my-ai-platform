/**
 * AI 代码输出标准化解析器。
 *
 * 处理 AI 可能返回的各种格式，统一提取为 { filePath, content }[] 结构。
 *
 * 支持的格式：
 *   A. 纯 JSON 数组      — [{ filePath: "...", content: "..." }]
 *   B. Markdown 代码块   — ```json [...] ```
 *   C. 对象包裹          — { "files": [...] }
 *   D. 正文 + JSON 混合  — 解释文字... [{...}] ...更多文字
 *   E. 单文件 Markdown   — ```tsx file.tsx\n code \n```
 */

export interface CodeFile {
  filePath: string;
  content: string;
}

export function parseCodeFiles(text: string): { files: CodeFile[]; isCodeGen: boolean } {
  if (!text || text.length < 10) return { files: [], isCodeGen: false };

  // —— 策略 A: 从 markdown 代码块提取 JSON ——
  const fenceMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g);
  for (const m of fenceMatches) {
    const result = tryExtractFiles(m[1].trim());
    if (result) return result;
  }

  // —— 策略 B: 纯文本中找 JSON 数组 ——
  const arrayMatches = text.match(/\[[\s\S]*?\{[\s\S]*?"filePath"[\s\S]*?\}[\s\S]*?\]/g);
  if (arrayMatches) {
    for (const m of arrayMatches) {
      const result = tryExtractFiles(m);
      if (result) return result;
    }
  }

  // —— 策略 C: 对象包裹 ——
  const objMatch = text.match(/\{[\s\S]*?"files"[\s\S]*?\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (Array.isArray(parsed.files) && parsed.files[0]?.filePath) {
        return { files: validatedFiles(parsed.files), isCodeGen: true };
      }
    } catch { /* continue */ }
  }

  // —— 策略 D: 单个代码块（Markdown 格式：```ext filename\n code \n```） ——
  const singleFileMatch = text.match(/```(tsx?|jsx?|css|html)\s+(.+?)\n([\s\S]*?)```/g);
  if (singleFileMatch) {
    const files: CodeFile[] = [];
    for (const block of singleFileMatch) {
      const m = block.match(/```(?:tsx?|jsx?|css|html)\s+(.+?)\n([\s\S]*?)```/);
      if (m) files.push({ filePath: m[1].trim(), content: m[2].trim() });
    }
    if (files.length > 0) return { files: validatedFiles(files), isCodeGen: true };
  }

  return { files: [], isCodeGen: false };
}

// ============================================================
// 内部辅助
// ============================================================

function tryExtractFiles(jsonStr: string): { files: CodeFile[]; isCodeGen: boolean } | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].filePath) {
      return { files: validatedFiles(parsed), isCodeGen: true };
    }
  } catch {
    // JSON 解析失败，尝试修复常见问题
    const repaired = repairJson(jsonStr);
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed) && parsed[0]?.filePath) {
          return { files: validatedFiles(parsed), isCodeGen: true };
        }
      } catch { /* 放弃 */ }
    }
  }
  return null;
}

/** 修复 AI 常见的 JSON 错误：未转义的换行、尾逗号、单引号 */
function repairJson(str: string): string | null {
  let fixed = str;
  // 移除尾部逗号
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  // 单引号转双引号（key）
  fixed = fixed.replace(/'(\w+)':/g, '"$1":');
  if (fixed !== str) return fixed;
  return null;
}

/** 验证并清理文件对象 */
function validatedFiles(files: CodeFile[]): CodeFile[] {
  return files
    .filter((f) => typeof f.filePath === 'string' && typeof f.content === 'string')
    .map((f) => ({
      filePath: f.filePath.replace(/^['"]|['"]$/g, '').trim(),
      content: f.content,
    }));
}

/** 检查文本是否可能包含代码输出 */
export function looksLikeCodeOutput(text: string): boolean {
  return text.includes('"filePath"') && text.includes('"content"');
}
