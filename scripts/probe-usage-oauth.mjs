#!/usr/bin/env node
/**
 * 探针：OAuth 路径（干净环境）跑 2 轮真实会话，每轮后等 5 秒，
 * 然后扫描 wire.jsonl 确认 usage.record / step.end 是否存在。
 * 同时打印所有 session/update 类型与响应 _meta，复核协议层。
 */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KIMI = "C:/Users/rh/.kimi-code/bin/kimi.exe";
const CWD = process.cwd();
const SESSIONS = "C:/Users/rh/.kimi-code/sessions";

const proc = spawn(KIMI, ["acp"], { stdio: ["pipe", "pipe", "pipe"], cwd: CWD, windowsHide: true });
let buf = "", sid = null, done = false;
const updateTypes = new Set();
const finish = (code, msg) => {
  if (done) return;
  done = true;
  if (msg) console.log(msg);
  proc.kill();
  setTimeout(() => process.exit(code), 300);
};
const send = (o) => proc.stdin.write(JSON.stringify(o) + "\n");

function scanWire() {
  for (const wd of readdirSync(SESSIONS)) {
    const p = join(SESSIONS, wd, sid, "agents", "main", "wire.jsonl");
    try {
      const txt = readFileSync(p, "utf8");
      const types = {};
      for (const line of txt.split("\n")) {
        const m = line.match(/"type":"([a-z._]+)"/);
        if (m) types[m[1]] = (types[m[1]] ?? 0) + 1;
      }
      console.log(`\n[wire.jsonl 扫描 @${new Date().toLocaleTimeString()}]`, p);
      console.log("  记录类型:", JSON.stringify(types));
      console.log("  usage.record:", txt.includes('"usage.record"') ? "有" : "无");
      console.log("  step.end:", txt.includes('"step.end"') ? "有" : "无");
      const llmReq = [...txt.matchAll(/"type":"llm.request"[^\n]*/g)].pop();
      if (llmReq) console.log("  最后 llm.request:", llmReq[0].slice(0, 300));
      return;
    } catch { /* 不在此目录 */ }
  }
  console.log("[扫描] 未找到 wire.jsonl");
}

proc.on("error", (e) => { console.error("spawn 失败:", e.message); process.exit(1); });
proc.stderr.on("data", () => {});
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
      const u = m.params?.update;
      updateTypes.add(u?.sessionUpdate);
      if (u?._meta || m.params?._meta) console.log("[update _meta]", JSON.stringify(u?._meta ?? m.params?._meta));
      continue;
    }
    if (m.method) continue;
    if (m.result?._meta) console.log(`[响应 id=${m.id} _meta]`, JSON.stringify(m.result._meta));
    if (m.id === 1) {
      send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: CWD, mcpServers: [] } });
    } else if (m.id === 2) {
      sid = m.result.sessionId;
      console.log("sessionId:", sid);
      send({ jsonrpc: "2.0", id: 3, method: "session/prompt",
        params: { sessionId: sid, prompt: [{ type: "text", text: "只回复两个字：你好。" }] } });
    } else if (m.id === 3) {
      console.log("第 1 轮结束:", JSON.stringify(m.result));
      console.log("等 5 秒后扫描…");
      setTimeout(() => {
        scanWire();
        send({ jsonrpc: "2.0", id: 4, method: "session/prompt",
          params: { sessionId: sid, prompt: [{ type: "text", text: "再回复两个字：好的。" }] } });
      }, 5000);
    } else if (m.id === 4) {
      console.log("\n第 2 轮结束:", JSON.stringify(m.result));
      console.log("等 5 秒后扫描…");
      setTimeout(() => {
        scanWire();
        console.log("\n所有 session/update 类型:", [...updateTypes].join(", "));
        finish(0, "探针结束。");
      }, 5000);
    }
  }
});

send({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: "kimidian-probe", version: "0.1.0" },
  },
});
setTimeout(() => finish(2, "\n超时（90s）"), 90000);
