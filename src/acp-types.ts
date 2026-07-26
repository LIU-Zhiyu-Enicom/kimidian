/**
 * ACP (Agent Client Protocol) 类型定义（只保留插件用到的子集）。
 * 协议：JSON-RPC 2.0 over stdio，NDJSON 一行一消息。
 */

// ---------- JSON-RPC 信封 ----------

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** agent 侧错误码：未登录 */
export const ACP_ERR_AUTH_REQUIRED = -32000;

// ---------- initialize ----------

export interface ClientCapabilities {
  fs: { readTextFile: boolean; writeTextFile: boolean };
  terminal: boolean;
}

export interface AuthMethod {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
}

export interface AgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean };
  mcpCapabilities?: { http?: boolean; sse?: boolean };
  sessionCapabilities?: Record<string, unknown>;
}

export interface InitializeResult {
  protocolVersion: number;
  agentCapabilities: AgentCapabilities;
  agentInfo?: { name: string; version: string } | null;
  authMethods?: AuthMethod[];
}

// ---------- 会话 ----------

export interface SessionConfigValue {
  value: string;
  name: string;
  description?: string | null;
}

export interface SessionConfigOption {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  currentValue?: string;
  options?: SessionConfigValue[];
}

export interface NewSessionResult {
  sessionId: string;
  configOptions?: SessionConfigOption[] | null;
  modes?: unknown;
}

export interface SessionInfo {
  sessionId: string;
  cwd: string;
  title?: string | null;
  updatedAt?: string | null;
}

export interface ListSessionsResult {
  sessions: SessionInfo[];
  nextCursor?: string | null;
}

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

export interface PromptResult {
  stopReason: StopReason;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource_link"; uri: string; name?: string }
  | { type: "resource"; resource: { uri: string; text?: string } };

// ---------- session/update 通知 ----------

export interface ToolCallLocation {
  path: string;
  line?: number | null;
}

export interface ToolCallContent {
  type: string;
  text?: string;
  path?: string;
  oldText?: string | null;
  newText?: string | null;
  [key: string]: unknown;
}

export type ToolCallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface ToolCallInfo {
  toolCallId: string;
  title?: string | null;
  kind?: string | null;
  status?: ToolCallStatus | null;
  locations?: ToolCallLocation[] | null;
  content?: ToolCallContent[] | null;
  rawInput?: unknown;
}

export type SessionUpdate =
  | { sessionUpdate: "user_message_chunk"; content: ContentBlock }
  | { sessionUpdate: "agent_message_chunk"; content: ContentBlock }
  | { sessionUpdate: "agent_thought_chunk"; content: ContentBlock }
  | ({ sessionUpdate: "tool_call" } & ToolCallInfo)
  | ({ sessionUpdate: "tool_call_update" } & Partial<ToolCallInfo> & { toolCallId: string })
  | { sessionUpdate: "plan"; entries: unknown[] }
  | { sessionUpdate: "available_commands_update"; availableCommands: unknown[] }
  | { sessionUpdate: "config_option_update"; configOptions: SessionConfigOption[] }
  | { sessionUpdate: string; [key: string]: unknown };

export interface SessionNotification {
  sessionId: string;
  update: SessionUpdate;
}

// ---------- session/request_permission（agent → client 反向请求） ----------

export type PermissionOptionKind =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always";

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
}

export interface RequestPermissionParams {
  sessionId: string;
  toolCall: Partial<ToolCallInfo>;
  options: PermissionOption[];
}

export type RequestPermissionOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

// ---------- fs/* 反向请求 ----------

export interface ReadTextFileParams {
  sessionId: string;
  path: string;
  line?: number | null;
  limit?: number | null;
}

export interface WriteTextFileParams {
  sessionId: string;
  path: string;
  content: string;
}
