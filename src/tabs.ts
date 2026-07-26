/**
 * 多标签会话的状态机（纯逻辑，可 Node 单测）：
 * - TabState：一个标签 = 一个独立会话（sessionId + 独立 msgLog 数据层）
 * - applyUpdateToLog：后台标签的 session/update 数据层累积（无 DOM），
 *   与 chat-view 活动渲染路径的数据层效果严格镜像
 * - 标题摘要 / 查找 / 关闭后活动标签选择
 */
import {
  RequestPermissionOutcome,
  RequestPermissionParams,
  SessionConfigOption,
  ToolCallInfo,
} from "./acp-types";
import { DisplayRef, formatUserDisplay } from "./message-filter";

/**
 * 消息日志条目：消息状态的数据层（DOM 只是它的投影）。
 * 面板切换 / 标签切换 / 视图重挂载时从这里恢复渲染。
 */
export type MsgEntry =
  | { kind: "user"; text: string; refs?: DisplayRef[] }
  | { kind: "assistant"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "tool"; tool: ToolCallInfo }
  | { kind: "system"; text: string }
  | { kind: "error"; text: string };

/** 单个标签的消息日志上限（超出丢最旧，防长会话内存膨胀） */
export const TAB_LOG_MAX = 500;

export interface TabState {
  /** 内部稳定 id（tab-N；sessionId 建立前也需要身份） */
  id: string;
  sessionId: string | null;
  /** 标签标题：首条用户消息摘要（未发消息前为「新对话」） */
  title: string;
  msgLog: MsgEntry[];
  // ---- 流式数据态（切标签时保存/恢复；后台标签由 applyUpdateToLog 维护） ----
  streamText: string;
  thoughtText: string;
  /** 当前正文条目已封存（工具/思考介入后，下一段正文另起条目） */
  assistantSealed: boolean;
  curAssistantEntry: (MsgEntry & { kind: "assistant" }) | null;
  curThoughtEntry: (MsgEntry & { kind: "thought" }) | null;
  toolEntries: Map<string, MsgEntry & { kind: "tool" }>;
  // ---- 展示状态 ----
  /** 有轮次在跑（呼吸点；切标签不取消） */
  busy: boolean;
  /** 后台完成未读（亮点；激活时清除） */
  unread: boolean;
  /** 有权限请求等待确认（警示点；激活时展示） */
  attention: boolean;
  /** 已完成 session/load 回放（避免激活时重复回放） */
  replayed: boolean;
  /** 后台标签挂起的权限请求（激活时重新展示；视图取消/关闭时回 cancelled） */
  pendingPermission: {
    params: RequestPermissionParams;
    resolve: (o: RequestPermissionOutcome) => void;
  } | null;
  // ---- 按会话维度的状态（状态栏随标签切换） ----
  wirePath: string | null;
  modelOptions: SessionConfigOption | null;
  effortOptions: SessionConfigOption | null;
  lastUserText: string;
}

export function makeTab(
  id: string,
  sessionId: string | null = null,
  title = "新对话"
): TabState {
  return {
    id,
    sessionId,
    title,
    msgLog: [],
    streamText: "",
    thoughtText: "",
    assistantSealed: false,
    curAssistantEntry: null,
    curThoughtEntry: null,
    toolEntries: new Map(),
    busy: false,
    unread: false,
    attention: false,
    replayed: false,
    pendingPermission: null,
    wirePath: null,
    modelOptions: null,
    effortOptions: null,
    lastUserText: "",
  };
}

/** 标签标题：首条用户消息摘要（去空白，超长截断） */
export function tabTitleFor(text: string, max = 18): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "新对话";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export function findTabBySession(
  tabs: TabState[],
  sessionId: string | null | undefined
): TabState | undefined {
  if (!sessionId) return undefined;
  return tabs.find((t) => t.sessionId === sessionId);
}

