/** 代码文件类型 */
export interface CodeFile {
  filePath: string;
  content: string;
}

/**
 * 从 AI 回复文本中提取代码文件。
 * 支持多种格式：
 * 1. 纯 JSON 数组: [{...}]
 * 2. Markdown 代码块包裹: ```json [{...}] ```
 * 3. 对象包裹: {"files": [{...}]}
 * 4. 文本前后的 JSON（提取最外层 [...] 或 {...}）
 */
export function parseCodeFiles(text: string): { files: CodeFile[]; isCodeGen: boolean } {
  if (!text || text.length < 10) return { files: [], isCodeGen: false };

  // 候选 JSON 片段列表
  const candidates: string[] = [];

  // 1. 尝试从 markdown 代码块中提取
  const fenceMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g);
  for (const m of fenceMatches) {
    candidates.push(m[1].trim());
  }

  // 2. 尝试找到最外层的 JSON 数组
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    candidates.push(arrayMatch[0]);
  }

  // 3. 尝试找到最外层的 JSON 对象（可能是 { "files": [...] } 格式）
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    candidates.push(objectMatch[0]);
  }

  // 逐个尝试解析
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      // 格式 1: 直接是数组 [{...}, {...}]
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].filePath) {
        return { files: parsed as CodeFile[], isCodeGen: true };
      }

      // 格式 2: 对象包裹 { "files": [...] } 或 { "code": [...] }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const innerArray =
          parsed.files || parsed.code || parsed.result || parsed.data;
        if (Array.isArray(innerArray) && innerArray.length > 0 && innerArray[0].filePath) {
          return { files: innerArray as CodeFile[], isCodeGen: true };
        }
      }
    } catch {
      continue;
    }
  }

  return { files: [], isCodeGen: false };
}

/** 检查一段文本是否可能是代码生成输出 */
export function looksLikeCodeOutput(text: string): boolean {
  return text.includes('"filePath"') && text.includes('"content"');
}
