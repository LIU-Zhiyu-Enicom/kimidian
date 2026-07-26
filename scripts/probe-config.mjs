#!/usr/bin/env node
/**
 * 探针：模型选择器回归排查。
 * 1) session/new 返回的 configOptions 完整结构
 * 2) set_config_option(mode=default) 的响应（syncCliMode 同款调用）
 * 3) set_config_option(model=?) 的响应
 * 4) 全程打印 config_option_update 通知
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

const summarize = (opts) =>
  (opts ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    category: o.category,
    currentValue: o.currentValue,
    options: (o.options ?? []).map((x) => x.value ?? x),
  }));

let sid = null;

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
      if (u?.sessionUpdate === "config_option_update") {
        console.log("\n[通知 config_option_update]", JSON.stringify(summarize(u.configOptions), null, 1));
      }
      continue;
    }
    if (m.method) continue;

    if (m.id === 1) {
      if (m.error) finish(1, "initialize 失败");
      send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: CWD, mcpServers: [] } });
    } else if (m.id === 2) {
      if (m.error) finish(1, `session/new 失败: ${JSON.stringify(m.error)}`);
      sid = m.result.sessionId;
      console.log("== 1. session/new configOptions ==");
      console.log(JSON.stringify(summarize(m.result.configOptions), null, 1));
      console.log("\n== 1b. model 条目原始 JSON ==");
      console.log(JSON.stringify(m.result.configOptions?.find((o) => o.id === "model")));
      // syncCliMode 同款：把 mode 写成 default
      send({ jsonrpc: "2.0", id: 3, method: "session/set_config_option",
        params: { sessionId: sid, configId: "mode", value: "default" } });
    } else if (m.id === 3) {
      console.log("\n== 2. set_config_option(mode=default) 响应 ==");
      console.log(JSON.stringify(m.error ?? summarize(m.result?.configOptions), null, 1));
      send({ jsonrpc: "2.0", id: 4, method: "session/set_config_option",
        params: { sessionId: sid, configId: "model", value: "kimi-code/k3" } });
    } else if (m.id === 4) {
      console.log("\n== 3. set_config_option(model=kimi-code/k3) 响应 ==");
      console.log(JSON.stringify(m.error ?? summarize(m.result?.configOptions), null, 1));
      // 等 2 秒看有没有 config_option_update 通知
      setTimeout(() => finish(0, "\n探针结束。"), 2000);
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

setTimeout(() => finish(2, "\n超时（60s）"), 60000);
