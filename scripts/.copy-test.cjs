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

// src/copy.ts
var copy_exports = {};
__export(copy_exports, {
  copyTextFor: () => copyTextFor,
  writeClipboardText: () => writeClipboardText
});
module.exports = __toCommonJS(copy_exports);
function copyTextFor(kind, text) {
  if (kind !== "user" && kind !== "assistant" && kind !== "thought") return null;
  const t = (text ?? "").trim();
  return t.length > 0 ? t : null;
}
async function writeClipboardText(text) {
  const nav = globalThis.navigator;
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return;
  }
  const doc = globalThis.document;
  if (!doc) throw new Error("\u5F53\u524D\u73AF\u5883\u65E0\u526A\u8D34\u677F\u80FD\u529B");
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  copyTextFor,
  writeClipboardText
});
