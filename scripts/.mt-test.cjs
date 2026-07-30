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

// src/msg-time.ts
var msg_time_exports = {};
__export(msg_time_exports, {
  backfillEntryTimes: () => backfillEntryTimes,
  formatMsgTime: () => formatMsgTime,
  parseWireMsgTimes: () => parseWireMsgTimes
});
module.exports = __toCommonJS(msg_time_exports);
function formatMsgTime(ts, now = Date.now()) {
  const d = new Date(ts);
  const n = new Date(now);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
function parseWireMsgTimes(wireJsonl) {
  const out = [];
  let pendingStepEnd = null;
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
        const j = JSON.parse(s);
        if (j.type === "context.append_message" && j.message?.role === "user" && j.message?.origin?.kind === "user" && typeof j.time === "number") {
          flushAssistant();
          out.push({ role: "user", time: j.time });
        }
      } catch {
      }
    } else if (s.includes("step.end")) {
      try {
        const j = JSON.parse(s);
        if (j.type === "context.append_loop_event" && j.event?.type === "step.end" && typeof j.time === "number") {
          pendingStepEnd = j.time;
        }
      } catch {
      }
    }
  }
  flushAssistant();
  return out;
}
function backfillEntryTimes(entries, times, fallbackTs) {
  let changed = false;
  let wi = 0;
  let turnAssistantTime = null;
  for (const e of entries) {
    if (e.kind === "user") {
      turnAssistantTime = null;
      let found = null;
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
        if (e.ts === void 0) {
          e.ts = fallbackTs;
          changed = true;
        }
        if (!e.tsEst) {
          e.tsEst = true;
          changed = true;
        }
      }
    } else if (e.kind === "assistant") {
      let t = turnAssistantTime;
      if (t === null) {
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
      if (t !== null && t !== void 0) {
        if (e.ts !== t || e.tsEst) {
          e.ts = t;
          e.tsEst = false;
          changed = true;
        }
      } else {
        if (e.ts === void 0) {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  backfillEntryTimes,
  formatMsgTime,
  parseWireMsgTimes
});
