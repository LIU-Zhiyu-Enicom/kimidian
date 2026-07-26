/**
 * 消息复制的纯逻辑：哪些条目可复制、复制什么文本、剪贴板写入。
 * 复制的是消息的原始 Markdown 文本（不是渲染后的 HTML）。
 */

/**
 * 该消息种类的可复制文本：user/assistant/thought 复制原文；
 * tool/system/error 不提供复制（返回 null）。
 */
export function copyTextFor(
  kind: string,
  text: string | null | undefined
): string | null {
  if (kind !== "user" && kind !== "assistant" && kind !== "thought") return null;
  const t = (text ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * 写剪贴板：优先 navigator.clipboard（Obsidian/Electron 可用），
 * 失败回退隐藏 textarea + execCommand（老环境兜底）。
 */
export async function writeClipboardText(text: string): Promise<void> {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return;
  }
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) throw new Error("当前环境无剪贴板能力");
  const ta = doc.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  doc.body.appendChild(ta);
  ta.select();
  try {
    doc.execCommand("copy");
  } finally {
    ta.remove();
  }
}
