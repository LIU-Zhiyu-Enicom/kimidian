/**
 * 待发送附件（粘贴/拖拽）的纯逻辑：分类、mime 判定、截断、引用文本、base64。
 * 不依赖 Obsidian / DOM，便于单测。kimi acp 实测 promptCapabilities: image:true。
 */

/** 待发送附件：图片（base64）/ 文本文档（已读内容）/ 二进制文档（已入仓库） */
export type PendingAttachment =
  | {
      kind: "image";
      name: string;
      mimeType: string;
      dataBase64: string;
      sizeBytes: number;
    }
  | { kind: "text"; name: string; content: string }
  | { kind: "binary"; name: string; vaultPath: string };

/** 单张图片上限（超出提示并拒绝，防止撑爆 prompt） */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** 二进制文档在仓库里的存放目录（vault 相对路径） */
export const BINARY_STORE_DIR = "attachments/kimidian";

/** 支持的图片扩展名 → mimeType */
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** 按文本文档处理的扩展名（读内容注入 <file> 块） */
const TEXT_EXTS = new Set([
  "md",
  "txt",
  "csv",
  "json",
  "log",
  "yaml",
  "yml",
  "xml",
  "ts",
  "js",
  "py",
  "css",
  "html",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** 文件名分类：image / text / binary（其余可读文档）/ null（无扩展名无法判断，按 binary 外的兜底） */
export function classifyFile(name: string): "image" | "text" | "binary" {
  const ext = extOf(name);
  if (IMAGE_MIME_BY_EXT[ext]) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  return "binary"; // pdf/docx 等让 Kimi 用工具自己读
}

/** 图片文件名 → mimeType（非图片返回 null） */
export function imageMimeFor(name: string): string | null {
  return IMAGE_MIME_BY_EXT[extOf(name)] ?? null;
}

/** 按最大字符数截断（与 @ 引用同一规则） */
export function truncateText(
  content: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (content.length <= maxChars) return { text: content, truncated: false };
  return { text: content.slice(0, maxChars), truncated: true };
}

/** 文本文档的 <file> 注入块（与 @ 引用格式一致） */
export function fileRefXml(
  absPath: string,
  content: string,
  truncated: boolean
): string {
  return `<file path="${absPath}">\n${content}${truncated ? "\n…（内容过长，已截断）" : ""}\n</file>`;
}

/** 二进制文档的路径引用行（Kimi 用工具自己读仓库里的副本） */
export function binaryRefLine(vaultPath: string): string {
  return `[附件] ${vaultPath}（已存入仓库，可用工具读取）`;
}

/** Uint8Array → base64（分块避免栈溢出；Obsidian 用 btoa，Node 用 Buffer） */
export function bytesToBase64(bytes: Uint8Array): string {
  const buf = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  if (buf) return buf.from(bytes).toString("base64");
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** 人类可读的文件大小（卡片标签用） */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
