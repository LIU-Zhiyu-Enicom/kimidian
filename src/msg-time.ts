/**
 * 消息时间戳（纯逻辑，可 Node 单测）：
 * - formatMsgTime：当天 "HH:MM"，跨天 "M/D HH:MM"
 * - parseWireMsgTimes：从 CLI 会话日志 wire.jsonl 提取每轮消息的落盘时间
 *   （实测：context.append_message 只有 origin.kind="user" 的记录是真实用户消息，
 *    injection/system_trigger/background_task 不对应用户气泡；助手回复没有
 *    append_message，取该轮最后一个 step.end 的外层 time 作为回答完成时间）
 * - backfillEntryTimes：回放结束后把 wire 时间按序对位回填进消息日志，
 *   对不上位的条目保留估算标记（tsEst），UI 淡化显示
 */

/** 当天 "HH:MM"；跨天 "M/D HH:MM"（月/日不补零，时/分补零） */
export function formatMsgTime(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sameDay =
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

export interface WireMsgTime {
  role: "user" | "assistant";
  time: number;
}

/**
 * 从 wire.jsonl 提取按轮交替的 {role, time} 序列：
 * user1, assistant1, user2, assistant2 …
 * - 用户消息：context.append_message 且 origin.kind === "user"
 * - 助手消息：该轮最后一个 step.end（append_loop_event 包裹，外层 time）
 *   某轮没有 step.end（中断/崩溃）则该轮 assistant 缺省，由回填兜底
 */
export function parseWireMsgTimes(wireJsonl: string): WireMsgTime[] {
  const out: WireMsgTime[] = [];
  let pendingStepEnd: number | null = null;
  const flushAssistant = () => {
    if (pendingStepEnd !== null) {
      out.push({ role: "assistant", time: pendingStepEnd });
      pendingStepEnd = null;
    }
  };
  for (const line of wireJsonl.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    if (s.includes("context.append_message")) {
      try {
        const j = JSON.parse(s) as {
          type?: string;
          message?: { role?: string; origin?: { kind?: string } };
          time?: number;
        };
        if (
          j.type === "context.append_message" &&
          j.message?.role === "user" &&
          j.message?.origin?.kind === "user" &&
          typeof j.time === "number"
        ) {
          flushAssistant(); // 上一轮的回答先落位
          out.push({ role: "user", time: j.time });
        }
      } catch {
        /* 非 JSON 行，跳过 */
      }
    } else if (s.includes("step.end")) {
      try {
        const j = JSON.parse(s) as {
          type?: string;
          event?: { type?: string };
          time?: number;
        };
        if (
          j.type === "context.append_loop_event" &&
          j.event?.type === "step.end" &&
          typeof j.time === "number"
        ) {
          pendingStepEnd = j.time; // 同轮多步取最后一个
        }
      } catch {
        /* 非 JSON 行，跳过 */
      }
    }
  }
  flushAssistant();
  return out;
}

/** 回填目标的最小鸭子类型（chat-view 的 MsgEntry 兼容） */
export interface BackfillEntry {
  kind: string;
  ts?: number;
  tsEst?: boolean;
}

/**
 * 把 wire 时间序列按序对位回填到消息条目（只处理 user / assistant）。
 * 同一轮内多个 assistant 条目（被工具/思考切段）共享该轮的回答时间。
 * 对不上位的条目：保留/标注 tsEst（估算），ts 缺省时用 fallbackTs。
 * 返回是否有条目被改动（有改动才需要重渲染）。
 */
export function backfillEntryTimes(
  entries: BackfillEntry[],
  times: WireMsgTime[],
  fallbackTs: number
): boolean {
  let changed = false;
  let wi = 0;
  let turnAssistantTime: number | null = null; // 当前轮已取到的回答时间
  for (const e of entries) {
    if (e.kind === "user") {
      turnAssistantTime = null;
      // 推进 wire 指针到下一个 user 记录
      let found: number | null = null;
      while (wi < times.length) {
        const w = times[wi++];
        if (w.role === "user") {
          found = w.time;
          break;
        }
      }
      if (found !== null) {
        if (e.ts !== found || e.tsEst) {
          e.ts = found;
          e.tsEst = false;
          changed = true;
        }
      } else {
        if (e.ts === undefined) {
          e.ts = fallbackTs;
          changed = true;
        }
        if (!e.tsEst) {
          e.tsEst = true;
          changed = true;
        }
      }
    } else if (e.kind === "assistant") {
      let t: number | null = turnAssistantTime;
      if (t === null) {
        // 找该轮的 assistant 记录（wire 里 assistant 紧跟在 user 之后）
        while (wi < times.length) {
          const w = times[wi];
          if (w.role === "assistant") {
            t = w.time;
            wi++;
          }
          break;
        }
        turnAssistantTime = t;
      }
      if (t !== null && t !== undefined) {
        if (e.ts !== t || e.tsEst) {
          e.ts = t;
          e.tsEst = false;
          changed = true;
        }
      } else {
        if (e.ts === undefined) {
          e.ts = fallbackTs;
          changed = true;
        }
        if (!e.tsEst) {
          e.tsEst = true;
          changed = true;
        }
      }
    }
  }
  return changed;
}
