#!/usr/bin/env node
/**
 * 探针：完整打印 ACP 会话中所有消息的 _meta / usage 相关字段，
 * 用于确认 CLI 是否通过 ACP 推送 token 用量。
 */
import { spawn } from "node:child_process";

const KIMI = "C:/Users/rh/.kimi-code/bin/kimi.exe";
const CWD = process.cwd();

const proc = spawn(KIMI, ["acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: CWD,
  windowsHide: true,
});

let buf = "";
let done = false;
const finish = (code, msg) => {
  if (done) return;
  done = true;
  if (msg) console.log(msg);
  proc.kill();
  setTimeout(() => process.exit(code), 300);
};

const send = (o) => proc.stdin.write(JSON.stringify(o) + "\n");

// 只挑含 usage/token/_meta 的部分打印，agent_message_chunk 只打 _meta
const interesting = (m) => {
  const s = JSON.stringify(m);
  const out = {};
  if (m._meta) out._meta = m._meta;
  if (m.params?._meta) out.params_meta = m.params._meta;
  if (m.params?.update?._meta) out.update_meta = m.params.update._meta;
  if (m.result?._meta) out.result_meta = m.result._meta;
  const usageMatch = s.match(/"usage":\{[^}]*\}/g);
  if (usageMatch) out.usage = usageMatch;
  if (Object.keys(out).length === 0) return null;
  return out;
};

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

    const hit = interesting(m);
    if (m.method === "session/update") {
      const ut = m.params?.update?.sessionUpdate;
      if (hit) console.log(`[update:${ut}]`, JSON.stringify(hit).slice(0, 600));
      continue;
    }
    if (m.method) {
      if (hit) console.log(`[agent 请求 ${m.method}]`, JSON.stringify(hit).slice(0, 600));
      continue;
    }
    // 响应
    if (hit) console.log(`[响应 id=${m.id}]`, JSON.stringify(hit).slice(0, 800));

    if (m.id === 1) {
      if (m.error) finish(1, "initialize 失败");
      send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: CWD, mcpServers: [] } });
    } else if (m.id === 2) {
      if (m.error) finish(1, `session/new 失败: ${JSON.stringify(m.error)}`);
      console.log("sessionId:", m.result.sessionId);
      send({
        jsonrpc: "2.0", id: 3, method: "session/prompt",
        params: { sessionId: m.result.sessionId, prompt: [{ type: "text", text: "只回复两个字：你好。" }] },
      });
    } else if (m.id === 3) {
      console.log("\n== prompt 响应全文 ==");
      console.log(JSON.stringify(m.result ?? m.error).slice(0, 2000));
      console.log("等待 5 秒让 CLI 落盘 usage 记录……");
      setTimeout(() => finish(m.error ? 1 : 0, "\n探针结束。"), 5000);
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
