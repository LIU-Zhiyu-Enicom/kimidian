#!/usr/bin/env node
/**
 * Kimidian 并行探针：单个 kimi acp 进程建两个会话，同时发 prompt，
 * 观察两个会话的 session/update 是否交错到达（真并行）还是严格先后（串行排队）。
 *
 * 用法：node scripts/probe-parallel.mjs   （需已 kimi login）
 */
import { spawn } from "node:child_process";

const KIMI = process.env.KIMIDIAN_CLI ?? "C:/Users/rh/.kimi-code/bin/kimi.exe";
const CWD = process.env.KIMIDIAN_CWD ?? process.cwd();

const proc = spawn(KIMI, ["acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: CWD,
  windowsHide: true,
});

let buf = "";
let done = false;
const sessions = {}; // sessionId -> { chunks: [{t, kind}], started, ended }
const finish = (code, msg) => {
  if (done) return;
  done = true;
  if (msg) console.log(msg);
  proc.kill();
  setTimeout(() => process.exit(code), 300);
};
const send = (o) => proc.stdin.write(JSON.stringify(o) + "\n");

proc.on("error", (e) => { console.error("spawn 失败:", e.message); process.exit(1); });
proc.stderr.on("data", (d) => console.error("[stderr]", d.toString().trim().slice(0, 200)));

const t0 = Date.now();
const stamp = (sessionId, kind) => {
  const s = sessions[sessionId] ??= { events: [] };
  s.events.push({ t: Date.now() - t0, kind });
};

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
      const sid = m.params?.sessionId;
      const u = m.params?.update;
      if (sid && u?.sessionUpdate === "agent_message_chunk") stamp(sid, "chunk");
      continue;
    }
    if (m.method) continue;

    if (m.id === 1) {
      send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: CWD, mcpServers: [] } });
    } else if (m.id === 2) {
      globalThis.__s1 = m.result.sessionId;
      send({ jsonrpc: "2.0", id: 3, method: "session/new", params: { cwd: CWD, mcpServers: [] } });
    } else if (m.id === 3) {
      globalThis.__s2 = m.result.sessionId;
      console.log(`会话 A: ${globalThis.__s1}\n会话 B: ${globalThis.__s2}`);
      console.log("== 同时发送两个 prompt ==");
      const prompt = (id, sessionId, text) => send({
        jsonrpc: "2.0", id, method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text }] },
      });
      // 两个长回答 prompt 同时发出
      prompt(4, globalThis.__s1, "用中文从 1 数到 30，每个数字一行，不要别的内容。");
      prompt(5, globalThis.__s2, "用中文从 31 数到 60，每个数字一行，不要别的内容。");
    } else if (m.id === 4 || m.id === 5) {
      const sid = m.id === 4 ? globalThis.__s1 : globalThis.__s2;
      stamp(sid, "end");
      if (sessions[globalThis.__s1]?.events.some((e) => e.kind === "end") &&
          sessions[globalThis.__s2]?.events.some((e) => e.kind === "end")) {
        analyze();
        finish(0);
      }
    }
  }
});

function analyze() {
  const a = sessions[globalThis.__s1]?.events ?? [];
  const b = sessions[globalThis.__s2]?.events ?? [];
  const firstA = a.find((e) => e.kind === "chunk")?.t;
  const firstB = b.find((e) => e.kind === "chunk")?.t;
  const endA = a.find((e) => e.kind === "end")?.t;
  const endB = b.find((e) => e.kind === "end")?.t;
  console.log("\n== 时序 ==");
  console.log(`A: 首个 chunk ${firstA}ms，结束 ${endA}ms，chunk 数 ${a.filter((e) => e.kind === "chunk").length}`);
  console.log(`B: 首个 chunk ${firstB}ms，结束 ${endB}ms，chunk 数 ${b.filter((e) => e.kind === "chunk").length}`);
  // 并行判定：两个会话的流式窗口有重叠
  const overlap = firstA != null && firstB != null && endA != null && endB != null &&
    Math.max(firstA, firstB) < Math.min(endA, endB);
  console.log(overlap
    ? "\n✅ 真并行：两会话流式窗口重叠，单 acp 进程可同时服务多会话。"
    : "\n⚠️ 串行排队：B 在 A 结束后才开始（UI 应给排队标签等待态）。");
}

send({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: "kimidian-probe-parallel", version: "0.1.0" },
  },
});

setTimeout(() => finish(2, "\n超时（150s）"), 150000);
