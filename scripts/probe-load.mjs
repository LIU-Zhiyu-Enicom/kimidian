#!/usr/bin/env node
/**
 * Kimidian 回放完整性探针：session/load 一个真实会话，记录全部
 * session/update 回放通知（含到达顺序：响应前/后），与 wire.jsonl 对比。
 *
 * 用法：node scripts/probe-load.mjs <sessionId> <cwd> [--dump]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const KIMI = process.env.KIMIDIAN_CLI ?? "C:/Users/rh/.kimi-code/bin/kimi.exe";
const sessionId = process.argv[2];
const cwd = process.argv[3];
const dump = process.argv.includes("--dump");
if (!sessionId || !cwd) {
  console.error("用法: node scripts/probe-load.mjs <sessionId> <cwd> [--dump]");
  process.exit(1);
}

const proc = spawn(KIMI, ["acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd,
  windowsHide: true,
});

let buf = "";
let done = false;
let loadResolved = false; // session/load 响应是否已返回
const events = []; // { phase: 'pre'|'post', update, text }
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
      if (m.params?.sessionId !== sessionId) continue;
      const u = m.params?.update;
      const kind = u?.sessionUpdate;
      const c = u?.content;
      const text = c && c.type === "text" ? c.text : "";
      events.push({ phase: loadResolved ? "post" : "pre", kind, text, update: u });
      continue;
    }
    if (m.method) continue;

    if (m.id === 1) {
      if (m.error) finish(1, `initialize 失败: ${JSON.stringify(m.error)}`);
      send({ jsonrpc: "2.0", id: 2, method: "session/load",
        params: { sessionId, cwd, mcpServers: [] } });
    } else if (m.id === 2) {
      if (m.error) finish(1, `session/load 失败: ${JSON.stringify(m.error)}`);
      loadResolved = true;
      console.log(`== session/load 响应已返回（此前已收 ${events.length} 条回放）==`);
      // 响应后再等 3s，看是否还有迟到的回放通知
      setTimeout(() => {
        summarize();
        finish(0);
      }, 3000);
    }
  }
});

function summarize() {
  const pre = events.filter((e) => e.phase === "pre");
  const post = events.filter((e) => e.phase === "post");
  console.log(`\n== 回放通知统计 ==`);
  console.log(`响应前 ${pre.length} 条，响应后 ${post.length} 条`);
  const tally = (arr) => {
    const t = {};
    for (const e of arr) t[e.kind] = (t[e.kind] ?? 0) + 1;
    return JSON.stringify(t);
  };
  console.log(`响应前分类: ${tally(pre)}`);
  console.log(`响应后分类: ${tally(post)}`);

  // 用户消息（含 reminder 判定）
  const users = events.filter((e) => e.kind === "user_message_chunk").map((e) => e.text);
  console.log(`\n== 用户消息回放 ${users.length} 段 ==`);
  users.forEach((t, i) => {
    const tag = t.includes("<system-reminder>") ? " [含 system-reminder!]" : "";
    console.log(`  U${i + 1} len=${t.length}${tag}: ${t.slice(0, 60).replace(/\n/g, "\\n")}`);
  });

  // 助手消息
  const agents = events.filter((e) => e.kind === "agent_message_chunk").map((e) => e.text);
  console.log(`\n== 助手消息回放 ${agents.length} 段 ==`);
  agents.forEach((t, i) =>
    console.log(`  A${i + 1} len=${t.length}: ${t.slice(0, 60).replace(/\n/g, "\\n")}`));

  const thoughts = events.filter((e) => e.kind === "agent_thought_chunk");
  const tools = events.filter((e) => e.kind === "tool_call");
  console.log(`\n思考块 ${thoughts.length} 段，工具调用 ${tools.length} 个`);

  // 与 wire.jsonl 对比：用户 turn.prompt 数 vs 回放用户消息数
  const home = process.env.USERPROFILE ?? "C:/Users/rh";
  const wdName = path.basename(path.dirname(path.dirname(cwd))); // 不可靠，直接扫
  const sessionsRoot = path.join(home, ".kimi-code", "sessions");
  for (const wd of fs.readdirSync(sessionsRoot)) {
    const wire = path.join(sessionsRoot, wd, sessionId, "agents", "main", "wire.jsonl");
    if (!fs.existsSync(wire)) continue;
    const lines = fs.readFileSync(wire, "utf-8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    const prompts = lines.filter((l) => l.type === "turn.prompt");
    const injections = lines.filter((l) =>
      l.type === "context.append_message" && l.message?.origin?.kind === "injection");
    console.log(`\n== wire.jsonl 对比 ==`);
    console.log(`wire turn.prompt 数: ${prompts.length}（回放用户消息 ${users.length} 段）`);
    console.log(`wire 注入消息数: ${injections.length}`);
    if (dump) {
      fs.writeFileSync("scripts/.probe-load-dump.json",
        JSON.stringify(events, null, 1));
      console.log("已导出 scripts/.probe-load-dump.json");
    }
    break;
  }
}

send({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: "kimidian-probe-load", version: "0.1.0" },
  },
});

setTimeout(() => finish(2, "\n超时（60s）"), 60000);
