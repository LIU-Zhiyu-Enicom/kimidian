// DOM 级回归测试：打开即建会话、模型/思考下拉、默认 K3、失败重试态。
// 运行前需先打包：esbuild src/chat-view.ts --bundle --platform=node --format=cjs
//   --alias:obsidian=./scripts/mock-obsidian.cjs --outfile=scripts/.cv-test.cjs
"use strict";
const obs = require("./mock-obsidian.cjs");
const { KimidianView } = require("./.cv-test.cjs");

// Node 全局补 navigator.clipboard（复制按钮测试用）
try {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      clipboard: {
        writeText: async (t) => { globalThis.__copiedText = t; },
      },
    },
    configurable: true,
    writable: true,
  });
} catch { /* 环境不允许覆盖时，复制测试会走 execCommand 兜底 */ }

let failed = 0;
function ok(cond, name) {
  if (cond) console.log(`  ✅ ${name}`);
  else { console.log(`  ❌ ${name}`); failed++; }
}

// 与探针实测完全一致的 configOptions
const OPTS_K27 = [
  {
    type: "select", id: "model", name: "Model", category: "model",
    currentValue: "kimi-code/kimi-for-coding",
    options: [
      { value: "kimi-code/kimi-for-coding", name: "K2.7 Coding" },
      { value: "kimi-code/kimi-for-coding-highspeed", name: "K2.7 Coding Highspeed" },
      { value: "kimi-code/k3", name: "K3" },
    ],
  },
  {
    type: "select", id: "thinking", name: "Thinking", category: "thought_level",
    currentValue: "on",
    options: [{ value: "on", name: "On" }],
  },
  {
    type: "select", id: "mode", name: "Mode", category: "mode",
    currentValue: "default",
    options: [
      { value: "default", name: "Default" },
      { value: "plan", name: "Plan" },
      { value: "auto", name: "Auto" },
      { value: "yolo", name: "Yolo" },
    ],
  },
];

// 切到某模型后的 configOptions（K3 → thinking 多档；其余 → on）
function optsFor(modelValue) {
  const isK3 = modelValue === "kimi-code/k3";
  return [
    { ...OPTS_K27[0], currentValue: modelValue },
    isK3
      ? {
          type: "select", id: "thinking", name: "Thinking", category: "thought_level",
          currentValue: "high",
          options: [
            { value: "low", name: "Low" },
            { value: "high", name: "High" },
            { value: "max", name: "Max" },
          ],
        }
      : OPTS_K27[1],
    OPTS_K27[2],
  ];
}

function makeClient() {
  const calls = [];
  const c = {
    calls,
    newCalls: 0,
    failNew: false, // 置 true 后 sessionNew 抛错（测重试态）
    state: "connected",
    ready: true,
    setCwd() {}, setBashPath() {},
    async ensureStarted() {},
    async sessionNew() {
      c.newCalls++;
      if (c.failNew) throw new Error("boom: session/new failed");
      return { sessionId: `s${c.newCalls}`, configOptions: OPTS_K27 };
    },
    async setConfigOption(sid, id, value) {
      calls.push([id, value]);
      if (id === "model") {
        if (!OPTS_K27[0].options.some((o) => o.value === value)) {
          const e = new Error("Internal error");
          e.code = -32603;
          throw e;
        }
        return optsFor(value);
      }
      return OPTS_K27;
    },
    async sessionLoad(sid) {
      c.loadCalls.push(sid);
      return { configOptions: OPTS_K27 };
    },
    loadCalls: [],
    promptCalls: 0,
    lastPromptBlocks: null,
    failPrompt: false,
    async sessionList() { return []; },
    async prompt(sid, blocks) {
      c.promptCalls++;
      c.lastPromptBlocks = blocks;
      if (c.failPrompt) throw new Error("boom: prompt failed");
      return { stopReason: "end_turn" };
    },
    async restart() {},
    updateCommand() {},
    cancelCalls: 0,
    cancel() { c.cancelCalls++; },
    getStderrTail() { return ""; },
  };
  return c;
}

