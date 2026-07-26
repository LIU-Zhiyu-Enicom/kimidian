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

// src/usage.ts
var usage_exports = {};
__export(usage_exports, {
  computeContextUsage: () => computeContextUsage,
  computeEstimatedUsage: () => computeEstimatedUsage,
  estimateTokens: () => estimateTokens,
  estimateWireChars: () => estimateWireChars,
  parseWireUsage: () => parseWireUsage
});
module.exports = __toCommonJS(usage_exports);
var MODEL_CONTEXT_FALLBACK = {
  "kimi-for-coding": 262144,
  k3: 1048576
};
function modelTail(model) {
  if (!model) return null;
  const seg = model.split("/").filter(Boolean);
  return seg.length > 0 ? seg[seg.length - 1] : null;
}
function parseWireUsage(text) {
  let usage = null;
  let maxTokens = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    const isUsage = t.includes('"usage.record"');
    const isReq = !isUsage && t.includes('"llm.request"');
    if (!isUsage && !isReq) continue;
    let obj;
    try {
      obj = JSON.parse(t);
    } catch {
      continue;
    }
    if (isUsage && obj?.type === "usage.record" && obj.usage) {
      const u = obj.usage;
      usage = {
        model: typeof obj.model === "string" ? obj.model : null,
        inputOther: num(u.inputOther),
        output: num(u.output),
        inputCacheRead: num(u.inputCacheRead),
        inputCacheCreation: num(u.inputCacheCreation)
      };
    } else if (isReq && obj?.type === "llm.request") {
      const mt = num(obj.maxTokens);
      if (mt > 0) maxTokens = mt;
    }
  }
  return { usage, maxTokens };
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}
function computeContextUsage(info) {
  if (!info.usage) return null;
  const u = info.usage;
  const used = u.inputOther + u.inputCacheRead + u.inputCacheCreation + u.output;
  let total = info.maxTokens;
  let exact = true;
  if (!total) {
    total = MODEL_CONTEXT_FALLBACK[modelTail(u.model) ?? ""] ?? null;
    exact = false;
  }
  if (!total || total <= 0) return null;
  return {
    used,
    total,
    pct: Math.min(100, Math.round(used / total * 100)),
    model: u.model,
    exact,
    estimated: false
  };
}
var CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;
function collectStrings(v, out) {
  if (typeof v === "string") {
    for (const ch of v) {
      if (CJK_RE.test(ch)) out.cjk++;
      else out.other++;
    }
  } else if (Array.isArray(v)) {
    for (const x of v) collectStrings(x, out);
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) collectStrings(x, out);
  }
}
function estimateWireChars(text) {
  const out = { cjk: 0, other: 0 };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    try {
      collectStrings(JSON.parse(t), out);
    } catch {
    }
  }
  return out;
}
function estimateTokens(cjk, other) {
  return Math.ceil(cjk / 2 + other / 4);
}
function computeEstimatedUsage(params) {
  const used = estimateTokens(params.cjk, params.other);
  if (used <= 0) return null;
  let total = params.maxTokens;
  let exact = true;
  if (!total) {
    total = MODEL_CONTEXT_FALLBACK[modelTail(params.model) ?? ""] ?? null;
    exact = false;
  }
  if (!total || total <= 0) return null;
  return {
    used,
    total,
    pct: Math.min(100, Math.round(used / total * 100)),
    model: params.model,
    exact,
    estimated: true
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  computeContextUsage,
  computeEstimatedUsage,
  estimateTokens,
  estimateWireChars,
  parseWireUsage
});
