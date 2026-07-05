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
 *   F. 多 Markdown 块     — 多个 ```lang filename\n code \n```
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

  // —— 策略 B: 纯文本中找 JSON 数组（更宽松的匹配） ——
  // 找 filePath 和 content 同时出现的 JSON 数组
  const arrayMatches = text.match(/\[\s*\{[\s\S]*?"filePath"[\s\S]*?"content"[\s\S]*?\}[\s\S]*?\]/g);
  if (arrayMatches) {
    for (const m of arrayMatches) {
      const result = tryExtractFiles(m);
      if (result) return result;
    }
  }

  // —— 策略 B2: 更宽松的数组匹配（处理跨行和多文件） ——
  const looseArrayMatches = text.match(/\[\s*\{[\s\S]*?"filePath"[\s\S]*?\}\s*\]/g);
  if (looseArrayMatches) {
    for (const m of looseArrayMatches) {
      if (arrayMatches?.includes(m)) continue; // 跳过已匹配的
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
  const singleFileMatch = text.match(/```(tsx?|jsx?|css|html)\s+(\S[^\n]*)\n([\s\S]*?)```/g);
  if (singleFileMatch) {
    const files: CodeFile[] = [];
    for (const block of singleFileMatch) {
      // 匹配语言标记 + 可选文件名 + 换行 + 代码
      const m = block.match(/```(?:tsx?|jsx?|css|html|typescript|javascript)\s+([^\n]+)\n([\s\S]*?)```/);
      if (m) {
        const filePath = m[1].trim();
        const content = m[2].trim();
        // 确保 filePath 看起来像路径
        if (filePath.includes('.') && !filePath.startsWith('//')) {
          files.push({ filePath, content });
        }
      }
    }
    if (files.length > 0) return { files: validatedFiles(files), isCodeGen: true };
  }

  // —— 策略 E: 无文件名的代码块（猜文件类型） ——
  const unnamedBlockMatch = text.match(/```(tsx?|jsx?|css|html)\n([\s\S]*?)```/g);
  if (unnamedBlockMatch && unnamedBlockMatch.length >= 2) {
    // 多个代码块可能是多文件
    const files: CodeFile[] = [];
    let blockIndex = 0;
    for (const block of unnamedBlockMatch) {
      const m = block.match(/```(tsx?|jsx?|css|html|typescript|javascript)\n([\s\S]*?)```/);
      if (m) {
        const lang = m[1];
        const content = m[2].trim();
        const ext = lang === 'typescript' ? 'ts' : lang;
        files.push({ filePath: `generated/file_${blockIndex}.${ext}`, content });
        blockIndex++;
      }
    }
    if (files.length >= 2) return { files: validatedFiles(files), isCodeGen: true };
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

/** 修复 AI 常见的 JSON 错误 */
function repairJson(str: string): string | null {
  let fixed = str;

  // 1. 移除尾部逗号
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  // 2. 单引号 key 转双引号
  fixed = fixed.replace(/'(\w+)':/g, '"$1":');

  // 3. 修复 content 字段中未转义的中文引号
  // （中文句号、书名号等不需要转义，但中文双引号 "" 如果在 JSON 字符串内会导致问题）
  fixed = fixed.replace(/"content":\s*"([\s\S]*?)"\s*(?=[,}])/g, (_match, content) => {
    // 在 content 值中转义未处理的换行和引号
    const escaped = (content as string)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"content": "${escaped}"`;
  });

  // 4. 修复 content 字符串中的裸换行符（在 JSON 字符串中间位置）
  // 这通常发生在 AI 输出多行代码时
  if (fixed.includes('"content"')) {
    // 尝试在 content 值内转义未转义的换行
    const lines = fixed.split('\n');
    const repairedLines: string[] = [];
    let inContent = false;
    for (const line of lines) {
      if (line.includes('"content"') && line.includes(':"')) {
        inContent = true;
      }
      if (inContent && line.trim().endsWith('"},')) {
        inContent = false;
      }
      repairedLines.push(line);
    }
    // 如果修复了，尝试重新组装
    if (repairedLines.length !== lines.length) {
      fixed = repairedLines.join('\\n');
    }
  }

  // 5. 修复末尾不完整的 JSON（截断）
  // 如果以 } 结尾但不完整，补齐
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;
  if (openBraces > closeBraces) {
    fixed += '}'.repeat(openBraces - closeBraces);
  }
  if (openBrackets > closeBrackets) {
    fixed += ']'.repeat(openBrackets - closeBrackets);
  }

  if (fixed !== str) return fixed;
  return null;
}

/** 验证并清理文件对象 */
function validatedFiles(files: CodeFile[]): CodeFile[] {
  return files
    .filter((f) => typeof f.filePath === 'string' && typeof f.content === 'string')
    .map((f) => ({
      filePath: f.filePath.replace(/^['"]|['"]$/g, '').trim(),
      content: String(f.content),
    }))
    .filter((f) => f.filePath.length > 0 && f.filePath.includes('.'));
}

/** 检查文本是否可能包含代码输出 */
export function looksLikeCodeOutput(text: string): boolean {
  return (
    (text.includes('"filePath"') && text.includes('"content"')) ||
    /```(?:tsx?|jsx?|css|html)/.test(text)
  );
}
