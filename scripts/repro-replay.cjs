// 集成复现 2：真实 restoreSession 路径（session/load 回放 + backfillReplayTimes）
// 加载 Stock 失败会话，验证回放渲染与时间回填。
// bundle 同 repro-render（.int-view.cjs / .int-acp.cjs）。
"use strict";
const obs = require("./mock-obsidian.cjs");
const { KimidianView } = require("./.int-view.cjs");
const { KimiAcpClient } = require("./.int-acp.cjs");

const CWD = "D:/warehouse/Stock";
const SID = "session_13e7040b-b25a-4bc8-80bd-abcb6a9bcd7a";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let updateErrors = 0;

(async () => {
  let view;
  const client = new KimiAcpClient("C:/Users/rh/.kimi-code/bin/kimi.exe", [], {
    onSessionUpdate: (n) => {
      try { view.handleSessionUpdate(n); }
      catch (e) { updateErrors++; console.error(`!!! 渲染异常（${n?.update?.sessionUpdate}）:`, e); }
    },
    onPermissionRequest: () => Promise.resolve({ outcome: "cancelled" }),
    onStateChange: () => {},
  });
  client.setCwd(CWD);
  const app = { vault: { adapter: new obs.FileSystemAdapter(CWD) }, workspace: {} };
  const plugin = {
    app,
    settings: {
      cliPath: "C:/Users/rh/.kimi-code/bin/kimi.exe", bashPath: "", extraArgs: "",
      defaultModel: "kimi-code/k3", model: "", lastModelOptions: [],
      attachActiveNote: false, permissionMode: "yolo", grantedAlwaysTools: [], sessionMeta: {},
    },
    acpClient: client,
    lastSessionId: SID, // 触发 restoreSession 路径
    async saveSettings() {},
    manifest: { dir: ".obsidian/plugins/kimidian" },
  };
  view = new KimidianView({ app }, plugin);
  await view.onOpen();
  // 等 bootstrap → restoreSession（sessionLoad + drain + backfill）完成
  for (let i = 0; i < 80 && (view.sessionBoot !== "idle" || view.replaying); i++) await sleep(250);
  await sleep(600);

  const users = view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-user"));
  const assistants = view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-assistant"));
  const thoughts = view.messagesEl.findAll((e) => e.classList.contains("kimidian-thought"));
  const tools = view.messagesEl.findAll((e) => e.classList.contains("kimidian-tool"));
  const ts = view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-ts"));
  console.log("== 回放渲染结果（失败会话） ==");
  console.log(`  用户气泡: ${users.length}  回复气泡: ${assistants.length}  思考块: ${thoughts.length}  工具块: ${tools.length}`);
  console.log(`  时间戳: ${ts.length}（内容: ${ts.map((e) => e.textContent).join(" / ")}）`);
  console.log(`  渲染异常: ${updateErrors}，sessionId=${view.sessionId}`);
  console.log(`  用户消息: ${users.map((e) => e.textContent.slice(0, 30)).join(" | ")}`);
  try { await client.stop(); } catch { client.kill?.(); }
  process.exit(updateErrors === 0 ? 0 : 2);
})().catch((e) => { console.error("脚本异常:", e); process.exit(1); });
