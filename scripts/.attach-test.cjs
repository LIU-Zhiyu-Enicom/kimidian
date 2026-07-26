var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/attachments.ts
var attachments_exports = {};
__export(attachments_exports, {
  BINARY_STORE_DIR: () => BINARY_STORE_DIR,
  MAX_IMAGE_BYTES: () => MAX_IMAGE_BYTES,
  binaryRefLine: () => binaryRefLine,
  bytesToBase64: () => bytesToBase64,
  classifyFile: () => classifyFile,
  fileRefXml: () => fileRefXml,
  formatSize: () => formatSize,
  imageMimeFor: () => imageMimeFor,
  truncateText: () => truncateText
});
module.exports = __toCommonJS(attachments_exports);
var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
var BINARY_STORE_DIR = "attachments/kimidian";
var IMAGE_MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};
var TEXT_EXTS = /* @__PURE__ */ new Set([
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
  "html"
]);
function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
function classifyFile(name) {
  const ext = extOf(name);
  if (IMAGE_MIME_BY_EXT[ext]) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  return "binary";
}
function imageMimeFor(name) {
  return IMAGE_MIME_BY_EXT[extOf(name)] ?? null;
}
function truncateText(content, maxChars) {
  if (content.length <= maxChars) return { text: content, truncated: false };
  return { text: content.slice(0, maxChars), truncated: true };
}
function fileRefXml(absPath, content, truncated) {
  return `<file path="${absPath}">
${content}${truncated ? "\n\u2026\uFF08\u5185\u5BB9\u8FC7\u957F\uFF0C\u5DF2\u622A\u65AD\uFF09" : ""}
</file>`;
}
function binaryRefLine(vaultPath) {
  return `[\u9644\u4EF6] ${vaultPath}\uFF08\u5DF2\u5B58\u5165\u4ED3\u5E93\uFF0C\u53EF\u7528\u5DE5\u5177\u8BFB\u53D6\uFF09`;
}
function bytesToBase64(bytes) {
  const buf = globalThis.Buffer;
  if (buf) return buf.from(bytes).toString("base64");
  let bin = "";
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BINARY_STORE_DIR,
  MAX_IMAGE_BYTES,
  binaryRefLine,
  bytesToBase64,
  classifyFile,
  fileRefXml,
  formatSize,
  imageMimeFor,
  truncateText
});
