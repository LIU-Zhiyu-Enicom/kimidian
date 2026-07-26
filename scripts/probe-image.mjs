#!/usr/bin/env node
/**
 * Kimidian 图片附件探针：spawn `kimi.exe acp`，session/new 后发送
 * text + image（1x1 PNG base64）混合 prompt，验证 ACP 链路接受 image block。
 *
 * 用法：node scripts/probe-image.mjs   （需已 kimi login）
 */
import { spawn } from "node:child_process";

const KIMI = process.env.KIMIDIAN_CLI ?? "C:/Users/rh/.kimi-code/bin/kimi.exe";
const CWD = process.env.KIMIDIAN_CWD ?? process.cwd();

// 1x1 透明 PNG
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const proc = spawn(KIMI, ["acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: CWD,
  windowsHide: true,
});

let buf = "";
let done = false;
let streamed = "";
const finish = (code, msg) => {
  if (done) return;
  done = true;
  if (msg) console.log(msg);
  proc.kill();
  setTimeout(() => process.exit(code), 300);
};

const send = (o) => proc.stdin.write(JSON.stringify(o) + "\n");

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
      continue;
    }
    if (done) continue;
    if (m.method === "session/update") {
      const u = m.params?.update;
      if (u?.sessionUpdate === "agent_message_chunk") {
        streamed += u.content?.text ?? "";
        process.stdout.write(u.content?.text ?? "");
      }
      continue;
    }
    if (m.method) continue; // agent 反向请求（权限等）忽略

    if (m.id === 1) {
      if (m.error) finish(1, `initialize 失败: ${JSON.stringify(m.error)}`);
      send({
        jsonrpc: "2.0",
        id: 2,
        method: "session/new",
        params: { cwd: CWD, mcpServers: [] },
      });
    } else if (m.id === 2) {
      if (m.error) finish(1, `session/new 失败: ${JSON.stringify(m.error)}`);
      console.log("sessionId:", m.result.sessionId);
      send({
        jsonrpc: "2.0",
        id: 3,
        method: "session/prompt",
        params: {
          sessionId: m.result.sessionId,
          prompt: [
            {
              type: "text",
              text: "我发了一张 1x1 像素的图片。请用一句话确认你收到了图片，不要使用任何工具。",
            },
            { type: "image", data: PNG_1PX, mimeType: "image/png" },
          ],
        },
      });
      console.log("== 流式输出 ==");
    } else if (m.id === 3) {
      if (m.error) {
        finish(1, `\n\nprompt 报错（图片 block 不被接受？）: ${JSON.stringify(m.error)}`);
      }
      console.log(`\n\nprompt 结束: ${JSON.stringify(m.result)}`);
      finish(streamed.trim().length > 0 ? 0 : 4,
        streamed.trim().length > 0
          ? "✅ image block 被接受，模型有回复。"
          : "❌ prompt 成功但无任何流式回复。");
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
    clientInfo: { name: "kimidian-probe-image", version: "0.1.0" },
  },
});

setTimeout(() => finish(2, "\n超时（120s）"), 120000);