function makePlugin(client, settings = {}) {
  const app = {
    vault: { adapter: new obs.FileSystemAdapter("C:/vault") },
    workspace: { getActiveFile: () => null, on: () => ({}) },
  };
  const plugin = {
    app,
    saveCalls: 0,
    settings: {
      cliPath: "C:/Users/rh/.kimi-code/bin/kimi.exe",
      bashPath: "",
      extraArgs: "",
      defaultModel: "kimi-code/k3",
      model: "",
      lastModelOptions: [],
      attachActiveNote: false,
      permissionMode: "ask",
      grantedAlwaysTools: [],
      sessionMeta: {},
      ...settings,
    },
    acpClient: client,
    lastSessionId: null,
    async saveSettings() { plugin.saveCalls++; },
    manifest: { dir: ".obsidian/plugins/kimidian" },
  };
  return plugin;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const modelCalls = (client) => client.calls.filter(([id]) => id === "model");
const findSelect = (el) => el.find((e) => e.tagName === "SELECT");
const findRetry = (el) =>
  el.find((e) => e.classList.contains("kimidian-status-retry"));
const attachCards = (view) =>
  view.contentEl.findAll((e) => e.classList.contains("kimidian-attach-card"));

(async () => {
  console.log("== 品牌头部：月亮 logo + Kimidian ==");
  let client = makeClient();
  let plugin = makePlugin(client);
  let view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  const brand = view.contentEl.find((e) => e.classList.contains("kimidian-brand"));
  ok(!!brand, "品牌头部行存在");
  const brandLogo = brand?.find((e) => e.classList.contains("kimidian-brand-logo"));
  ok(brandLogo && brandLogo.innerHTML.includes("<svg") && brandLogo.innerHTML.includes("currentColor"),
    "logo 为内联 SVG 且用 currentColor");
  ok(brand && brand.textContent.includes("Kimidian"), "头部含 Kimidian 字样");
  // 头部在工具栏之前
  const kids = view.contentEl.children;
  ok(kids[0] === brand && kids[1].classList.contains("kimidian-toolbar"), "头部位于按钮行之上");

  console.log("== 打开即建会话：加载中 → 未发消息下拉已可用 + 默认 K3 ==");
  // bootstrap 已启动但未完成：模型控件显示加载中
  ok(view.statusModelEl.textContent.includes("加载中"),
    `创建期间显示加载中（实际 "${view.statusModelEl.textContent}"）`);
  await sleep(20); // 等 bootstrap 完成
  ok(client.newCalls === 1, `打开视图即 session/new（实际 ${client.newCalls} 次）`);
  let sel = findSelect(view.statusModelEl);
  ok(!!sel && sel.options.length === 3, "未发任何消息，模型下拉已渲染");
  ok(sel && sel.options[2].selected === true, "默认 K3 已选中");
  ok(modelCalls(client).length === 1 && modelCalls(client)[0][1] === "kimi-code/k3",
    `默认 K3 已下发（实际 ${JSON.stringify(modelCalls(client))}）`);
  let effortSel = findSelect(view.statusEffortEl);
  ok(!!effortSel && effortSel.options.length === 3 && effortSel.options[1].selected,
    "K3 思考强度多档出现且默认 high");
  ok(view.statusUsageEl.textContent === "Ctx —", "Ctx 指示显示占位");
  ok(view.shieldBtn && view.shieldLabel.textContent.length > 0, "盾牌按钮有模式文案");

  console.log("== config_option_update 通知不打断下拉 ==");
  view.handleSessionUpdate({
    sessionId: "s1",
    update: { sessionUpdate: "config_option_update", configOptions: optsFor("kimi-code/k3") },
  });
  sel = findSelect(view.statusModelEl);
  ok(!!sel && sel.options.length === 3 && sel.options[2].selected, "通知后下拉仍 3 选项且 K3 选中");

  console.log("== 手动切换：下发完整 ID + 持久化沿用 ==");
  sel.value = "kimi-code/kimi-for-coding-highspeed";
  sel.onchange();
  await sleep(10);
  const mc = modelCalls(client);
  ok(mc.length === 2 && mc[1][1] === "kimi-code/kimi-for-coding-highspeed",
    `切换调用完整 ID（实际 ${JSON.stringify(mc)}）`);
  ok(plugin.settings.model === "kimi-code/kimi-for-coding-highspeed", "手动选择写入 settings.model");
  ok(plugin.saveCalls > 0, "saveSettings 已持久化");
  sel = findSelect(view.statusModelEl);
  ok(sel && sel.options[1].selected === true, "切换后选中项更新");
  ok(!findSelect(view.statusEffortEl), "切回 K2.7 后思考单档隐藏");

  console.log("== 「新对话」：立即建新会话且下拉刷新 ==");
  await view.newSession();
  await sleep(20);
  ok(client.newCalls === 2, `新对话立即 session/new（累计 ${client.newCalls} 次）`);
  sel = findSelect(view.statusModelEl);
  ok(!!sel && sel.options.length === 3, "新会话后下拉仍在");
  // 手动选择沿用：新会话应重新下发 highspeed
  ok(modelCalls(client).some(([, v]) => v === "kimi-code/kimi-for-coding-highspeed"),
    "手动选择在新会话中沿用");

  console.log("== 手动选择优先于默认模型 ==");
  client = makeClient();
  plugin = makePlugin(client, { model: "kimi-code/kimi-for-coding-highspeed" });
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(20);
  ok(modelCalls(client).length === 1 && modelCalls(client)[0][1] === "kimi-code/kimi-for-coding-highspeed",
    `手动选择优先（实际 ${JSON.stringify(modelCalls(client))}）`);

  console.log("== 短名归一化：settings.model='k3' → 完整 ID ==");
  client = makeClient();
  plugin = makePlugin(client, { model: "k3" });
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(20);
  ok(modelCalls(client).length === 1 && modelCalls(client)[0][1] === "kimi-code/k3",
    `短名 k3 归一化（实际 ${JSON.stringify(modelCalls(client))}）`);

  console.log("== 非法模型值：不下发、不炸界面 ==");
  client = makeClient();
  plugin = makePlugin(client, { model: "gpt-5" });
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(20);
  ok(modelCalls(client).length === 0, `非法值不下发（实际 ${JSON.stringify(modelCalls(client))}）`);
  sel = findSelect(view.statusModelEl);
  ok(!!sel && sel.options.length === 3, "下拉仍正常渲染");

  console.log("== session/new 失败 → 可点击重试态 ==");
  client = makeClient();
  client.failNew = true;
  plugin = makePlugin(client);
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(20);
  ok(client.newCalls === 1, "首次创建已尝试");
  ok(!findSelect(view.statusModelEl), "失败时无下拉");
  ok(view.statusModelEl.textContent.includes("失败"),
    `显示失败文案（实际 "${view.statusModelEl.textContent}"）`);
  const retry = findRetry(view.statusModelEl);
  ok(!!retry, "显示可点击「重试」");
  // 修复后点重试 → 成功渲染下拉
  client.failNew = false;
  retry.onclick();
  await sleep(20);
  ok(client.newCalls === 2, "重试再次 session/new");
  sel = findSelect(view.statusModelEl);
  ok(!!sel && sel.options.length === 3 && sel.options[2].selected, "重试成功：下拉渲染且 K3 选中");

  console.log("== 消息状态在数据层：开关历史面板不丢 ==");
  // 当前 view 来自重试成功段（K3）：先手动切到 highspeed，再验证后续路径不回退
  sel = findSelect(view.statusModelEl);
  sel.value = "kimi-code/kimi-for-coding-highspeed";
  sel.onchange();
  await sleep(10);
  // 模拟两轮对话（用户消息 + 助手流式回复 + 工具块 + 思考）
  view.renderUserMsg("第一个问题");
  view.handleSessionUpdate({ sessionId: "s2", update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "思考一下" } } });
  view.handleSessionUpdate({ sessionId: "s2", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "第一个回答" } } });
  view.handleSessionUpdate({ sessionId: "s2", update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "ReadFile", kind: "read", status: "completed" } });
  view.renderUserMsg("第二个问题");
  view.handleSessionUpdate({ sessionId: "s2", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "第二个回答" } } });
  ok(view.msgLog.length >= 6, `消息日志已累积（${view.msgLog.length} 条）`);
  await view.toggleHistory();
  ok(!!view.historyPanelEl, "历史面板已打开");
  await view.toggleHistory();
  ok(!view.historyPanelEl, "历史面板已关闭");
  const allText = view.messagesEl.textContent;
  ok(allText.includes("第一个问题") && allText.includes("第一个回答"), "面板开关后消息仍在（用户+助手）");
  ok(allText.includes("第二个问题") && allText.includes("第二个回答"), "面板开关后第二轮消息仍在");
  ok(allText.includes("ReadFile"), "面板开关后工具块仍在");
  ok(allText.includes("思考一下"), "面板开关后思考块仍在");
  // 模型保持：此前手动切到 highspeed，面板开关后不得回退
  sel = findSelect(view.statusModelEl);
  ok(sel && sel.options[1].selected === true, "面板开关后模型选择保持");

  console.log("== 同实例 onClose→onOpen：从消息日志恢复 ==");
  await view.onClose();
  await view.onOpen();
  await sleep(20);
  const reText = view.messagesEl.textContent;
  ok(reText.includes("第一个问题") && reText.includes("第二个回答"), "重挂载后消息从数据层恢复");
  ok(reText.includes("ReadFile") && reText.includes("思考一下"), "重挂载后工具/思考块恢复");
  sel = findSelect(view.statusModelEl);
  ok(sel && sel.options[1].selected === true, "重挂载后模型选择保持（highspeed）");

  console.log("== 跨实例重建：session/load 回放恢复 + 模型不回退 ==");
  client = makeClient();
  plugin = makePlugin(client, { model: "kimi-code/k3" });
  plugin.lastSessionId = "old-session";
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(20);
  ok(client.loadCalls.includes("old-session"), `经 session/load 恢复上次会话（实际 ${JSON.stringify(client.loadCalls)}）`);
  ok(client.newCalls === 0, "恢复成功不再新建会话");
  // 回放 drain 窗口（400ms）结束后才应用模型偏好
  await sleep(600);
  sel = findSelect(view.statusModelEl);
  ok(sel && sel.options[2].selected === true, "恢复后模型仍是 K3（手动选择优先）");
  ok(modelCalls(client).some(([, v]) => v === "kimi-code/k3"), "恢复路径重新下发了 K3");
  // 「新对话」不恢复旧会话
  await view.newSession();
  await sleep(20);
  ok(client.newCalls === 1, "新对话强制建新会话（不恢复）");

  console.log("== 权限盾牌菜单不干扰状态栏 ==");
  view.showPermissionMenu({});
  await view.setPermissionMode("yolo");
  ok(client.calls.some(([id, v]) => id === "mode" && v === "yolo"), "切 yolo 双写 CLI mode");
  sel = findSelect(view.statusModelEl);
  ok(!!sel && sel.options.length === 3, "权限切换后模型下拉仍在");
  await view.setPermissionMode("ask");

  console.log("== Ctx 指示：wire 有 usage.record → 精确值 ==");
  const fs = require("fs");
  const pathM = require("path");
  const osM = require("os");
  const tmp = fs.mkdtempSync(pathM.join(osM.tmpdir(), "kimidian-"));
  try {
    const wireDir = pathM.join(tmp, "sessions", "wd_x", "s1", "agents", "main");
    fs.mkdirSync(wireDir, { recursive: true });
    fs.writeFileSync(pathM.join(wireDir, "wire.jsonl"), [
      '{"type":"metadata"}',
      '{"type":"llm.request","model":"kimi-for-coding","maxTokens":262144}',
      '{"type":"usage.record","model":"kimi-code/kimi-for-coding","usage":{"inputOther":26000,"output":100,"inputCacheRead":0,"inputCacheCreation":0},"usageScope":"turn"}',
    ].join("\n"));
    client = makeClient();
    plugin = makePlugin(client, { cliPath: pathM.join(tmp, "bin", "kimi.exe") });
    view = new KimidianView({ app: plugin.app }, plugin);
    await view.onOpen();
    await sleep(20);
    await view.loadUsage();
    ok(view.statusUsageEl.textContent === "Ctx 10%",
      `精确用量显示（实际 "${view.statusUsageEl.textContent}"）`);
    ok(!view.statusUsageEl.title.includes("估算方式"), "精确值不带估算说明");

    console.log("== Ctx 指示：wire 无 usage.record → 估算「约」 ==");
    fs.writeFileSync(pathM.join(wireDir, "wire.jsonl"), [
      '{"type":"metadata"}',
      '{"type":"config.update","systemPrompt":"' + "abc".repeat(2000) + '"}',
      '{"type":"llm.request","model":"kimi-for-coding","maxTokens":262144}',
      '{"type":"turn.prompt","input":[{"type":"text","text":"你好世界，这是一段测试文本"}]}',
    ].join("\n"));
    view.wirePath = null; // 清缓存重定位
    await view.loadUsage();
    ok(/^Ctx 约\d+%$/.test(view.statusUsageEl.textContent),
      `估算显示带「约」字（实际 "${view.statusUsageEl.textContent}"）`);
    ok(view.statusUsageEl.title.includes("估算方式"), "tooltip 注明估算方式");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("== 消息复制按钮：用户消息 + 重建的助手消息 ==");
  client = makeClient();
  plugin = makePlugin(client);
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(20);
  globalThis.__copiedText = null;
  view.renderUserMsg("你好 **世界**");
  let copyBtn = view.messagesEl.find((e) => e.classList.contains("kimidian-copy-btn"));
  ok(!!copyBtn, "用户消息右上角有复制按钮");
  copyBtn.onclick();
  await sleep(5);
  ok(globalThis.__copiedText === "你好 **世界**",
    `点击复制写入原文 Markdown（实际 ${JSON.stringify(globalThis.__copiedText)}）`);
  // 视图重挂载：从 msgLog 重建的助手消息同样可复制
  view.msgLog = [{ kind: "assistant", text: "回复 *斜体*" }];
  view.restoreMsgLog();
  copyBtn = view.messagesEl.find((e) => e.classList.contains("kimidian-copy-btn"));
  ok(!!copyBtn, "重建的助手消息有复制按钮");
  copyBtn.onclick();
  await sleep(5);
  ok(globalThis.__copiedText === "回复 *斜体*",
    `重建消息复制原文（实际 ${JSON.stringify(globalThis.__copiedText)}）`);

  console.log("== 粘贴图片 → 待发送附件卡片 ==");
  let pastePrevented = false;
  const imgFile = {
    name: "shot.png", type: "image/png",
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
  view.inputEl.dispatch("paste", {
    clipboardData: {
      items: [{ type: "image/png", getAsFile: () => imgFile }],
      getData: () => "",
    },
    preventDefault: () => { pastePrevented = true; },
  });
  await sleep(10);
  ok(view.pending.length === 1 && view.pending[0].kind === "image",
    "粘贴图片进入待发送列表");
  ok(view.pending[0].dataBase64 === "AQID", "图片字节转 base64");
  ok(pastePrevented, "纯图片粘贴阻止默认行为");
  ok(attachCards(view).length === 1, "附件卡片已渲染");

  console.log("== 拖拽文件：文本读内容 / 二进制存仓库 ==");
  view.pending = [];
  view.renderChips();
  const txtFile = { name: "notes.md", type: "text/markdown", text: async () => "笔记内容" };
  const zipFile = {
    name: "data.zip", type: "application/zip",
    arrayBuffer: async () => new Uint8Array([9, 9]).buffer,
  };
  view.inputWrapEl.dispatch("drop", {
    dataTransfer: { files: [txtFile, zipFile], getData: () => "" },
    preventDefault: () => {},
  });
  await sleep(10);
  ok(view.pending.some((p) => p.kind === "text" && p.content === "笔记内容"),
    "拖入文本文件读取内容");
  const binP = view.pending.find((p) => p.kind === "binary");
  ok(!!binP && binP.vaultPath === "attachments/kimidian/data.zip",
    `二进制文件引用仓库路径（实际 ${binP && binP.vaultPath}）`);
  const storedBin = plugin.app.vault.adapter.__files.get("attachments/kimidian/data.zip");
  ok(!!storedBin && storedBin.bin.byteLength === 2, "二进制字节已写入 vault adapter");
  ok(attachCards(view).length === 2, "两张附件卡片");

  console.log("== 发送：图片 block 随 prompt 下发，成功后清空 ==");
  view.pending.push({
    kind: "image", name: "shot.png", mimeType: "image/png",
    dataBase64: "AQID", sizeBytes: 3,
  });
  view.renderChips();
  view.inputEl.value = "看图";
  await view.sendMessage();
  ok(client.promptCalls === 1, "prompt 被调用一次");
  ok(client.lastPromptBlocks[0].type === "text" &&
    client.lastPromptBlocks[0].text.includes("看图"), "首块为文本");
  ok(client.lastPromptBlocks[0].text.includes("<file path=\"notes.md\">"),
    "文本附件以 <file> XML 注入");
  ok(client.lastPromptBlocks[0].text.includes("[附件] attachments/kimidian/data.zip"),
    "二进制附件以路径引用行注入");
  const imgBlock = client.lastPromptBlocks.find((b) => b.type === "image");
  ok(!!imgBlock && imgBlock.data === "AQID" && imgBlock.mimeType === "image/png",
    "图片块随 prompt 发送");
  ok(view.pending.length === 0, "发送成功后清空待发送附件");
  ok(attachCards(view).length === 0, "附件卡片已清空");

  console.log("== 发送失败：附件保留 ==");
  view.pending.push({
    kind: "image", name: "x.png", mimeType: "image/png",
    dataBase64: "AA==", sizeBytes: 1,
  });
  view.renderChips();
  client.failPrompt = true;
  view.inputEl.value = "再试";
  await view.sendMessage();
  ok(view.pending.length === 1, "prompt 失败时附件保留");
  ok(attachCards(view).length === 1, "失败时卡片仍在");
  client.failPrompt = false;

  console.log("== 界面状态记忆：历史面板开合写回 + 重开自动恢复 ==");
  client = makeClient();
  plugin = makePlugin(client);
  plugin.settings.uiState = { historyOpen: true };
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  ok(!!view.historyPanelEl, "uiState.historyOpen=true → 重开视图自动恢复历史面板");
  ok(view.historyPanelEl && view.historyPanelEl.textContent.includes("暂无历史会话"),
    "面板加载完成（空列表文案）");
  await view.toggleHistory();
  ok(plugin.settings.uiState.historyOpen === false, "关面板写回 uiState=false");
  ok(plugin.saveCalls > 0, "uiState 变化触发保存");
  await view.toggleHistory();
  ok(plugin.settings.uiState.historyOpen === true, "开面板写回 uiState=true");
  await view.toggleHistory();

  console.log("== 回放过滤：reminder 不显示 / 引用折叠 / 迟到 chunk 不丢 ==");
  client = makeClient();
  plugin = makePlugin(client);
  plugin.lastSessionId = "replay-s1";
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30); // bootstrap → restoreSession：sessionLoad 已 resolve，drain 窗口中
  ok(view.replaying === true, "sessionLoad 响应后仍在回放 drain 窗口");
  const pushUser = (text) => view.handleSessionUpdate({
    sessionId: "replay-s1",
    update: { sessionUpdate: "user_message_chunk", content: { type: "text", text } },
  });
  pushUser("迟到的问题");
  pushUser("<system-reminder>\nTodoList 提醒内容\n</system-reminder>");
  pushUser("总结这个<file path=\"C:/vault/笔记.md\">\n笔记正文内容\n</file>");
  let rtxt = view.messagesEl.textContent;
  ok(rtxt.includes("迟到的问题"), "drain 窗口内迟到的 user chunk 正常渲染（不丢末尾）");
  ok(!rtxt.includes("system-reminder") && !rtxt.includes("TodoList 提醒内容"),
    "注入的 reminder 不显示");
  ok(rtxt.includes("总结这个"), "混合消息正文保留");
  ok(!rtxt.includes("笔记正文内容"), "file 块内容不裸显示");
  const refChips = view.messagesEl.findAll((e) => e.classList.contains("kimidian-ref-chip"));
  ok(refChips.length === 1 && refChips[0].textContent.includes("笔记.md"),
    `file 块折叠为引用标签（实际 ${refChips.length} 个）`);
  ok(view.msgLog.filter((e) => e.kind === "user").length === 2,
    "纯注入消息不入消息日志");
  // 复制按钮复制的是过滤后的文本
  const firstUserWrap = view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-user"))[0];
  globalThis.__copiedText = null;
  firstUserWrap.find((e) => e.classList.contains("kimidian-copy-btn")).onclick();
  await sleep(5);
  ok(globalThis.__copiedText === "迟到的问题",
    `复制的是过滤后原文（实际 ${JSON.stringify(globalThis.__copiedText)}）`);
  // 数据层重建：引用标签与过滤效果保持
  view.restoreMsgLog();
  ok(view.messagesEl.findAll((e) => e.classList.contains("kimidian-ref-chip")).length === 1,
    "重建后引用标签仍在");
  ok(!view.messagesEl.textContent.includes("system-reminder"), "重建后仍无注入内容");
  // drain 窗口结束 → 之后的 user chunk 丢弃（窗口确实关闭）
  await sleep(1100);
  ok(view.replaying === false, "drain 窗口结束后回放态关闭");
  pushUser("太迟的消息");
  ok(!view.messagesEl.textContent.includes("太迟的消息"), "回放态关闭后 user chunk 丢弃");

  console.log("== 4 问 4 答 fixture：多轮回放不丢回答、不错位 ==");
  const fixture = JSON.parse(
    require("fs").readFileSync(
      require("path").join(__dirname, "fixture-replay-saw.json"), "utf-8")
  );
  // 从 fixture 推导期望：真实用户消息（剥 reminder）/ 助手消息 / U-A 顺序
  const expUsers = fixture
    .filter((e) => e.sessionUpdate === "user_message_chunk")
    .map((e) => e.content.text)
    .filter((t) => !t.includes("<system-reminder>"));
  const expAgents = fixture
    .filter((e) => e.sessionUpdate === "agent_message_chunk")
    .map((e) => e.content.text);
  const expSeq = [];
  for (const e of fixture) {
    if (e.sessionUpdate === "user_message_chunk" &&
        !e.content.text.includes("<system-reminder>")) expSeq.push("U");
    else if (e.sessionUpdate === "agent_message_chunk") expSeq.push("A");
  }
  client = makeClient();
  plugin = makePlugin(client);
  plugin.lastSessionId = "fixture-saw";
  // sessionLoad 响应前同步推完整回放流（与实测顺序一致）
  client.sessionLoad = async (sid) => {
    client.loadCalls.push(sid);
    for (const ev of fixture) {
      view.handleSessionUpdate({ sessionId: sid, update: ev });
    }
    return { configOptions: OPTS_K27 };
  };
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(1200); // bootstrap + 回放 + drain 窗口结束

  // 数据层：4 问 5 答逐条独立（不错位合并）
  const logUsers = view.msgLog.filter((e) => e.kind === "user").map((e) => e.text);
  const logAgents = view.msgLog.filter((e) => e.kind === "assistant").map((e) => e.text);
  ok(JSON.stringify(logUsers) === JSON.stringify(expUsers),
    `用户消息 4 条完整（实际 ${logUsers.length} 条）`);
  ok(JSON.stringify(logAgents) === JSON.stringify(expAgents),
    `助手回答 ${expAgents.length} 条各自独立成泡（实际 ${logAgents.length} 条）`);
  // DOM 顺序与回放流一致
  const domSeq = view.messagesEl.children
    .filter((e) => e.classList.contains("kimidian-msg"))
    .map((e) => (e.classList.contains("kimidian-msg-user") ? "U" : "A"));
  ok(JSON.stringify(domSeq) === JSON.stringify(expSeq),
    `DOM 顺序与回放流一致（实际 ${domSeq.join("")}，期望 ${expSeq.join("")}）`);
  // 重复提问（U3===U5）渲染为两个气泡
  const dupText = expUsers[2];
  ok(expUsers.filter((t) => t === dupText).length === 2 &&
     logUsers.filter((t) => t === dupText).length === 2,
    "重复提问渲染为两个用户气泡");
  // 最后一条消息是第 4 轮的回答（回答跟着问题，不再丢）
  const msgs = view.messagesEl.children.filter((e) => e.classList.contains("kimidian-msg"));
  ok(msgs[msgs.length - 1].classList.contains("kimidian-msg-assistant") &&
     msgs[msgs.length - 1].textContent.includes("根因定位信息清单"),
    "视图末尾是最后一轮的回答");
  ok(!view.messagesEl.textContent.includes("gentle reminder") &&
     !view.messagesEl.textContent.includes("NEVER mention"),
    "reminder 注入原文不显示");

  console.log("== 历史面板：诊断会话标注 / 隐藏 / 所属 vault ==");
  client = makeClient();
  client.sessionList = async () => [
    { sessionId: "normal-1", cwd: "D:/warehouse/SAW滤波器",
      title: "普通问题", updatedAt: "2026-07-24T08:00:00Z" },
    { sessionId: "diag-1", cwd: "D:/warehouse/SAW滤波器",
      title: "只回复ok", updatedAt: "2026-07-24T09:00:00Z" },
  ];
  plugin = makePlugin(client);
  plugin.settings.diagSessionId = "diag-1";
  plugin.settings.hideDiagSession = false;
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  await view.toggleHistory();
  const histTitles = () =>
    view.historyPanelEl
      .findAll((e) => e.classList.contains("kimidian-history-title"))
      .map((e) => e.textContent);
  ok(histTitles().includes("🔧 自我诊断"), "诊断会话标注为「🔧 自我诊断」");
  ok(histTitles().includes("普通问题"), "普通会话标题原样");
  const histTimes = view.historyPanelEl
    .findAll((e) => e.classList.contains("kimidian-history-time"))
    .map((e) => e.textContent);
  ok(histTimes.some((t) => t.includes("SAW滤波器")), "会话项显示所属 vault");
  // 隐藏开关打开后诊断会话消失
  plugin.settings.hideDiagSession = true;
  await view.toggleHistory();
  await view.toggleHistory();
  ok(!histTitles().includes("🔧 自我诊断") && histTitles().includes("普通问题"),
    "hideDiagSession=true → 诊断会话隐藏");
  await view.toggleHistory();

  console.log("== 选区复制：拖选 → 浮层 → 点击复制 → 消失 ==");
  client = makeClient();
  plugin = makePlugin(client);
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  view.renderUserMsg("第一段消息，可以摘选其中几个字");
  const msgBody = view.messagesEl.find((e) => e.classList.contains("kimidian-msg-body"));
  // 模拟拖选：锚点在消息区内，选区包围盒 (100,200)-(220,220)
  globalThis.__mockSelection = {
    isCollapsed: false, rangeCount: 1, anchorNode: msgBody,
    toString: () => "摘选其中几个字",
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ left: 100, top: 200, right: 220, bottom: 220, width: 120, height: 20 }),
    }),
    removeAllRanges() { globalThis.__mockSelection = globalThis.__collapsedSel(); },
  };
  document.dispatch("selectionchange");
  const selBtn = view.contentEl.find((e) => e.classList.contains("kimidian-sel-copy"));
  ok(!!selBtn, "拖选后选区附近浮现「复制」小按钮");
  ok(selBtn && selBtn.textContent.includes("复制"), "按钮文案为「复制」");
  ok(selBtn && selBtn.style.left === "156px" && selBtn.style.top === "168px",
    `按钮定位在选区上方（实际 ${selBtn && selBtn.style.left},${selBtn && selBtn.style.top}）`);
  // 点击复制 → 剪贴板写入选中文字 + 视觉反馈
  globalThis.__copiedText = null;
  selBtn.onmousedown({ preventDefault() {} });
  selBtn.onclick();
  await sleep(5);
  ok(globalThis.__copiedText === "摘选其中几个字",
    `点击复制选中文字（实际 ${JSON.stringify(globalThis.__copiedText)}）`);
  ok(selBtn.textContent.includes("已复制"), "复制后按钮反馈「已复制」");
  // 选区消失（点击时已 removeAllRanges）→ 按钮隐藏
  document.dispatch("selectionchange");
  ok(!view.contentEl.find((e) => e.classList.contains("kimidian-sel-copy")),
    "选区消失后按钮隐藏");
  // 选区在消息区外（输入框）→ 不浮现
  globalThis.__mockSelection = {
    isCollapsed: false, rangeCount: 1, anchorNode: view.inputEl,
    toString: () => "输入框里的字",
    getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 10, top: 10, right: 90, bottom: 30 }) }),
    removeAllRanges() {},
  };
  document.dispatch("selectionchange");
  ok(!view.contentEl.find((e) => e.classList.contains("kimidian-sel-copy")),
    "选区在消息区外不浮现按钮");
  globalThis.__mockSelection = globalThis.__collapsedSel();

  console.log("== 流式与选区兼容：做选期间延迟重渲染 ==");
  view.handleSessionUpdate({ sessionId: "s1", update: {
    sessionUpdate: "agent_message_chunk", content: { type: "text", text: "前半段" } } });
  await sleep(5);
  const lastStreamBody = () =>
    view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-assistant"))
      .pop().find((e) => e.classList.contains("kimidian-msg-body"));
  ok(lastStreamBody().textContent.includes("前半段"), "流式首段已渲染");
  // 用户开始拖选（锚点在流式气泡内）
  globalThis.__mockSelection = {
    isCollapsed: false, rangeCount: 1, anchorNode: lastStreamBody(),
    toString: () => "前半段",
    getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 10, top: 10, right: 100, bottom: 30 }) }),
    removeAllRanges() { globalThis.__mockSelection = globalThis.__collapsedSel(); },
  };
  document.dispatch("selectionchange");
  // 做选期间继续流式 → 气泡不被覆盖（选区不被销毁）
  view.handleSessionUpdate({ sessionId: "s1", update: {
    sessionUpdate: "agent_message_chunk", content: { type: "text", text: "+后半段" } } });
  await sleep(5);
  ok(!lastStreamBody().textContent.includes("后半段"), "做选期间流式不覆盖气泡");
  ok(view.deferredStreamRender === true, "延迟渲染已记账");
  // 数据层仍然累积（不丢内容）
  ok(view.curAssistantEntry.text.includes("后半段"), "数据层文本持续累积");
  // 选区结束 → 补渲染到最新
  globalThis.__mockSelection = globalThis.__collapsedSel();
  document.dispatch("selectionchange");
  await sleep(5);
  ok(lastStreamBody().textContent.includes("后半段"), "选区结束后补渲染到最新");
  ok(view.deferredStreamRender === false, "延迟标记已清除");

  console.log("== 消息时间戳：实时消息带 HH:MM，重建保留 ==");
  client = makeClient();
  plugin = makePlugin(client);
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  view.inputEl.value = "现在几点";
  await view.sendMessage();
  const tsUserWrap = view.messagesEl
    .findAll((e) => e.classList.contains("kimidian-msg-user")).pop();
  const tsUser = tsUserWrap.find((e) => e.classList.contains("kimidian-msg-ts"));
  ok(!!tsUser && /^\d{2}:\d{2}$/.test(tsUser.textContent),
    `用户气泡带 HH:MM 时间戳（实际 "${tsUser && tsUser.textContent}"）`);
  ok(tsUser && !tsUser.classList.contains("kimidian-msg-ts-est"), "实时消息非估算样式");
  view.handleSessionUpdate({ sessionId: "s1", update: {
    sessionUpdate: "agent_message_chunk", content: { type: "text", text: "回答" } } });
  const tsAsstWrap = view.messagesEl
    .findAll((e) => e.classList.contains("kimidian-msg-assistant")).pop();
  ok(!!tsAsstWrap.find((e) => e.classList.contains("kimidian-msg-ts")), "助手气泡带时间戳");
  // 数据层重建后时间戳仍在
  view.restoreMsgLog();
  ok(view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-ts")).length >= 2,
    "restoreMsgLog 重建后时间戳仍在");

  console.log("== 回放时间回填：wire 落盘时间替换估算时间 ==");
  // 对齐 restoreSession 的前置状态：回放前消息日志清空
  view.msgLog = [];
  view.messagesEl.empty();
  view.beginAssistantTurn();
  // 模拟回放到达的一问一答（先标估算）
  view.replaying = true;
  view.handleSessionUpdate({ sessionId: "s1", update: {
    sessionUpdate: "user_message_chunk", content: { type: "text", text: "昨天的问题" } } });
  view.handleSessionUpdate({ sessionId: "s1", update: {
    sessionUpdate: "agent_message_chunk", content: { type: "text", text: "昨天的回答" } } });
  view.replaying = false;
  const replayUser = view.msgLog.filter((e) => e.kind === "user").pop();
  ok(replayUser.tsEst === true, "回放条目先标估算时间");
  // 造 wire.jsonl：时间为昨天 09:30 → 跨天格式
  const yst = new Date();
  yst.setDate(yst.getDate() - 1);
  yst.setHours(9, 30, 0, 0);
  const tU = yst.getTime();
  const tA = tU + 65000;
  const tmpRoot = require("path").join(require("os").tmpdir(), "kimidian-ts-test");
  const wireDir = require("path").join(
    tmpRoot, ".kimi-code", "sessions", "wd_x", "s1", "agents", "main");
  require("fs").mkdirSync(wireDir, { recursive: true });
  require("fs").writeFileSync(
    require("path").join(wireDir, "wire.jsonl"),
    [
      JSON.stringify({ type: "context.append_message",
        message: { role: "user", origin: { kind: "user" } }, time: tU }),
      JSON.stringify({ type: "context.append_loop_event",
        event: { type: "step.end" }, time: tA }),
      JSON.stringify({ type: "context.append_message",
        message: { role: "user", origin: { kind: "user" } }, time: tU + 120000 }),
      JSON.stringify({ type: "context.append_loop_event",
        event: { type: "step.end" }, time: tA + 120000 }),
    ].join("\n")
  );
  // sessionsRoot 从 cliPath 推导：指到临时目录
  plugin.settings.cliPath = require("path").join(tmpRoot, ".kimi-code", "bin", "kimi.exe");
  view.wirePath = null;
  await view.backfillReplayTimes();
  ok(replayUser.ts === tU && replayUser.tsEst === false,
    "回放用户消息回填 wire 落盘时间");
  const replayAsst = view.msgLog.filter((e) => e.kind === "assistant").pop();
  ok(replayAsst.ts === tA && !replayAsst.tsEst,
    "回放助手消息回填该轮 step.end 时间");
  const tsEls = view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-ts"));
  const replayTsEl = tsEls[tsEls.length - 2]; // 回填后重渲染：倒数第二条是「昨天的问题」
  ok(replayTsEl && replayTsEl.textContent.includes("09:30") &&
     replayTsEl.textContent.includes("/"),
    `回填后显示 wire 时间而非"现在"（实际 "${replayTsEl && replayTsEl.textContent}"）`);
  ok(replayTsEl && !replayTsEl.classList.contains("kimidian-msg-ts-est"),
    "回填后估算淡化样式移除");

  console.log("== 靶子会话 chunk 序列（Stock 零渲染会话）：思考/工具/文本全部渲染 ==");
  client = makeClient();
  plugin = makePlugin(client);
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  const zeroFixture = JSON.parse(
    require("fs").readFileSync(
      require("path").join(__dirname, "fixture-stock-zero.json"), "utf-8")
  );
  for (const ev of zeroFixture) {
    view.handleSessionUpdate({ sessionId: "s1", update: ev });
  }
  await sleep(20);
  const zThoughts = view.messagesEl.findAll((e) => e.classList.contains("kimidian-thought"));
  const zTools = view.messagesEl.findAll((e) => e.classList.contains("kimidian-tool"));
  const zAssist = view.messagesEl.findAll((e) => e.classList.contains("kimidian-msg-assistant"));
  ok(zThoughts.length >= 1, `思考块渲染（实际 ${zThoughts.length}）`);
  ok(zTools.length === 6, `6 个工具块全部渲染（实际 ${zTools.length}）`);
  ok(zAssist.length === 2, `2 段回复各自成泡（实际 ${zAssist.length}）`);
  ok(view.messagesEl.textContent.includes("我先了解一下知识库的结构"),
    "第一段回复文本渲染");
  ok(view.messagesEl.textContent.includes("日志显示上次体检在 2026-07-19"),
    "工具调用后第二段回复另起气泡渲染");
  ok(view.msgLog.filter((e) => e.kind === "tool").length === 6,
    "数据层 6 个工具条目");
  ok(view.msgLog.filter((e) => e.kind === "assistant").length === 2,
    "数据层 2 个回复条目");
  ok(zAssist.every((w) => w.find((e) => e.classList.contains("kimidian-msg-ts"))),
    "回复气泡均带时间戳");

  console.log("== 渲染防御：渲染异常不静默死、console + Notice 提示 ==");
  const realMessagesEl = view.messagesEl;
  view.messagesEl = null; // 模拟渲染层坏掉
  let threw = false;
  const errLogs = [];
  const origErr = console.error;
  console.error = (...a) => errLogs.push(a.map(String).join(" "));
  try {
    view.handleSessionUpdate({ sessionId: "s1", update: {
      sessionUpdate: "agent_message_chunk", content: { type: "text", text: "会炸" } } });
  } catch { threw = true; }
  console.error = origErr;
  ok(!threw, "渲染异常被 try/catch 拦住不外抛");
  ok(errLogs.some((m) => m.includes("[kimidian] 渲染 session/update 失败")),
    "异常写 console.error（不再静默）");
  ok(view.renderErrorNoticed === true, "Notice 提示分支已执行（防刷屏标记置位）");
  view.messagesEl = realMessagesEl;

  console.log("== 停止后状态复位：cancel → busy 复位 → 可再发 ==");
  client = makeClient();
  plugin = makePlugin(client);
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  let resolveP1;
  client.prompt = () => new Promise((r) => { resolveP1 = r; });
  view.inputEl.value = "长任务";
  const p1 = view.sendMessage();
  await sleep(10);
  ok(view.busy === true && view.sendBtn.textContent === "停止", "轮次中发送键为「停止」");
  view.cancelTurn();
  ok(client.cancelCalls === 1, "点停止发出 session/cancel");
  resolveP1({ stopReason: "cancelled" });
  await p1;
  ok(view.busy === false && view.sendBtn.textContent === "发送",
    "cancel 响应后 busy 复位、发送键恢复");
  ok(view.msgLog.some((e) => e.kind === "system" && e.text === "已停止。"),
    "停止系统消息落日志");
  // 复位后可再发（同会话继续）
  client.prompt = async () => ({ stopReason: "end_turn" });
  view.inputEl.value = "继续";
  await view.sendMessage();
  ok(view.busy === false, "再发一轮正常结束");

  console.log("== 重置会话入口：一键新建会话 ==");
  const resetBtn = view.contentEl.find((e) => e.classList.contains("kimidian-reset-btn"));
  ok(!!resetBtn, "输入区有「重置会话」按钮");
  const newCallsBefore = client.newCalls;
  resetBtn.onclick();
  await sleep(30);
  ok(client.newCalls === newCallsBefore + 1, "重置后立即 session/new");
  ok(view.sessionId === `s${client.newCalls}`, "重置后切换到新会话");
  ok(view.msgLog.length === 0 && !!view.messagesEl.find((e) => e.classList.contains("kimidian-welcome")),
    "重置后消息区清空显示欢迎页");

  console.log("== 等待指示：5s 出现 / 60s 升级 / chunk 即撤 / 工具状态 / 结束撤 ==");
  client = makeClient();
  plugin = makePlugin(client);
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  view.waitDelayMs = 40; // 测试提速
  view.waitSlowMs = 90;
  let resolveP2;
  client.prompt = () => new Promise((r) => { resolveP2 = r; });
  view.inputEl.value = "慢任务";
  const p2 = view.sendMessage();
  const wfind = () => view.messagesEl.find((e) => e.classList.contains("kimidian-wait"));
  await sleep(60); // > 40ms 无 chunk
  ok(!!wfind() && wfind().textContent.includes("正在等待模型响应"),
    "5 秒无 chunk 显示等待指示");
  await sleep(50); // > 90ms
  ok(wfind() && wfind().textContent.includes("模型响应较慢"), "60 秒升级文案");
  // 收到 chunk 立即撤
  view.handleSessionUpdate({ sessionId: view.sessionId, update: {
    sessionUpdate: "agent_message_chunk", content: { type: "text", text: "来了" } } });
  ok(!wfind(), "收到 chunk 立即撤掉等待指示");
  // 工具执行：立即显示执行状态
  view.handleSessionUpdate({ sessionId: view.sessionId, update: {
    sessionUpdate: "tool_call", toolCallId: "t1", title: "Read", kind: "read",
    status: "in_progress", locations: [{ path: "D:/x/SCHEMA.md" }] } });
  ok(wfind() && wfind().textContent.includes("正在执行：Read") &&
     wfind().textContent.includes("SCHEMA.md"),
    `工具执行显示名称与文件（实际 "${wfind() && wfind().textContent}"）`);
  // 工具完成 → 撤执行指示并重计 5s
  view.handleSessionUpdate({ sessionId: view.sessionId, update: {
    sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" } });
  ok(!wfind(), "工具完成撤掉执行指示");
  await sleep(60);
  ok(!!wfind(), "工具完成后 5 秒无 chunk 再次显示等待");
  // 轮次结束撤掉
  resolveP2({ stopReason: "end_turn" });
  await p2;
  ok(!wfind(), "轮次结束撤掉等待指示");
  ok(view.busy === false, "轮次结束 busy 复位");
  // 回放隔离：回放期间 arm 不生效
  view.replaying = true;
  view.armWaitIndicator();
  await sleep(60);
  ok(!wfind(), "回放期间不显示等待指示");
  view.replaying = false;

  console.log("== @ 补全排序：当前笔记第一 → 同文件夹优先 → 其余路径序 ==");
  // fs / pathM 复用前文已声明的 require
  // bundle 内联了另一份 mock 类，靠 __mockTFile/__mockTFolder 标记过 instanceof
  const mkFile = (p) => {
    const f = new obs.TFile();
    f.path = p;
    f.name = p.split("/").pop();
    f.extension = "md";
    f.parent = { path: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "" };
    return f;
  };
  const fActive = mkFile("proj/当前笔记.md");
  const fSibling = mkFile("proj/同夹笔记.md");
  const fOther = mkFile("aaa/其他.md");
  client = makeClient();
  plugin = makePlugin(client);
  plugin.app.vault.getMarkdownFiles = () => [fOther, fSibling, fActive];
  plugin.app.workspace.getActiveFile = () => fActive;
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  view.inputEl.value = "@";
  view.inputEl.selectionStart = 1;
  view.updateSuggest();
  let sg = view.contentEl.findAll((e) => e.classList.contains("kimidian-suggest-item"));
  ok(sg.length === 3 &&
     sg[0].textContent === "proj/当前笔记.md" &&
     sg[1].textContent === "proj/同夹笔记.md" &&
     sg[2].textContent === "aaa/其他.md",
    `空查询排序：当前笔记 → 同文件夹 → 路径序（实际 ${sg.map((e) => e.textContent).join(", ")}）`);
  view.inputEl.value = "问 @其他";
  view.inputEl.selectionStart = 5;
  view.updateSuggest();
  sg = view.contentEl.findAll((e) => e.classList.contains("kimidian-suggest-item"));
  ok(sg.length === 1 && sg[0].textContent === "aaa/其他.md",
    `带查询仍按模糊匹配过滤（实际 ${sg.length} 条）`);
  // 选中补全：只留 chip，输入框清掉 @query（不放 @[[路径]] token）
  view.acceptSuggestion(fOther);
  ok(view.inputEl.value === "问 " && !view.inputEl.value.includes("@"),
    `选中补全后输入框无 token（实际 "${view.inputEl.value}"）`);
  ok(view.attachments.length === 1 && view.attachments[0].path === "aaa/其他.md",
    "选中补全后引用进入附件 chips");
  const accChips = view.chipsEl.findAll((e) => e.classList.contains("kimidian-chip"));
  ok(accChips.some((e) => e.textContent.includes("aaa/其他.md")), "chip 显示在输入框上方");
  view.attachments = [];
  view.renderChips();
  view.closeSuggest();

  console.log("== 拖拽引用：笔记 → @ 位置引用；文件夹 → 文件夹引用 ==");
  const fNote = mkFile("13_Resources/配色数据.md");
  plugin.app.vault.adapter.write("13_Resources/配色数据.md", "配色内容正文");
  plugin.app.metadataCache = {
    getFirstLinkpathDest: (link) => (link === "13_Resources/配色数据.md" ? fNote : null),
  };
  const fChild = mkFile("22_Anki/英语.md");
  const fFolder = new obs.TFolder();
  fFolder.path = "22_Anki";
  fFolder.name = "22_Anki";
  fFolder.children = [fChild];
  plugin.app.vault.getAbstractFileByPath = (p) => (p === "22_Anki" ? fFolder : null);
  await view.onDrop({ preventDefault() {},
    dataTransfer: { getData: () => "[[13_Resources/配色数据.md]]", files: [] } });
  ok(!view.inputEl.value.includes("@[[") ,
    "拖入笔记 → 输入框不放 token（只留 chip）");
  ok(view.attachments.length === 1 &&
     view.attachments[0].path === "13_Resources/配色数据.md" && !view.attachments[0].folder,
    "拖入笔记 → 普通附件引用");
  await view.onDrop({ preventDefault() {},
    dataTransfer: { getData: () => "22_Anki", files: [] } });
  ok(view.attachments.length === 2 && view.attachments[1].folder === true,
    "拖入文件夹 → folder 标记附件");
  const refChipEls = view.chipsEl.findAll((e) => e.classList.contains("kimidian-chip"));
  ok(refChipEls.some((e) => e.textContent.includes("📁 22_Anki")), "文件夹 chip 带 📁 标识");
  // Obsidian 内部拖拽：数据在 app.dragManager.draggable，dataTransfer 无文本
  const fDragNote = mkFile("00_Fleeting/蔚蓝自研.md");
  const fDragFolder = new obs.TFolder();
  fDragFolder.path = "00_Fleeting";
  fDragFolder.name = "00_Fleeting";
  fDragFolder.children = [fDragNote];
  plugin.app.dragManager = { draggable: { type: "file", file: fDragNote } };
  await view.onDrop({ preventDefault() {},
    dataTransfer: { getData: () => "", files: [] } });
  ok(view.attachments.some((a) => a.path === "00_Fleeting/蔚蓝自研.md" && !a.folder),
    "dragManager 拖入笔记 → 附件引用（dataTransfer 无文本也能识别）");
  plugin.app.dragManager = { draggable: { type: "folder", file: fDragFolder } };
  await view.onDrop({ preventDefault() {},
    dataTransfer: { getData: () => "", files: [] } });
  ok(view.attachments.some((a) => a.path === "00_Fleeting" && a.folder === true),
    "dragManager 拖入文件夹 → 文件夹引用");
  plugin.app.dragManager = { draggable: null };
  const ctxXml = await view.buildContextBlocks();
  ok(ctxXml.includes('<folder path="C:/vault/22_Anki">') && ctxXml.includes("- 22_Anki/英语.md"),
    "发送时文件夹注入 <folder> 块与笔记清单");
  ok(ctxXml.includes('<file path="C:/vault/13_Resources/配色数据.md">'),
    "笔记引用仍注入 <file> 内容块");
  // 空文本 + 只有引用 chips：允许发送，引用内容走上下文
  view.attachments = [{ path: "13_Resources/配色数据.md" }];
  view.renderChips();
  view.inputEl.value = "";
  await view.sendMessage();
  ok(client.promptCalls === 1 &&
     (client.lastPromptBlocks?.[0]?.text ?? "").includes("<file path=\"C:/vault/13_Resources/配色数据.md\">"),
    "空文本仅引用时可发送且上下文携带被引用文件");
  view.attachments = [];
  view.renderChips();

  console.log("== 历史会话删除：确认 → 删 CLI 目录 + 元数据 + 面板条目 ==");
  const delRoot = pathM.join(__dirname, ".tmp-del-test");
  fs.rmSync(delRoot, { recursive: true, force: true });
  const sessDir = pathM.join(delRoot, "kimi-home", "sessions", "wd1", "s-del");
  fs.mkdirSync(pathM.join(sessDir, "agents", "main"), { recursive: true });
  fs.writeFileSync(pathM.join(sessDir, "agents", "main", "wire.jsonl"), "{}\n");
  client = makeClient();
  plugin = makePlugin(client, {
    cliPath: pathM.join(delRoot, "kimi-home", "bin", "kimi.exe"),
    sessionMeta: { "s-del": { title: "要删的会话", updatedAt: 1 } },
  });
  client.sessionList = async () => [
    { sessionId: "s-del", title: "要删的会话", updatedAt: "2026-07-01T00:00:00Z", cwd: "C:/vault" },
  ];
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  await view.toggleHistory();
  let hItems = view.historyPanelEl.findAll((e) => e.classList.contains("kimidian-history-item"));
  ok(hItems.length === 1, "历史面板列出 1 个会话");
  const delBtn = hItems[0] && hItems[0].find((e) => e.classList.contains("kimidian-history-del"));
  ok(!!delBtn, "会话条目有删除按钮");
  globalThis.__mockConfirm = () => true;
  delBtn.onclick({ stopPropagation() {} });
  await sleep(20);
  ok(!fs.existsSync(sessDir), "确认后 CLI 会话目录已删除");
  ok(!plugin.settings.sessionMeta["s-del"], "本地 sessionMeta 已清除");
  ok(plugin.saveCalls > 0, "删除后持久化设置");
  hItems = view.historyPanelEl.findAll((e) => e.classList.contains("kimidian-history-item"));
  ok(hItems.length === 0 && view.historyPanelEl.textContent.includes("暂无历史会话"),
    "条目移除并显示空态");
  ok(client.loadCalls.length === 0, "点删除不触发会话加载");
  fs.rmSync(delRoot, { recursive: true, force: true });
  globalThis.__mockConfirm = null;

  console.log("== 活动笔记自动引用 chip：跟随切换 / × 排除 / 上下文去重 ==");
  const fCur1 = mkFile("11_Projects/财务BP.md");
  const fCur2 = mkFile("md文件语法.md");
  client = makeClient();
  plugin = makePlugin(client, { attachActiveNote: true });
  plugin.app.workspace.getActiveFile = () => fCur1;
  view = new KimidianView({ app: plugin.app }, plugin);
  await view.onOpen();
  await sleep(30);
  const activeChipOf = () =>
    view.chipsEl.find((e) => e.classList.contains("kimidian-chip-active"));
  ok(activeChipOf() && activeChipOf().textContent.includes("11_Projects/财务BP.md"),
    "打开视图即显示当前笔记 chip");
  // 切换笔记 → chip 跟随
  plugin.app.workspace.getActiveFile = () => fCur2;
  view.renderChips();
  ok(activeChipOf() && activeChipOf().textContent.includes("md文件语法.md") &&
     !activeChipOf().textContent.includes("财务BP"),
    "切换笔记后 chip 自动跟随");
  // 发送上下文带 <active-note>
  let ctx2 = await view.buildContextBlocks();
  ok(ctx2.includes('<active-note path="md文件语法.md" />'), "上下文注入 <active-note>");
  // × 排除：chip 消失且上下文不再注入；切到别的笔记恢复
  activeChipOf().find((e) => e.classList.contains("kimidian-chip-x")).onclick();
  ok(!activeChipOf(), "× 后当前笔记 chip 消失");
  ctx2 = await view.buildContextBlocks();
  ok(!ctx2.includes("<active-note"), "× 后上下文不再注入 active-note");
  plugin.app.workspace.getActiveFile = () => fCur1;
  view.renderChips();
  ok(activeChipOf() && activeChipOf().textContent.includes("财务BP"),
    "切到别的笔记后 chip 恢复");
  // 手动 @ 同一笔记 → 不重复显示/注入
  plugin.app.workspace.getActiveFile = () => fCur1;
  view.attachments = [{ path: "11_Projects/财务BP.md" }];
  view.renderChips();
  ok(!activeChipOf(), "已手动引用的笔记不再显示自动 chip");
  plugin.app.vault.adapter.write("11_Projects/财务BP.md", "财务内容");
  ctx2 = await view.buildContextBlocks();
  ok(!ctx2.includes("<active-note") && ctx2.includes('<file path="C:/vault/11_Projects/财务BP.md">'),
    "手动引用与 active-note 不重复注入");
  view.attachments = [];
  // 设置关闭 → 不显示 chip
  plugin.settings.attachActiveNote = false;
  view.renderChips();
  ok(!activeChipOf(), "attachActiveNote 关闭时不显示 chip");

  console.log(failed === 0 ? "\n===== DOM 回归测试全部通过 =====" : `\n===== ${failed} 项失败 =====`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
