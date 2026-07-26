// 集成复现：真实 chat-view 代码 + 真实 acp-client + 真实 kimi CLI，
// 跑「读一下 SCHEMA.md 并总结」，验证 session/update 经真实渲染路径后
// 思考块/工具块/回复是否出现在（mock）DOM 里。任何渲染异常打印完整堆栈。
// 运行前需先打包：
//   esbuild src/chat-view.ts --bundle --platform=node --format=cjs
//     --alias:obsidian=./scripts/mock-obsidian.cjs --outfile=scripts/.int-view.cjs
//   esbuild src/acp-client.ts --bundle --platform=node --format=cjs
//     --outfile=scripts/.int-acp.cjs
"use strict";
const obs = require("./mock-obsidian.cjs");
const { KimidianView } = require("./.int-view.cjs");
const { KimiAcpClient } = require("./.int-acp.cjs");

const CWD = process.env.KIMIDIAN_CWD ?? "D:/warehouse/Stock";
const PROMPT = process.env.KIMIDIAN_PROMPT ?? "读一下 SCHEMA.md 并总结";

try {
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true, writable: true,
  });
} catch { /* ignore */ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let updateErrors = 0;

(async () => {
  let view;
  const client = new KimiAcpClient("C:/Users/rh/.kimi-code/bin/kimi.exe", [], {
    onSessionUpdate: (n) => {
      try {
        view.handleSessionUpdate(n);
      } catch (e) {
        updateErrors++;
        console.error(`!!! handleSessionUpdate 抛异常（${n?.update?.sessionUpdate}）:`, e);
      }
    },
    onPermissionRequest: (params) => view.handlePermissionRequest(params),
    onStateChange: () => {},
  });
  client.setCwd(CWD);

  const app = {
    vault: { adapter: new obs.FileSystemAdapter(CWD) },
    workspace: {},
  };
  const plugin = {
    app,
    settings: {
      cliPath: "C:/Users/rh/.kimi-code/bin/kimi.exe",
      bashPath: "",
      extraArgs: "",
      defaultModel: "kimi-code/k3",
      model: "",
      lastModelOptions: [],
      attachActiveNote: false,
      permissionMode: "yolo", // 自动放行，不阻塞在权限框
      grantedAlwaysTools: [],
      sessionMeta: {},
    },
    acpClient: client,
    lastSessionId: null,
    async saveSettings() {},
    manifest: { dir: ".obsidian/plugins/kimidian" },
  };
  view = new KimidianView({ app }, plugin);
  await view.onOpen();
  // 等 bootstrap：真实 spawn CLI + initialize + session/new
  for (let i = 0; i < 60 && !view.sessionId; i++) await sleep(250);
  if (!view.sessionId) {
    console.error("bootstrap 失败：sessionId 未建立");
    process.exit(1);
  }
  console.log(`会话已建立: ${view.sessionId}（cwd=${CWD}）`);
  console.log(`prompt: ${PROMPT}`);

  view.inputEl.value = PROMPT;
  const t0 = Date.now();
  await view.sendMessage(); // 等真实整轮跑完
  console.log(`轮次结束，耗时 ${Date.now() - t0}ms`);

  const thoughts = view.messagesEl.findAll((e) => e.classList.contains("kimidian-thought"));
  const tools = view.messagesEl.findAll((e) => e.classList.contains("kimidian-tool"));
  const assistants = view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-assistant"));
  const users = view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-user"));
  console.log("\n== 渲染结果 ==");
  console.log(`  用户气泡: ${users.length}`);
  console.log(`  思考块:   ${thoughts.length}`);
  console.log(`  工具块:   ${tools.length}`);
  console.log(`  回复气泡: ${assistants.length}`);
  console.log(`  update 渲染异常数: ${updateErrors}`);
  const asstText = assistants.map((e) => e.textContent).join("").length;
  console.log(`  回复总字符: ${asstText}`);
  console.log(`  msgLog 条目: ${view.msgLog.length}（user=${view.msgLog.filter((e) => e.kind === "user").length} assistant=${view.msgLog.filter((e) => e.kind === "assistant").length} thought=${view.msgLog.filter((e) => e.kind === "thought").length} tool=${view.msgLog.filter((e) => e.kind === "tool").length}）`);

  await client.stop().catch(() => {});
  const pass = updateErrors === 0 && thoughts.length + tools.length + assistants.length > 0 && asstText > 0;
  console.log(pass ? "\n结论：真实 CLI + 真实渲染路径渲染正常 → 问题在 Obsidian 环境差异"
    : "\n结论：复现了零渲染/渲染异常 → 上方堆栈即根因");
  process.exit(pass ? 0 : 2);
})().catch((e) => {
  console.error("复现脚本异常:", e);
  process.exit(1);
});
