#!/usr/bin/env node
/**
 * 复现 kimidian 插件实测故障：session/prompt 返回 -32603 Internal error。
 *
 * 完全模仿 src/acp-client.ts 的行为：
 *   1. initialize（与插件相同的 clientCapabilities：fs read/write = true）
 *   2. session/new，cwd = D:\warehouse\Stock
 *   3. session/prompt，内容 "请体检这个知识库" + 插件实际拼接的 active-note XML 前缀
 *   4. 实现 fs/read_text_file / fs/write_text_file 反向 RPC（与插件相同的响应格式）
 *
 * 全量打印：agent 请求、我们的响应、session/update、stderr、完整错误对象。
 */
import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";

const KIMI = "C:/Users/rh/.kimi-code/bin/kimi.exe";
const CWD = "D:/warehouse/Stock";
// 模拟用户当时有打开的笔记（插件会附 active-note 前缀）
const ACTIVE_NOTE = process.argv[2] ?? "Test.md";
// 可通过 argv[3] 自定义 prompt；默认复现用户原始输入
const USER_PROMPT = process.argv[3] ?? "请体检这个知识库";
const PROMPT_TEXT = `${USER_PROMPT}\n\n<active-note path="${ACTIVE_NOTE}" />`;

const proc = spawn(KIMI, ["acp"], { stdio: ["pipe", "pipe", "pipe"], cwd: CWD, windowsHide: true });

let buf = "";
const send = (o) => {
  console.log(">>>", JSON.stringify(o).slice(0, 500));
  proc.stdin.write(JSON.stringify(o) + "\n");
};
const respond = (id, result, error) => {
  const msg = { jsonrpc: "2.0", id };
  if (error) msg.error = error;
  else msg.result = result ?? null;
  console.log(">>> [响应 agent]", JSON.stringify(msg).slice(0, 500));
  proc.stdin.write(JSON.stringify(msg) + "\n");
};

proc.on("error", (e) => { console.error("spawn 失败:", e); process.exit(1); });
proc.stderr.on("data", (d) => console.error("[stderr]", d.toString().trim()));

proc.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { console.log("[非 JSON]", line.slice(0, 300)); continue; }

    // agent → client 请求
    if (m.method && m.id !== undefined && m.id !== null) {
      console.log(`[agent 请求] ${m.method} id=${m.id}`, JSON.stringify(m.params).slice(0, 600));
      void handleAgentRequest(m);
      continue;
    }
    // 通知
    if (m.method === "session/update") {
      const u = m.params?.update;
      if (u?.sessionUpdate === "agent_message_chunk") {
        process.stdout.write(u.content?.text ?? "");
      } else {
        console.log("\n[update]", JSON.stringify(u).slice(0, 400));
      }
      continue;
    }
    // 响应
    console.log("\n<<< id=" + m.id, JSON.stringify(m.result ?? m.error).slice(0, 2000));
    if (m.id === 1) {
      send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: CWD, mcpServers: [] } });
    } else if (m.id === 2) {
      if (m.error) { console.error("session/new 完整错误:", JSON.stringify(m.error, null, 2)); finish(1); }
      else {
        globalThis.sid = m.result.sessionId;
        console.log("sessionId:", m.result.sessionId);
        send({
          jsonrpc: "2.0", id: 3, method: "session/prompt",
          params: { sessionId: m.result.sessionId, prompt: [{ type: "text", text: PROMPT_TEXT }] },
        });
        console.log("\n== 流式输出 ==");
      }
    } else if (m.id === 3) {
      if (m.error) console.error("\nprompt 完整错误对象:", JSON.stringify(m.error, null, 2));
      else console.log("\n\nprompt 完成:", JSON.stringify(m.result));
      finish(m.error ? 1 : 0);
    }
  }
});

/** 与插件 handleAgentRequest 完全相同的实现 */
async function handleAgentRequest(m) {
  const { id, method, params: p } = m;
  try {
    if (method === "session/request_permission") {
      // 插件 autoApprove 时优先 allow_always
      const opts = p?.options ?? [];
      const opt = opts.find((o) => o.kind === "allow_always") ?? opts.find((o) => o.kind === "allow_once");
      respond(id, { outcome: opt ? { outcome: "selected", optionId: opt.optionId } : { outcome: "cancelled" } });
      return;
    }
    if (method === "fs/read_text_file") {
      let content = await fsp.readFile(p.path, "utf8");
      if (p.line != null || p.limit != null) {
        const lines = content.split("\n");
        const start = Math.max(0, (p.line ?? 1) - 1);
        const end = p.limit != null ? start + p.limit : undefined;
        content = lines.slice(start, end).join("\n");
      }
      respond(id, { content });
      return;
    }
    if (method === "fs/write_text_file") {
      // 复现脚本只读测试，不写盘，直接回成功但打印
      console.log(`[!!] agent 想写文件: ${p.path}（复现脚本未真正写入）`);
      respond(id, {});
      return;
    }
    respond(id, undefined, { code: -32601, message: `Method not found: ${method}` });
  } catch (e) {
    console.error(`[fs 处理异常] ${method}:`, e.message);
    respond(id, undefined, { code: -32603, message: String(e) });
  }
}

let finished = false;
function finish(code) {
  if (finished) return;
  finished = true;
  proc.kill();
  setTimeout(() => process.exit(code), 300);
}

send({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: "kimidian", version: "0.1.0" },
  },
});

setTimeout(() => { console.error("\n超时 180s"); finish(2); }, 180000);
