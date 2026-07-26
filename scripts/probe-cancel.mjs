#!/usr/bin/env node
/**
 * cancel 链路探针（关键实证）：会话里 prompt → 流式中途 session/cancel →
 * 等 prompt 响应（stopReason?）→ 同会话再 prompt，看第二轮是否正常流式。
 *
 * 用法（干净环境）：
 *   env -u KIMI_API_KEY -u KIMI_BASE_URL -u KIMI_AGENT_GW_KEY -u AGENT_GW_MCP_URL \
 *     -u KIMI_CODE_EXPERIMENTAL_TOOL_SELECT -u KIMI_SHELL_PATH \
 *     node scripts/probe-cancel.mjs
 */
import { spawn } from "node:child_process";

const KIMI = process.env.KIMIDIAN_CLI ?? "C:/Users/rh/.kimi-code/bin/kimi.exe";
const CWD = process.env.KIMIDIAN_CWD ?? "D:/warehouse/Stock";

const proc = spawn(KIMI, ["acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: CWD,
  windowsHide: true,
});

let buf = "";
let done = false;
const t0 = Date.now();
const finish = (code, msg) => {
  if (done) return;
  done = true;
  if (msg) console.log(msg);
  proc.kill();
  setTimeout(() => process.exit(code), 300);
};
const send = (o) => proc.stdin.write(JSON.stringify(o) + "\n");
const el = () => `+${Date.now() - t0}ms`;

let sessionId = null;
let turn1Chunks = 0;
let turn2Chunks = 0;
let cancelSentAt = 0;
let firstChunkAt = 0;

proc.on("error", (e) => { console.error("spawn 失败:", e.message); process.exit(1); });
proc.stderr.on("data", (d) => {
  const s = d.toString().trim();
  if (s) console.error("[stderr]", s.slice(0, 160));
});

proc.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (done) continue;

    if (m.method === "session/update") {
      const kind = m.params?.update?.sessionUpdate;
      if (kind === "agent_message_chunk" || kind === "agent_thought_chunk") {
        if (turn1Chunks >= 0 && cancelSentAt === 0) {
          turn1Chunks++;
          if (!firstChunkAt) firstChunkAt = Date.now() - t0;
          // 收到第 3 个 chunk 后 cancel（流式进行中）
          if (turn1Chunks === 3) {
            cancelSentAt = Date.now();
            console.log(`${el()} 流式进行中发送 session/cancel`);
            send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
          }
        } else {
          turn2Chunks++;
        }
      }
      continue;
    }
    if (m.method === "session/request_permission") {
      const opts = m.params?.options ?? [];
      const opt = opts.find((o) => o.kind === "allow_once") ?? opts[0];
      send({ jsonrpc: "2.0", id: m.id, result: { outcome: opt ? { outcome: "selected", optionId: opt.optionId } : { outcome: "cancelled" } } });
      continue;
    }
    if (m.method) continue;

    if (m.id === 1) {
      if (m.error) return finish(1, `initialize 失败: ${JSON.stringify(m.error)}`);
      send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: CWD, mcpServers: [] } });
    } else if (m.id === 2) {
      if (m.error) return finish(1, `session/new 失败: ${JSON.stringify(m.error)}`);
      sessionId = m.result.sessionId;
      console.log(`会话: ${sessionId}`);
      send({ jsonrpc: "2.0", id: 3, method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text: "用中文从 1 数到 100，每个数字一行，不要别的内容。" }] } });
    } else if (m.id === 3) {
      // 第一轮 prompt 响应（cancel 后应返回 cancelled）
      const sr = m.result?.stopReason;
      const cancelLatency = cancelSentAt ? Date.now() - cancelSentAt : -1;
      console.log(`${el()} 第一轮 prompt 响应: stopReason=${sr}（cancel 后 ${cancelLatency}ms 返回，已收 ${turn1Chunks} chunk，首 chunk +${firstChunkAt}ms）`);
      if (m.error) console.log(`  （第一轮带 error: ${JSON.stringify(m.error).slice(0, 200)}）`);
      // 同会话再发第二轮
      console.log("== 同会话再发第二轮 prompt ==");
      turn1Chunks = -1; // 后续 chunk 计入 turn2
      send({ jsonrpc: "2.0", id: 4, method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text: "只回复两个字：正常。" }] } });
    } else if (m.id === 4) {
      const sr = m.result?.stopReason;
      console.log(`${el()} 第二轮 prompt 响应: stopReason=${sr}，流式 chunk ${turn2Chunks} 个`);
      if (m.error) console.log(`  第二轮 error: ${JSON.stringify(m.error).slice(0, 300)}`);
      const ok = !m.error && turn2Chunks > 0;
      finish(ok ? 0 : 2,
        ok
          ? "\n结论：cancel 后同会话可继续正常工作（无需重建会话）"
          : "\n结论：cancel 后同会话不可用 → 插件停止后应自动重建会话");
    }
  }
});

setTimeout(() => finish(3, `\n超时（120s）turn1Chunks=${turn1Chunks} turn2Chunks=${turn2Chunks}`), 120000);

send({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: "kimidian-probe", version: "0.1.0" },
  },
});
