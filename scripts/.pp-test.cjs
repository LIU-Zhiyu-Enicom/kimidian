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

// src/permission-policy.ts
var permission_policy_exports = {};
__export(permission_policy_exports, {
  PERMISSION_MODE_LABELS: () => PERMISSION_MODE_LABELS,
  cliModeFor: () => cliModeFor,
  decidePermission: () => decidePermission,
  isReadOnlyTool: () => isReadOnlyTool,
  migratePermissionMode: () => migratePermissionMode,
  toolKeyOf: () => toolKeyOf
});
module.exports = __toCommonJS(permission_policy_exports);
var PERMISSION_MODE_LABELS = {
  ask: "\u9010\u4E2A\u8BE2\u95EE",
  smart: "\u667A\u80FD\u653E\u884C",
  yolo: "\u5168\u90E8\u5141\u8BB8"
};
var READ_ONLY_KINDS = /* @__PURE__ */ new Set(["read", "search", "fetch", "think"]);
var WRITE_KINDS = /* @__PURE__ */ new Set(["edit", "delete", "move", "execute", "switch_mode"]);
var READ_ONLY_TITLE = /read|grep|glob|list|search|fetch|view|find|think|web/i;
var WRITE_TITLE = /write|edit|delete|remove|patch|replace|create|mkdir|move|rename|run|exec|shell|command|terminal/i;
function toolKeyOf(tc) {
  const kind = (tc.kind ?? "").toLowerCase().trim();
  const title = (tc.title ?? "").trim();
  const idMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(title);
  const name = idMatch ? idMatch[0] : title.split(/[：:\s（(]/)[0] || "unknown";
  return kind ? `${kind}:${name}` : name;
}
function isReadOnlyTool(tc) {
  const kind = (tc.kind ?? "").toLowerCase().trim();
  if (READ_ONLY_KINDS.has(kind)) return true;
  if (WRITE_KINDS.has(kind)) return false;
  const title = tc.title ?? "";
  if (WRITE_TITLE.test(title)) return false;
  return READ_ONLY_TITLE.test(title);
}
function decidePermission(mode, toolCall, grantedAlways) {
  if (mode === "yolo") return "auto-allow";
  if (grantedAlways.has(toolKeyOf(toolCall))) return "auto-allow";
  if (mode === "smart" && isReadOnlyTool(toolCall)) return "auto-allow";
  return "ask";
}
function migratePermissionMode(raw) {
  const r = raw ?? {};
  const m = r.permissionMode;
  if (m === "ask" || m === "smart" || m === "yolo") return m;
  if (r.autoApprove === true) return "yolo";
  return "ask";
}
function cliModeFor(mode) {
  return mode === "yolo" ? "yolo" : "default";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PERMISSION_MODE_LABELS,
  cliModeFor,
  decidePermission,
  isReadOnlyTool,
  migratePermissionMode,
  toolKeyOf
});
