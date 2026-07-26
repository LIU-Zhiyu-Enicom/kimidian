/**
 * 上下文用量解析（纯模块，不依赖 Obsidian / Node，便于单测）。
 *
 * 数据来源：Kimi CLI 会话日志 `~/.kimi-code/sessions/<wd>/<sessionId>/agents/main/wire.jsonl`。
 * ACP 协议本身不推送 token 用量（已实测确认），但 CLI 会在每轮结束后落盘：
 *   - `{"type":"usage.record","model":…,"usage":{…},"usageScope":"turn"}`  每轮 token 用量
 *   - `{"type":"llm.request",…,"maxTokens":262144}`                        模型上下文窗口
 * 本模块只负责从 wire.jsonl 尾部文本中解析这两类记录并换算成上下文占用百分比。
 */

/** 单轮 token 用量（与 wire.jsonl 中 usage.record 的字段对应） */
export interface TurnUsage {
  model: string | null;
  inputOther: number;
  output: number;
  inputCacheRead: number;
  inputCacheCreation: number;
}

/** 解析结果：最近一次用量 + 最近一次上下文窗口大小 */
export interface WireUsageInfo {
  usage: TurnUsage | null;
  maxTokens: number | null;
}

/** 换算后的上下文占用 */
export interface ContextUsage {
  /** 已用 tokens（最近一轮输入总量 + 输出；估算时为字符启发式结果） */
  used: number;
  /** 上下文窗口总量 */
  total: number;
  /** 占用百分比（0-100，保留 1 位小数前的整数部分） */
  pct: number;
  model: string | null;
  /** total 是否来自 wire.jsonl 实测（false = 内置表兜底） */
  exact: boolean;
  /** used 是否为字符估算（true = 显示「约」，精确用量落盘后自动替换） */
  estimated: boolean;
}

/** 内置上下文窗口兜底表（来自 CLI config.toml，仅当 wire.jsonl 尚无 llm.request 记录时使用） */
const MODEL_CONTEXT_FALLBACK: Record<string, number> = {
  "kimi-for-coding": 262144,
  k3: 1048576,
};

/** 从模型标识（如 "kimi-code/kimi-for-coding"）取末段用于查表 */
function modelTail(model: string | null): string | null {
  if (!model) return null;
  const seg = model.split("/").filter(Boolean);
  return seg.length > 0 ? seg[seg.length - 1] : null;
}

/**
 * 从 wire.jsonl 尾部文本解析最近一次用量与上下文窗口。
 * 传入的 text 可以是整个文件也可以是尾部片段；逐行 JSON 解析，坏行跳过。
 */
export function parseWireUsage(text: string): WireUsageInfo {
  let usage: TurnUsage | null = null;
  let maxTokens: number | null = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    // 快速预筛，避免对大文件每行都 JSON.parse
    const isUsage = t.includes('"usage.record"');
    const isReq = !isUsage && t.includes('"llm.request"');
    if (!isUsage && !isReq) continue;
    let obj: any;
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
        inputCacheCreation: num(u.inputCacheCreation),
      };
    } else if (isReq && obj?.type === "llm.request") {
      const mt = num(obj.maxTokens);
      if (mt > 0) maxTokens = mt;
    }
  }
  return { usage, maxTokens };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * 把解析结果换算成上下文占用。
 * used = 最近一轮的输入总量（含缓存读/建）+ 输出，近似下一轮请求将携带的上下文长度。
 * total 优先取 wire.jsonl 的 maxTokens，缺省时按模型查内置表；都拿不到返回 null。
 */
export function computeContextUsage(info: WireUsageInfo): ContextUsage | null {
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
    pct: Math.min(100, Math.round((used / total) * 100)),
    model: u.model,
    exact,
    estimated: false,
  };
}

// ================= 字符估算兜底 =================

/** CJK 字符判定（估算用：中文 token 密度约为英文两倍） */
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;

/** 递归收集 JSON 值里所有字符串的字符数，按 CJK / 其它分类 */
function collectStrings(v: unknown, out: { cjk: number; other: number }): void {
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

/**
 * 统计 wire.jsonl 全文的内容字符量（systemPrompt、tools 快照、消息、think 等
 * 所有字符串字段——它们都是上下文组成的近似）。坏行跳过。
 */
export function estimateWireChars(text: string): { cjk: number; other: number } {
  const out = { cjk: 0, other: 0 };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    try {
      collectStrings(JSON.parse(t), out);
    } catch {
      /* 坏行跳过 */
    }
  }
  return out;
}

/** 字符 → token 启发式：CJK ≈ 2 字符/token，其余 ≈ 4 字符/token */
export function estimateTokens(cjk: number, other: number): number {
  return Math.ceil(cjk / 2 + other / 4);
}

/**
 * 估算版上下文占用：wire 里尚无 usage.record 时（首轮进行中 / 落盘延迟）兜底。
 * estimated=true，UI 必须带「约」字；分母优先 llm.request maxTokens，缺省查内置表。
 */
export function computeEstimatedUsage(params: {
  cjk: number;
  other: number;
  maxTokens: number | null;
  model: string | null;
}): ContextUsage | null {
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
    pct: Math.min(100, Math.round((used / total) * 100)),
    model: params.model,
    exact,
    estimated: true,
  };
}
