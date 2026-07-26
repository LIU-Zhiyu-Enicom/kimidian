/**
 * 用户消息的显示层过滤：历史回放里的用户消息是 CLI 侧完整 prompt 文本，
 * 含运行时注入的 <system-reminder> 块、我们拼的 <active-note> / <file>
 * 上下文 XML 与 [附件] 路径行。这些不该裸显示给用户。
 *
 * 只影响显示层（渲染 + 复制原文），绝不改动发给 CLI 的内容。
 */

/** 一条被折叠的引用（渲染为小标签） */
export interface DisplayRef {
  kind: "note" | "file" | "attachment";
  /** 完整路径（tooltip 用） */
  path: string;
  /** 显示名（basename） */
  label: string;
}

export interface UserDisplay {
  /** 过滤后的正文（可能为空） */
  text: string;
  /** 折叠出的引用标签 */
  refs: DisplayRef[];
}

/**
 * 内部注入块标签列表（可扩展）。
 * 这些标签的成对块（含内容）在显示时整体剥离；未闭合的尾巴也剥掉。
 */
export const INTERNAL_BLOCK_TAGS: readonly string[] = ["system-reminder"];

function basename(p: string): string {
  const s = p.replace(/\\/g, "/");
  return s.split("/").pop() ?? p;
}

/** 剥离内部注入块：<tag>…</tag> 成对块 + 未闭合的 <tag> 尾巴 */
export function stripInternalBlocks(raw: string): string {
  let out = raw;
  for (const tag of INTERNAL_BLOCK_TAGS) {
    // 成对块（非贪婪，跨行）；循环应对同标签多块
    const paired = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g");
    out = out.replace(paired, "");
    // 未闭合尾巴（消息在块中间结束）
    const tail = new RegExp(`<${tag}>[\\s\\S]*$`);
    out = out.replace(tail, "");
  }
  return out;
}

/**
 * 提取上下文引用块并折叠为标签：
 * - `<active-note path="x" />` → 📎 当前笔记
 * - `<file path="p">…</file>`（含未闭合）→ 📄 引用文件
 * - `[附件] path（已存入仓库…）` 整行 → 📎 附件
 */
export function extractContextRefs(raw: string): {
  text: string;
  refs: DisplayRef[];
} {
  const refs: DisplayRef[] = [];
  let text = raw;

  text = text.replace(/<active-note\s+path="([^"]+)"\s*\/>/g, (_, p: string) => {
    refs.push({ kind: "note", path: p, label: basename(p) });
    return "";
  });

  text = text.replace(
    /<file\s+path="([^"]+)"\s*>[\s\S]*?<\/file>/g,
    (_, p: string) => {
      refs.push({ kind: "file", path: p, label: basename(p) });
      return "";
    }
  );
  // 未闭合 <file> 尾巴
  text = text.replace(/<file\s+path="([^"]+)"\s*>[\s\S]*$/, (_, p: string) => {
    refs.push({ kind: "file", path: p, label: basename(p) });
    return "";
  });

  text = text.replace(
    /\n?\[附件\]\s*(\S+)（已存入仓库[^\n]*/g,
    (_, p: string) => {
      refs.push({ kind: "attachment", path: p, label: basename(p) });
      return "";
    }
  );

  return { text, refs };
}

/**
 * 用户消息 → 显示形态：剥内部注入 → 折叠引用块 → 收拢空行。
 * 纯注入消息（剥离后无正文无引用）返回空 text + 空 refs，调用方应跳过渲染。
 */
export function formatUserDisplay(raw: string): UserDisplay {
  const stripped = stripInternalBlocks(raw);
  const { text, refs } = extractContextRefs(stripped);
  // 收拢剥离留下的空行（3+ 换行 → 1 个空行），去首尾空白
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, refs };
}