/** 关闭某标签后应激活的标签 id：优先左邻居，其次右邻居，都没有 → null（调用方新建） */
export function nextActiveAfterClose(
  tabs: TabState[],
  closedId: string,
  activeId: string | null
): string | null {
  if (closedId !== activeId) return activeId; // 关的不是活动标签：活动不变
  const idx = tabs.findIndex((t) => t.id === closedId);
  const rest = tabs.filter((t) => t.id !== closedId);
  if (rest.length === 0) return null;
  return rest[Math.max(0, Math.min(idx - 1, rest.length - 1))]?.id ?? rest[0].id;
}

/** 向标签日志追加（带上限） */
export function pushTabLog(tab: TabState, entry: MsgEntry): void {
  tab.msgLog.push(entry);
  if (tab.msgLog.length > TAB_LOG_MAX) {
    tab.msgLog.splice(0, tab.msgLog.length - TAB_LOG_MAX);
  }
}

/** session/update 的最小鸭子类型 */
export interface SessionUpdateLike {
  sessionUpdate: string;
  content?: { type: string; text?: string };
  toolCallId?: string;
  configOptions?: SessionConfigOption[];
  [key: string]: unknown;
}

/**
 * 后台标签的数据层累积（无 DOM）。与活动渲染路径镜像：
 * - user chunk = 轮次边界（重置流式态；剥内部注入；纯注入跳过）
 * - agent chunk：未封存则续写当前条目，封存则另起条目
 * - thought chunk：首块另起思考条目并封存当前正文
 * - tool_call / update：同 toolCallId 合并（undefined 不覆盖）
 */
export function applyUpdateToLog(tab: TabState, u: SessionUpdateLike): void {
  const text = u.content && u.content.type === "text" ? (u.content.text ?? "") : "";
  switch (u.sessionUpdate) {
    case "user_message_chunk": {
      if (!text) return;
      // 轮次边界（同活动路径 beginAssistantTurn 的数据层效果）
      tab.streamText = "";
      tab.thoughtText = "";
      tab.assistantSealed = false;
      tab.curAssistantEntry = null;
      tab.curThoughtEntry = null;
      tab.toolEntries.clear();
      const disp = formatUserDisplay(text);
      if (!disp.text && disp.refs.length === 0) return; // 纯内部注入不显示
      pushTabLog(tab, { kind: "user", text: disp.text, refs: disp.refs });
      return;
    }
    case "agent_message_chunk": {
      if (!text) return;
      if (!tab.curAssistantEntry || tab.assistantSealed) {
        tab.curAssistantEntry = { kind: "assistant", text: "" };
        tab.streamText = "";
        tab.assistantSealed = false;
        pushTabLog(tab, tab.curAssistantEntry);
      }
      tab.streamText += text;
      tab.curAssistantEntry.text = tab.streamText;
      return;
    }
    case "agent_thought_chunk": {
      if (!text) return;
      if (!tab.curThoughtEntry) {
        tab.curThoughtEntry = { kind: "thought", text: "" };
        tab.thoughtText = "";
        pushTabLog(tab, tab.curThoughtEntry);
        tab.assistantSealed = true; // 思考块出现后，后续正文另起一段
      }
      tab.thoughtText += text;
      tab.curThoughtEntry.text = tab.thoughtText;
      return;
    }
    case "tool_call": {
      const tc = u as unknown as ToolCallInfo;
      if (!tc.toolCallId) return;
      tab.assistantSealed = true;
      const existing = tab.toolEntries.get(tc.toolCallId);
      if (existing) {
        mergeTool(existing.tool, tc);
        return;
      }
      const entry: MsgEntry & { kind: "tool" } = { kind: "tool", tool: { ...tc } };
      tab.toolEntries.set(tc.toolCallId, entry);
      pushTabLog(tab, entry);
      return;
    }
    case "tool_call_update": {
      const tc = u as unknown as Partial<ToolCallInfo> & { toolCallId: string };
      const entry = tab.toolEntries.get(tc.toolCallId);
      if (entry) mergeTool(entry.tool, tc);
      return;
    }
    default:
      return; // config_option_update 等由调用方按标签维度处理
  }
}

/** undefined 字段不覆盖旧值（与活动路径 updateToolCall 一致） */
function mergeTool(
  target: ToolCallInfo,
  patch: Partial<ToolCallInfo>
): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      (target as unknown as Record<string, unknown>)[k] = v;
    }
  }
}
