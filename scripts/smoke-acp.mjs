#!/usr/bin/env node
/**
 * Kimidian 冒烟测试：spawn `kimi.exe acp`，完成 ACP initialize 握手并打印能力。
 *
 * 用法：
 *   node scripts/smoke-acp.mjs            # 仅 initialize
 *   node scripts/smoke-acp.mjs --prompt   # 加测 session/new + 简单流式 prompt（需已 kimi login）
 */
import { spawn } from "node:child_process";

const KIMI = process.env.KIMIDIAN_CLI ?? "C:/Users/rh/.kimi-code/bin/kimi.exe";
const CWD = process.env.KIMIDIAN_CWD ?? process.cwd();
const WITH_PROMPT = process.argv.includes("--prompt");

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

const send = (o) => {
  console.log(">>>", JSON.stringify(o));
  proc.stdin.write(JSON.stringify(o) + "\n");
};

proc.on("error", (e) => {
  console.error("spawn 失败:", e.message);
  process.exit(1);
});
proc.stderr.on("data", (d) => console.error("[stderr]", d.toString().trim()));

proc.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      console.log("[非 JSON 行]", line.slice(0, 200));
      continue;
    }
    if (done) continue;
    if (m.method === "session/update") {
      const u = m.params?.update;
      if (u?.sessionUpdate === "agent_message_chunk") {
        process.stdout.write(u.content?.text ?? "");
      } else {
        console.log("\n[update]", u?.sessionUpdate, JSON.stringify(u).slice(0, 200));
      }
      continue;
    }
    if (m.method) {
      console.log("[agent 请求]", m.method, JSON.stringify(m.params).slice(0, 300));
      continue;
    }
    console.log("<<<", JSON.stringify(m.result ?? m.error).slice(0, 3000));

    if (m.id === 1) {
      if (m.error) finish(1, "initialize 失败");
      const caps = m.result?.agentCapabilities ?? {};
      console.log("\n== 能力矩阵 ==");
      console.log("loadSession:", caps.loadSession);
      console.log("promptCapabilities:", JSON.stringify(caps.promptCapabilities));
      console.log("mcpCapabilities:", JSON.stringify(caps.mcpCapabilities));
      console.log("sessionCapabilities:", JSON.stringify(caps.sessionCapabilities));
      console.log("authMethods:", JSON.stringify(m.result?.authMethods?.map((a) => a.id)));
      if (!WITH_PROMPT) finish(0, "\ninitialize 握手成功。");
      send({
        jsonrpc: "2.0",
        id: 2,
        method: "session/new",
        params: { cwd: CWD, mcpServers: [] },
      });
    } else if (m.id === 2) {
      if (m.error) {
        if (m.error.code === -32000) {
          finish(3, "\nsession/new 返回 AUTH_REQUIRED (-32000)：用户未登录，请先在终端运行 `kimi login`。");
        } else {
          finish(1, `\nsession/new 失败: ${JSON.stringify(m.error)}`);
        }
        continue;
      }
      console.log("sessionId:", m.result.sessionId);
      console.log("configOptions:", JSON.stringify(m.result.configOptions).slice(0, 1500));
      globalThis.__sid = m.result.sessionId;
      send({
        jsonrpc: "2.0",
        id: 3,
        method: "session/prompt",
        params: {
          sessionId: m.result.sessionId,
          prompt: [{ type: "text", text: "只回复两个字：你好。不要使用任何工具。" }],
        },
      });
      console.log("\n== 流式输出 ==");
    } else if (m.id === 3) {
      finish(m.error ? 1 : 0, `\n\nprompt 结束: ${JSON.stringify(m.result ?? m.error)}`);
    }
  }
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: "kimidian-smoke", version: "0.1.0" },
  },
});

setTimeout(() => finish(2, "\n超时（120s）"), 120000);
