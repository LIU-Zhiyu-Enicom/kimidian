#!/usr/bin/env node
/**
 * 渲染回归探针：模拟插件客户端（initialize → session/new → prompt 触发工具调用），
 * 逐条记录 CLI 发出的 session/update 通知类型与时序，判定「界面零渲染」是
 * CLI 没发通知（CLI 侧）还是通知到了但插件渲染层挂了（插件侧）。
 *
 * 用法（干净环境）：
 *   env -u KIMI_API_KEY -u KIMI_BASE_URL -u KIMI_AGENT_GW_KEY -u AGENT_GW_MCP_URL \
 *     -u KIMI_CODE_EXPERIMENTAL_TOOL_SELECT -u KIMI_SHELL_PATH \
 *     node scripts/probe-render.mjs
 */
import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { resolve } from "node:path";

const KIMI = process.env.KIMIDIAN_CLI ?? "C:/Users/rh/.kimi-code/bin/kimi.exe";
const CWD = process.env.KIMIDIAN_CWD ?? "D:/warehouse/Stock";
const PROMPT =
  process.env.KIMIDIAN_PROMPT ?? "读一下 SCHEMA.md 并总结";

const proc = spawn(KIMI, ["acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: CWD,
  windowsHide: true,
});

let buf = "";
let done = false;
const t0 = Date.now();
const events = []; // {t, kind, detail}
const counts = {};
const finish = (code, msg) => {
  if (done) return;
  done = true;
  if (msg) console.log(msg);
  console.log("\n== session/update 统计 ==");
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k}: ${n}`);
  console.log("\n== 时序（前 40 条）==");
  for (const e of events.slice(0, 40))
    console.log(`  +${String(e.t).padStart(6)}ms ${e.kind}${e.detail ? "  " + e.detail : ""}`);
  proc.kill();
  setTimeout(() => process.exit(code), 300);
};
const send = (o) => proc.stdin.write(JSON.stringify(o) + "\n");
const stamp = (kind, detail) => {
  events.push({ t: Date.now() - t0, kind, detail });
  counts[kind] = (counts[kind] ?? 0) + 1;
};

proc.on("error", (e) => { console.error("spawn 失败:", e.message); process.exit(1); });
proc.stderr.on("data", (d) => {
  const s = d.toString().trim();
  if (s) console.error("[stderr]", s.slice(0, 200));
});

let sessionId = null;

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

    // 通知
    if (m.method === "session/update") {
      const u = m.params?.update;
      const kind = u?.sessionUpdate ?? "?";
      let detail = "";
      if (kind === "tool_call") detail = (u.title ?? u.kind ?? "").slice(0, 60);
      if (kind === "tool_call_update") detail = (u.status ?? "").slice(0, 30);
      stamp(`update:${kind}`, detail);
      continue;
    }
    // agent 反向请求（权限 / fs）
    if (m.method === "session/request_permission") {
      stamp("req:permission", (m.params?.toolCall?.title ?? "").slice(0, 60));
      const opts = m.params?.options ?? [];
      const opt = opts.find((o) => o.kind === "allow_once") ?? opts[0];
      send({ jsonrpc: "2.0", id: m.id, result: { outcome: opt ? { outcome: "selected", optionId: opt.optionId } : { outcome: "cancelled" } } });
      continue;
    }
    if (m.method === "fs/read_text_file") {
      const p = m.params ?? {};
      stamp("req:fs/read", (p.path ?? "").slice(0, 70));
      (async () => {
        try {
          let content = await fsp.readFile(
            /^[a-zA-Z]:[\\/]/.test(p.path) ? p.path : resolve(CWD, p.path), "utf8");
          if (p.line != null || p.limit != null) {
            const lines = content.split("\n");
            const start = Math.max(0, (p.line ?? 1) - 1);
            content = lines.slice(start, p.limit != null ? start + p.limit : undefined).join("\n");
          }
          send({ jsonrpc: "2.0", id: m.id, result: { content } });
        } catch (e) {
          send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: String(e.message ?? e) } });
        }
      })();
      continue;
    }
    if (m.method === "fs/write_text_file") {
      stamp("req:fs/write", (m.params?.path ?? "").slice(0, 70));
      send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "probe 不写盘" } });
      continue;
    }
    if (m.method) {
      stamp(`notify:${m.method}`);
      continue;
    }

    // 响应
    if (m.id === 1) {
      if (m.error) return finish(1, `initialize 失败: ${JSON.stringify(m.error)}`);
      stamp("initialize ok", m.result?.agentInfo?.version ?? "");
      send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: CWD, mcpServers: [] } });
    } else if (m.id === 2) {
      if (m.error) return finish(1, `session/new 失败: ${JSON.stringify(m.error)}`);
      sessionId = m.result.sessionId;
      stamp("session/new ok", sessionId);
      console.log(`会话: ${sessionId}（cwd=${CWD}）\nprompt: ${PROMPT}`);
      send({ jsonrpc: "2.0", id: 3, method: "session/prompt",
        params: { sessionId, prompt: [{ type: "text", text: PROMPT }] } });
    } else if (m.id === 3) {
      if (m.error) return finish(1, `prompt 失败: ${JSON.stringify(m.error)}`);
      stamp("prompt end", `stopReason=${m.result?.stopReason}`);
      const got = Object.keys(counts).filter((k) => k.startsWith("update:"));
      const hasContent = ["update:agent_message_chunk", "update:agent_thought_chunk", "update:tool_call"]
        .some((k) => counts[k] > 0);
      finish(hasContent ? 0 : 2,
        hasContent
          ? `\n结论：CLI 正常发出内容类 session/update（${got.join(", ")}）→ 问题在插件渲染层`
          : `\n结论：整轮没有内容类 session/update → 问题在 CLI 侧`);
    }
  }
});

setTimeout(() => finish(3, "\n超时（90s）"), 90000);

send({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: "kimidian-probe", version: "0.1.0" },
  },
});
