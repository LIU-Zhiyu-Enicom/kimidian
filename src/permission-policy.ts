/**
 * 权限策略（纯函数模块，可 Node 侧单测，不依赖 obsidian）：
 * - 三种权限模式：ask（逐个询问）/ smart（智能放行）/ yolo（全部允许）
 * - 只读工具判定（ACP tool_call 的 kind + 标题模式兜底）
 * - "始终允许"记忆的稳定工具 key（不用每次变化的 toolCallId）
 * - 旧设置迁移（autoApprove 布尔 → permissionMode）
 */

export type PermissionMode = "ask" | "smart" | "yolo";

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  ask: "逐个询问",
  smart: "智能放行",
  yolo: "全部允许",
};

export interface MinimalToolCall {
  title?: string | null;
  kind?: string | null;
}

/** ACP ToolCallKind 中的只读类 */
const READ_ONLY_KINDS = new Set(["read", "search", "fetch", "think"]);
/** ACP ToolCallKind 中的写/执行类（明确不豁免） */
const WRITE_KINDS = new Set(["edit", "delete", "move", "execute", "switch_mode"]);
/** kind 缺失时按标题兜底识别 */
const READ_ONLY_TITLE =
  /read|grep|glob|list|search|fetch|view|find|think|web/i;
const WRITE_TITLE =
  /write|edit|delete|remove|patch|replace|create|mkdir|move|rename|run|exec|shell|command|terminal/i;

/**
 * 稳定工具标识：kind + 工具名。
 * kimi 的 title 形如 "ReadFile"、"运行命令: npm test"、"读取 文件.md"，
 * 取首个标识符段作为工具名；kind 存在时前置，避免同名不同类混淆。
 * 绝不使用 toolCallId / requestId（每次请求都变，会导致记忆失效）。
 */
export function toolKeyOf(tc: MinimalToolCall): string {
  const kind = (tc.kind ?? "").toLowerCase().trim();
  const title = (tc.title ?? "").trim();
  const idMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(title);
  const name = idMatch
    ? idMatch[0]
    : title.split(/[：:\s（(]/)[0] || "unknown";
  return kind ? `${kind}:${name}` : name;
}

/** 只读工具判定：kind 优先，标题模式兜底 */
export function isReadOnlyTool(tc: MinimalToolCall): boolean {
  const kind = (tc.kind ?? "").toLowerCase().trim();
  if (READ_ONLY_KINDS.has(kind)) return true;
  if (WRITE_KINDS.has(kind)) return false;
  const title = tc.title ?? "";
  // 标题先匹配写/执行类（宁可多问，不可错放）
  if (WRITE_TITLE.test(title)) return false;
  return READ_ONLY_TITLE.test(title);
}

export type PermissionDecision = "auto-allow" | "ask";

/**
 * 权限决策：
 * - yolo：全部自动允许
 * - 任何模式下，命中"始终允许"记忆（按工具 key）→ 自动允许
 * - smart：只读工具自动允许
 * - 其余：逐个询问
 */
export function decidePermission(
  mode: PermissionMode,
  toolCall: MinimalToolCall,
  grantedAlways: ReadonlySet<string>
): PermissionDecision {
  if (mode === "yolo") return "auto-allow";
  if (grantedAlways.has(toolKeyOf(toolCall))) return "auto-allow";
  if (mode === "smart" && isReadOnlyTool(toolCall)) return "auto-allow";
  return "ask";
}

/**
 * 旧设置迁移：autoApprove 布尔 → permissionMode。
 * raw 为 data.json 原始对象（可能含旧字段 autoApprove）。
 */
export function migratePermissionMode(raw: unknown): PermissionMode {
  const r = (raw ?? {}) as Record<string, unknown>;
  const m = r.permissionMode;
  if (m === "ask" || m === "smart" || m === "yolo") return m;
  // 旧值迁移：autoApprove=true → 全部允许
  if (r.autoApprove === true) return "yolo";
  return "ask";
}

/**
 * 插件模式 → kimi CLI 原生 mode（session/set_config_option configId='mode'）。
 * CLI 暴露 default/plan/auto/yolo：ask/smart 用 default（审批由客户端把关），
 * yolo 双写 CLI 的 yolo（双保险）。返回 null 表示不同步。
 */
export function cliModeFor(mode: PermissionMode): string {
  return mode === "yolo" ? "yolo" : "default";
}
