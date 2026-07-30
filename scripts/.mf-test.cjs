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

// src/message-filter.ts
var message_filter_exports = {};
__export(message_filter_exports, {
  INTERNAL_BLOCK_TAGS: () => INTERNAL_BLOCK_TAGS,
  extractContextRefs: () => extractContextRefs,
  formatUserDisplay: () => formatUserDisplay,
  stripInternalBlocks: () => stripInternalBlocks
});
module.exports = __toCommonJS(message_filter_exports);
var INTERNAL_BLOCK_TAGS = ["system-reminder"];
function basename(p) {
  const s = p.replace(/\\/g, "/");
  return s.split("/").pop() ?? p;
}
function stripInternalBlocks(raw) {
  let out = raw;
  for (const tag of INTERNAL_BLOCK_TAGS) {
    const paired = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g");
    out = out.replace(paired, "");
    const tail = new RegExp(`<${tag}>[\\s\\S]*$`);
    out = out.replace(tail, "");
  }
  return out;
}
function extractContextRefs(raw) {
  const refs = [];
  let text = raw;
  text = text.replace(/<active-note\s+path="([^"]+)"\s*\/>/g, (_, p) => {
    refs.push({ kind: "note", path: p, label: basename(p) });
    return "";
  });
  text = text.replace(
    /<file\s+path="([^"]+)"\s*>[\s\S]*?<\/file>/g,
    (_, p) => {
      refs.push({ kind: "file", path: p, label: basename(p) });
      return "";
    }
  );
  text = text.replace(/<file\s+path="([^"]+)"\s*>[\s\S]*$/, (_, p) => {
    refs.push({ kind: "file", path: p, label: basename(p) });
    return "";
  });
  text = text.replace(
    /\n?\[附件\]\s*(\S+)（已存入仓库[^\n]*/g,
    (_, p) => {
      refs.push({ kind: "attachment", path: p, label: basename(p) });
      return "";
    }
  );
  return { text, refs };
}
function formatUserDisplay(raw) {
  const stripped = stripInternalBlocks(raw);
  const { text, refs } = extractContextRefs(stripped);
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, refs };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  INTERNAL_BLOCK_TAGS,
  extractContextRefs,
  formatUserDisplay,
  stripInternalBlocks
});
