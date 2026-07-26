/**
 * KimidianView —— 右侧边栏聊天视图。
 *
 * 布局：顶部工具栏（新对话 / 历史 / 重连）→ 消息区 → 附件 chips → 输入区 → 底部状态栏。
 * 支持：流式 Markdown 渲染、工具调用折叠块、思考折叠块、权限内联按钮、
 * @ 笔记补全、历史会话列表与恢复（kimi acp 支持 session/list + session/load）。
 */
import {
  App,
  FileSystemAdapter,
  ItemView,
  MarkdownRenderer,
  Menu,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { AuthRequiredError, KimiAcpClient } from "./acp-client";
import { BRAND_NAME, MOON_ICON_ID, MOON_SVG } from "./brand";
import {
  BINARY_STORE_DIR,
  MAX_IMAGE_BYTES,
  PendingAttachment,
  binaryRefLine,
  bytesToBase64,
  classifyFile,
  fileRefXml,
  formatSize,
  imageMimeFor,
  truncateText,
} from "./attachments";
import { copyTextFor, writeClipboardText } from "./copy";
import { DisplayRef, formatUserDisplay } from "./message-filter";
import { selectionInfoIn, selCopyPos, RectLike } from "./selection-pop";
import {
  backfillEntryTimes,
  formatMsgTime,
  parseWireMsgTimes,
} from "./msg-time";
import {
  normalizeModelInput,
  pickModelOption,
  pickThinkingOption,
  selectViewState,
} from "./config-options";
import {
  PERMISSION_MODE_LABELS,
  PermissionMode,
  cliModeFor,
  decidePermission,
  toolKeyOf,
} from "./permission-policy";
import { ScrollFollow } from "./scroll-follow";
import { ContextUsage, computeContextUsage, computeEstimatedUsage, estimateWireChars, parseWireUsage } from "./usage";
import {
  ContentBlock,
  RequestPermissionOutcome,
  RequestPermissionParams,
  SessionConfigOption,
  SessionInfo,
  SessionNotification,
  ToolCallInfo,
} from "./acp-types";
import type KimidianPlugin from "./main";

export const KIMIDIAN_VIEW_TYPE = "kimidian-view";

/** 单条注入笔记内容的最大字符数 */
const MAX_ATTACH_CHARS = 20000;

interface Attachment {
  /** vault 相对路径 */
  path: string;
}

/** 流式渲染中的工具调用块 */
interface ToolBlock {
  el: HTMLElement;
  titleEl: HTMLElement;
  statusEl: HTMLElement;
  bodyEl: HTMLElement;
}

/**
 * 消息日志条目：消息状态的数据层（DOM 只是它的投影）。
 * 面板切换/视图重挂载时从这里恢复渲染。
 * ts：消息时间戳（epoch ms）；tsEst：时间为估算（恢复时的时间，
 * wire 日志回填失败时的兜底），UI 淡化显示。
 */
type MsgEntry =
  | { kind: "user"; text: string; refs?: DisplayRef[]; ts?: number; tsEst?: boolean }
  | { kind: "assistant"; text: string; ts?: number; tsEst?: boolean }
  | { kind: "thought"; text: string; ts?: number }
  | { kind: "tool"; tool: ToolCallInfo }
  | { kind: "system"; text: string }
  | { kind: "error"; text: string };

/** 消息日志上限（超出丢最旧，防长会话内存膨胀） */
const MSG_LOG_MAX = 500;

export class KimidianView extends ItemView {
  private toolbarEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private chipsEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private statusModelEl!: HTMLElement;
  private statusEffortEl!: HTMLElement;
  private statusConnEl!: HTMLElement;
  /** 上下文用量指示（状态栏，模型下拉旁） */
  private statusUsageEl!: HTMLElement;
  /** 当前会话 wire.jsonl 的缓存路径（定位一次后复用） */
  private wirePath: string | null = null;
  /** 用量刷新定时器（轮次结束后延迟读取，等 CLI 落盘 usage.record） */
  private usageTimer: number | null = null;
  // ---- 等待模型响应指示 ----
  /** 5 秒无 chunk → 显示等待指示的计时器 */
  private waitTimer: number | null = null;
  /** 60 秒无 chunk → 升级文案的计时器 */
  private waitSlowTimer: number | null = null;
  private waitEl: HTMLElement | null = null;
  private waitTextEl: HTMLElement | null = null;
  /** 阈值（测试可调小） */
  private waitDelayMs = 5000;
  private waitSlowMs = 60000;
  /** 正在执行的工具数（全部完成后才重新等模型输出） */
  private runningTools = 0;
  /** 权限模式盾牌按钮（输入区左下） */
  private shieldBtn!: HTMLElement;
  private shieldLabel!: HTMLElement;
  private shieldBadge!: HTMLElement;
  /** 待处理权限请求数（角标 + 动效） */
  private pendingPermissions = 0;
  /** 滚动跟随状态：用户上翻时流式渲染不再强制拉到底部 */
  private scrollFollow = new ScrollFollow();
  /** 「↓ 新消息」悬浮按钮（不跟随时显示） */
  private newMsgBtn: HTMLElement | null = null;
  private historyPanelEl: HTMLElement | null = null;
  private suggestEl: HTMLElement | null = null;

  private sessionId: string | null = null;
  private busy = false;
  /** 当前正在流式渲染的助手消息容器（含原文 buffer） */
  private streamEl: HTMLElement | null = null;
  private streamText = "";
  /** 当前思考块 */
  private thoughtEl: HTMLElement | null = null;
  private thoughtBodyEl: HTMLElement | null = null;
  private thoughtText = "";
  /** 工具调用块索引 */
  private toolBlocks = new Map<string, ToolBlock>();
  /** 消息日志（数据层）：渲染只是投影，面板切换/视图重建不丢 */
  private msgLog: MsgEntry[] = [];
  /** 当前正在写入的助手正文/思考/工具条目（流式增量更新同一个对象） */
  private curAssistantEntry: (MsgEntry & { kind: "assistant" }) | null = null;
  private curThoughtEntry: (MsgEntry & { kind: "thought" }) | null = null;
  private toolEntries = new Map<string, MsgEntry & { kind: "tool" }>();
  /** @ 附件 */
  private attachments: Attachment[] = [];
  /** 待发送附件（粘贴/拖拽的图片与文档；发送成功才清空，失败保留） */
  private pending: PendingAttachment[] = [];
  /** 输入区容器（拖拽落入目标 + 高亮反馈） */
  private inputWrapEl!: HTMLElement;
  /** 待处理的权限请求（取消时需要回 cancelled） */
  private pendingPermissionResolve:
    | ((o: RequestPermissionOutcome) => void)
    | null = null;
  private lastUserText = "";
  private modelOptions: SessionConfigOption | null = null;
  /** 思考强度（kimi acp 的 thinking/thought_level 配置项；k3 暴露 low/high/max） */
  private effortOptions: SessionConfigOption | null = null;
  /** 是否正在回放历史（session/load） */
  private replaying = false;
  /** 回放期间最后一条内容 chunk 的到达时间（drain 窗口用） */
  private lastReplayChunkAt = 0;
  /** 渲染异常已弹过 Notice（防刷屏；console.error 每次都记） */
  private renderErrorNoticed = false;
  /** 选区复制浮层按钮（拖选文字后浮现） */
  private selCopyBtn: HTMLElement | null = null;
  /** 浮层点击时要复制的选中文字（选区可能在点击前变化，先缓存） */
  private selCopyText = "";
  /** 消息区有活跃选区时被推迟的流式重渲染（选区清空后补渲染） */
  private deferredStreamRender = false;
  /** 会话引导状态：视图打开即建会话（creating=加载中 / failed=可重试），不再等首条消息 */
  private sessionBoot: "idle" | "creating" | "failed" = "idle";
  private sessionBootError: string | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: KimidianPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return KIMIDIAN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return BRAND_NAME;
  }

  getIcon(): string {
    return MOON_ICON_ID;
  }

  get client(): KimiAcpClient {
    return this.plugin.acpClient;
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("kimidian-root");

    // 品牌头部：月亮 logo + Kimidian（对标 Claudian 左上角）
    const brand = root.createDiv({ cls: "kimidian-brand" });
    const logo = brand.createSpan({ cls: "kimidian-brand-logo" });
    logo.innerHTML = MOON_SVG; // 内联 SVG（currentColor 适配明暗主题）
    brand.createSpan({ cls: "kimidian-brand-name", text: BRAND_NAME });

    // 顶部工具栏
    this.toolbarEl = root.createDiv({ cls: "kimidian-toolbar" });
    const newBtn = this.toolbarEl.createEl("button", {
      cls: "kimidian-tool-btn",
      text: "新对话",
    });
    newBtn.onclick = () => void this.newSession();
    const histBtn = this.toolbarEl.createEl("button", {
      cls: "kimidian-tool-btn",
      text: "历史",
    });
    histBtn.onclick = () => void this.toggleHistory();
    const reconnectBtn = this.toolbarEl.createEl("button", {
      cls: "kimidian-tool-btn kimidian-reconnect",
      text: "重连",
    });
    reconnectBtn.onclick = () => void this.reconnect();

    // 消息区
    this.messagesEl = root.createDiv({ cls: "kimidian-messages" });
    this.messagesEl.addEventListener("scroll", () => this.onMessagesScroll());
    // 拖选文字 → 选区附近浮现「复制」小按钮（document 级监听，onClose 摘除）
    document.addEventListener("selectionchange", this.onSelectionChange);
    // 消息日志恢复（视图重挂载不丢）；空则显示欢迎页
    if (this.msgLog.length > 0) this.restoreMsgLog();
    else this.renderWelcome();

    // 附件 chips
    this.chipsEl = root.createDiv({ cls: "kimidian-chips" });

    // 输入区
    const inputWrap = root.createDiv({ cls: "kimidian-input-wrap" });
    this.inputWrapEl = inputWrap;
    this.inputEl = inputWrap.createEl("textarea", {
      cls: "kimidian-input",
      attr: { placeholder: "向 Kimi 提问…（@ 引用笔记，Enter 发送，Shift+Enter 换行，可粘贴/拖拽图片与文档）", rows: "3" },
    });
    this.inputEl.addEventListener("keydown", (e) => this.onInputKeydown(e));
    this.inputEl.addEventListener("input", () => this.updateSuggest());
    this.inputEl.addEventListener("paste", (e) => void this.onPaste(e));
    // 拖拽：拖入高亮 + 落下接管
    inputWrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      inputWrap.classList.add("is-dragover");
    });
    inputWrap.addEventListener("dragleave", () => {
      inputWrap.classList.remove("is-dragover");
    });
    inputWrap.addEventListener("drop", (e) => void this.onDrop(e));
    this.inputEl.addEventListener("blur", () => {
      // 延迟关闭，给点击补全项留出时间
      window.setTimeout(() => this.closeSuggest(), 150);
    });

    this.sendBtn = inputWrap.createEl("button", {
      cls: "kimidian-send mod-cta",
      text: "发送",
    });
    this.sendBtn.onclick = () => {
      if (this.busy) this.cancelTurn();
      else void this.sendMessage();
    };

    // 输入区左下：权限模式盾牌按钮（对标 Kimi 主界面）
    const inputFooter = root.createDiv({ cls: "kimidian-input-footer" });
    this.shieldBtn = inputFooter.createDiv({ cls: "kimidian-shield-btn" });
    const shieldIcon = this.shieldBtn.createSpan({ cls: "kimidian-shield-icon" });
    setIcon(shieldIcon, "shield");
    this.shieldLabel = this.shieldBtn.createSpan({ cls: "kimidian-shield-label" });
    this.shieldBtn.createSpan({ cls: "kimidian-shield-caret", text: "▾" });
    this.shieldBadge = this.shieldBtn.createSpan({ cls: "kimidian-shield-badge" });
    this.shieldBtn.title = "权限模式：控制工具调用的审批方式";
    this.shieldBtn.onclick = (e) => this.showPermissionMenu(e);
    this.updateShield();
    // 右下角：重置会话（卡住时一键新建会话，不用重载插件）
    const resetBtn = inputFooter.createEl("button", {
      cls: "kimidian-reset-btn",
      text: "重置会话",
    });
    resetBtn.title = "取消当前轮次并新建会话（旧会话可从「历史」面板找回）";
    resetBtn.onclick = () => void this.newSession();

    // 底部状态栏
    const status = root.createDiv({ cls: "kimidian-statusbar" });
    this.statusModelEl = status.createSpan({ cls: "kimidian-status-model" });
    this.statusEffortEl = status.createSpan({ cls: "kimidian-status-effort" });
    this.statusUsageEl = status.createSpan({ cls: "kimidian-status-usage" });
    this.statusConnEl = status.createSpan({ cls: "kimidian-status-conn" });
    this.renderStatus();

    // 立即引导：连接 → 建会话 → 渲染模型/思考下拉（懒创建会让下拉拿不到 configOptions）
    void this.bootstrap();
    // 界面状态记忆：上次停在历史面板则如实恢复（bootstrap 与面板加载各自独立）
    if (this.plugin.settings.uiState?.historyOpen) void this.toggleHistory();
  }

  /**
   * 会话引导：ACP 连接建立后立即拿到可用会话（不等用户发第一条消息）。
   * 优先通过 session/load 恢复插件记住的上次会话（视图被销毁重建时
   * 消息从 CLI 侧回放重建）；恢复失败或 forceNew（用户点「新对话」）时新建。
   * 期间模型控件显示「加载中…」，失败显示可点击的「重试」态。
   */
  private async bootstrap(forceNew = false): Promise<void> {
    if (this.sessionId || this.sessionBoot === "creating") return;
    this.sessionBoot = "creating";
    this.sessionBootError = null;
    this.renderStatus();
    if (!(await this.ensureConnected())) {
      this.sessionBoot = "failed";
      this.sessionBootError = "无法连接 Kimi CLI";
      this.renderStatus();
      return;
    }
    // 恢复上次会话（ACP 进程与会话还活着时，消息经回放完整回来）
    const last = forceNew ? null : this.plugin.lastSessionId;
    if (last && (await this.restoreSession(last))) {
      this.sessionBoot = "idle";
      this.renderStatus();
      return;
    }
    if (await this.ensureSession()) {
      this.sessionBoot = "idle";
    } else {
      this.sessionBoot = "failed";
      this.sessionBootError = "会话创建失败";
    }
    this.renderStatus();
  }

  /**
   * 从 CLI 侧恢复已有会话：session/load 的历史回放经 session/update 推送，
   * 走正常渲染路径同时重建消息日志（数据层）。
   */
  private async restoreSession(sessionId: string): Promise<boolean> {
    const base = this.vaultBasePath();
    if (!base) return false;
    try {
      this.msgLog = [];
      this.messagesEl.empty();
      this.beginAssistantTurn();
      this.sessionId = sessionId;
      this.wirePath = null;
      this.replaying = true;
      const result = (await this.client.sessionLoad(sessionId, base)) as unknown as {
        configOptions?: SessionConfigOption[];
      };
      // 响应返回不代表回放推完（迟到 chunk 会被 replaying=false 丢掉，
      // 表现为"最后一段对话没了"）：等一个静默窗口再结束回放态
      await this.waitForReplayQuiet();
      this.replaying = false;
      // drain 期间用户已切走（新会话/别的会话）：不写状态，避免覆盖新会话
      if (this.sessionId !== sessionId) return true;
      this.applyConfigOptions(result?.configOptions ?? null);
      // 恢复路径同样保持「手动选择 > 默认 K3」
      await this.applyModelPreference();
      this.plugin.lastSessionId = sessionId;
      // 回放消息的时间戳：用 wire.jsonl 落盘时间回填（否则全显示"现在"）
      await this.backfillReplayTimes();
      this.renderStatus();
      this.refreshUsage(0);
      this.scrollToBottom();
      return true;
    } catch (e) {
      this.replaying = false;
      this.sessionId = null;
      console.warn("[kimidian] 恢复上次会话失败:", e);
      return false;
    }
  }

  /**
   * 回放静默窗口：session/load 响应返回后，再等一会儿确认没有
   * 迟到的回放 chunk（实测响应在最后，但顺序没有协议保证）。
   * 收到 chunk 会重置计时；maxMs 兜底防挂死。
   */
  private async waitForReplayQuiet(quietMs = 400, maxMs = 5000): Promise<void> {
    const start = Date.now();
    this.lastReplayChunkAt = 0;
    while (Date.now() - start < maxMs) {
      await new Promise((r) => window.setTimeout(r, quietMs));
      if (!this.replaying) return; // 外部已中断（catch / 新会话）
      if (this.lastReplayChunkAt === 0) return; // 静默期内无迟到 chunk
      if (Date.now() - this.lastReplayChunkAt >= quietMs) return; // chunk 已静默
    }
  }

  async onClose(): Promise<void> {
    // 视图关闭时中断当前轮次并回掉挂起的权限请求
    if (this.sessionId && this.busy) this.client.cancel(this.sessionId);
    this.resolvePendingPermission({ outcome: "cancelled" });
    this.hideWaitIndicator();
    document.removeEventListener("selectionchange", this.onSelectionChange);
    this.hideSelCopyBtn();
    if (this.usageTimer !== null) {
      window.clearTimeout(this.usageTimer);
      this.usageTimer = null;
    }
  }

  // ================= 连接 =================

  private async ensureConnected(): Promise<boolean> {
    try {
      // 关键：子进程 cwd 必须是 vault 根目录，否则 agent 会按
      // Obsidian 进程 cwd（C 盘安装目录）解析相对路径并可能报 -32603。
      this.client.setCwd(this.vaultBasePath());
      // Git Bash 路径（Windows 必需）：设置页手动值优先，空则自动探测注入
      this.client.setBashPath(this.plugin.settings.bashPath);
      await this.client.ensureStarted();
      this.renderStatus();
      return true;
    } catch (e) {
      this.renderStatus();
      new Notice(`Kimi CLI 启动失败：${(e as Error).message}`, 8000);
      this.renderSystemMsg(
        `⚠️ 无法启动 Kimi CLI。\n\n${(e as Error).message}\n\n请到插件设置检查 CLI 路径，然后点击顶部「重连」。`
      );
      return false;
    }
  }

  private async reconnect(): Promise<void> {
    try {
      this.client.updateCommand(
        this.plugin.settings.cliPath,
        this.splitArgs(this.plugin.settings.extraArgs)
      );
      this.client.setCwd(this.vaultBasePath());
      this.client.setBashPath(this.plugin.settings.bashPath);
      await this.client.restart();
      // 重启后旧会话随进程消亡：清掉并立即重建（否则下拉停在旧数据/占位）
      this.sessionId = null;
      this.wirePath = null;
      this.modelOptions = null;
      this.effortOptions = null;
      this.sessionBoot = "idle";
      this.renderStatus();
      void this.bootstrap();
      new Notice("Kimi CLI 已重新连接");
    } catch (e) {
      new Notice(`重连失败：${(e as Error).message}`, 8000);
    }
  }

  private splitArgs(s: string): string[] {
    return s.split(/\s+/).filter((x) => x.length > 0);
  }

  // ================= 会话 =================

  private async newSession(): Promise<void> {
    // 新对话/重置会话统一收尾：取消在跑的轮次、清等待指示、复位 busy
    //（否则旧轮次的 await 返回前发送键会一直停在「停止」）
    this.cancelTurn();
    this.endAssistantTurn();
    this.setBusy(false);
    this.hideWaitIndicator();
    if (!(await this.ensureConnected())) return;
    this.sessionId = null;
    this.wirePath = null;
    this.sessionBoot = "idle"; // 允许重新引导
    this.plugin.lastSessionId = null; // 明确开新：不恢复旧会话
    this.msgLog = [];
    this.messagesEl.empty();
    this.renderWelcome();
    this.modelOptions = null;
    this.effortOptions = null;
    this.renderStatus();
    this.renderUsage(null);
    // 新对话立即建新会话（下拉马上有数据），不再等首条消息
    void this.bootstrap(true);
    this.inputEl.focus();
  }

  private async ensureSession(): Promise<boolean> {
    if (this.sessionId) return true;
    const basePath = this.vaultBasePath();
    if (!basePath) {
      new Notice("无法获取 vault 路径（仅支持本地文件系统 vault）");
      return false;
    }
    try {
      const r = await this.client.sessionNew(basePath);
      this.sessionId = r.sessionId;
      this.wirePath = null;
      this.sessionBoot = "idle"; // 引导成功（含 sendMessage 兜底路径）
      this.sessionBootError = null;
      this.plugin.lastSessionId = r.sessionId; // 视图重建时经 session/load 恢复
      this.renderUsage(null);
      this.applyConfigOptions(r.configOptions ?? null);
      // 同步权限模式到 CLI 原生 mode（双保险；客户端仍做主判定）
      this.syncCliMode();
      await this.applyModelPreference();
      return true;
    } catch (e) {
      this.handleSessionError(e);
      return false;
    }
  }

  private vaultBasePath(): string | null {
    // 鸭子类型而非 instanceof FileSystemAdapter：
    // 兼容任何实现 getBasePath 的适配器（也避免双份 obsidian 模块时 instanceof 失效）
    const adapter = this.app.vault.adapter as Partial<FileSystemAdapter>;
    if (typeof adapter.getBasePath === "function") return adapter.getBasePath();
    return null;
  }

  /**
   * 应用模型偏好：手动选择（settings.model）优先，否则默认模型（defaultModel，默认 K3）。
   * 归一化接受完整 ID / 显示名 / 末段短名；无法识别的值不下发（避免每会话重复失败）。
   * 所有会话建立/恢复路径（session/new、session/load、restore）都必须走这里。
   */
  private async applyModelPreference(): Promise<void> {
    const wantRaw = this.plugin.settings.model || this.plugin.settings.defaultModel;
    if (!wantRaw || !this.modelOptions || !this.sessionId) return;
    const norm = normalizeModelInput(wantRaw, this.modelOptions, "");
    if (!norm.recognized) {
      console.warn(`[kimidian] 模型值无法识别，已跳过下发: ${wantRaw}`);
      return;
    }
    if (norm.value === this.modelOptions.currentValue) return;
    try {
      const opts = await this.client.setConfigOption(
        this.sessionId,
        "model",
        norm.value
      );
      this.applyConfigOptions(opts);
    } catch (e) {
      console.warn("[kimidian] 设置模型失败:", e);
    }
  }

  private applyConfigOptions(opts: SessionConfigOption[] | null): void {
    if (!opts || opts.length === 0) return;
    const m = pickModelOption(opts);
    if (m) {
      this.modelOptions = m;
      // 持久化最近一次的模型选项表（设置页「默认模型」下拉的数据源）
      const optsJson = JSON.stringify(m.options ?? []);
      if (optsJson !== JSON.stringify(this.plugin.settings.lastModelOptions)) {
        this.plugin.settings.lastModelOptions = (m.options ?? []).map((o) => ({
          value: o.value,
          name: o.name,
        }));
        void this.plugin.saveSettings();
      }
    }
    // 思考强度：kimi acp 用 thinking（category=thought_level）暴露，
    // k2-coding 只有 on；切到 k3 后变成 low/high/max。
    const ef = pickThinkingOption(opts);
    if (ef) this.effortOptions = ef;
    this.renderStatus();
  }

  // ================= 发送消息 =================

  private async sendMessage(): Promise<void> {
    const raw = this.inputEl.value.trim();
    if (this.busy) return;
    if (!raw && this.pending.length === 0) return;
    if (!(await this.ensureConnected())) return;
    if (!(await this.ensureSession())) return;

    const text = raw ? this.stripAttachmentTokens(raw) : "";
    this.lastUserText = text || raw || "附件";
    this.inputEl.value = "";
    this.renderUserMsg(
      raw || `（发送附件：${this.pending.map((p) => p.name).join("、")}）`
    );
    this.forceScrollToBottom(); // 用户自己发消息：恢复跟随并滚到底

    // 组装 prompt：用户文本 + 上下文 XML 块 + 文本文档附件 + 二进制路径引用 + 图片块
    const ctx = await this.buildContextBlocks();
    const parts: string[] = [];
    if (text) parts.push(text);
    if (ctx) parts.push(ctx);
    for (const p of this.pending) {
      if (p.kind === "text") {
        const { text: c, truncated } = truncateText(p.content, MAX_ATTACH_CHARS);
        parts.push(fileRefXml(p.name, c, truncated));
      } else if (p.kind === "binary") {
        parts.push(binaryRefLine(p.vaultPath));
      }
    }
    const blocks: ContentBlock[] = [
      { type: "text", text: parts.join("\n\n") || "（见附件图片）" },
    ];
    for (const p of this.pending) {
      if (p.kind === "image") {
        blocks.push({ type: "image", data: p.dataBase64, mimeType: p.mimeType });
      }
    }

    this.setBusy(true);
    this.beginAssistantTurn();
    this.armWaitIndicator(); // 5 秒无 chunk → 显示等待指示（覆盖首轮 LLM stall）
    const sid = this.sessionId!;

    try {
      const result = await this.client.prompt(sid, blocks);
      this.hideWaitIndicator();
      // 等待期间会话已被重置/切换：不往新会话写任何状态（busy 已由重置路径复位）
      if (this.sessionId !== sid) return;
      // 发送成功才清空附件（失败保留，别把用户贴的东西弄丢）
      this.attachments = [];
      this.pending = [];
      this.renderChips();
      this.endAssistantTurn();
      this.setBusy(false);
      this.persistSessionMeta();
      // 等 CLI 把本轮 usage.record 落盘后再读（实测略晚于 prompt 响应返回）
      this.refreshUsage(1500);
      if (result.stopReason === "cancelled") {
        this.renderSystemMsg("已停止。");
      } else if (result.stopReason !== "end_turn") {
        this.renderSystemMsg(`（本轮结束原因：${result.stopReason}）`);
      }
    } catch (e) {
      this.hideWaitIndicator();
      if (this.sessionId !== sid) return; // 同上：会话已换，不污染新会话
      this.endAssistantTurn();
      this.setBusy(false);
      this.refreshUsage(1500);
      if (e instanceof AuthRequiredError) {
        this.handleSessionError(e);
      } else {
        this.renderErrorWithRetry(e);
      }
    }
  }

  /** 把 @[[路径]] 标记从显示文本中去掉（附件内容单独注入） */
  private stripAttachmentTokens(text: string): string {
    return text.replace(/@\[\[[^\]]+\]\]/g, "").trim();
  }

  /** 构造上下文 XML：活动笔记 + @ 引用笔记 */
  private async buildContextBlocks(): Promise<string> {
    const parts: string[] = [];
    if (this.plugin.settings.attachActiveNote) {
      const f = this.app.workspace.getActiveFile();
      if (f && f.extension === "md") {
        parts.push(`<active-note path="${f.path}" />`);
      }
    }
    const base = this.vaultBasePath();
    for (const a of this.attachments) {
      try {
        const abs = base ? `${base}/${a.path}` : a.path;
        let content = await this.app.vault.adapter.read(a.path);
        let truncated = false;
        if (content.length > MAX_ATTACH_CHARS) {
          content = content.slice(0, MAX_ATTACH_CHARS);
          truncated = true;
        }
        parts.push(
          `<file path="${abs}">\n${content}${truncated ? "\n…（内容过长，已截断）" : ""}\n</file>`
        );
      } catch (e) {
        console.warn("[kimidian] 读取附件失败:", a.path, e);
      }
    }
    return parts.join("\n");
  }

  private cancelTurn(): void {
    if (this.sessionId) this.client.cancel(this.sessionId);
    this.resolvePendingPermission({ outcome: "cancelled" });
    this.hideWaitIndicator(); // 点了停止：等待指示立即撤（prompt 响应另有兜底）
  }

  // ================= 等待模型响应指示 =================

  /** 撤掉等待指示 + 清计时器（收到 chunk / 轮次结束 / 取消 / 出错时调用） */
  private hideWaitIndicator(): void {
    if (this.waitTimer !== null) {
      window.clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    if (this.waitSlowTimer !== null) {
      window.clearTimeout(this.waitSlowTimer);
      this.waitSlowTimer = null;
    }
    this.waitEl?.remove();
    this.waitEl = null;
    this.waitTextEl = null;
  }

  /**
   * 启动「N 秒无内容 chunk → 显示等待指示」倒计时。
   * 发送后与每个 chunk 到达时调用（每次重置计时）；回放期间不启用。
   */
  private armWaitIndicator(): void {
    if (this.replaying) return;
    if (this.waitTimer !== null) window.clearTimeout(this.waitTimer);
    if (this.waitSlowTimer !== null) window.clearTimeout(this.waitSlowTimer);
    this.waitTimer = window.setTimeout(() => {
      this.waitTimer = null;
      this.showWaitIndicator("正在等待模型响应…");
    }, this.waitDelayMs);
    this.waitSlowTimer = window.setTimeout(() => {
      this.waitSlowTimer = null;
      this.showWaitIndicator("模型响应较慢，仍在等待…（可点停止取消）");
    }, this.waitSlowMs);
  }

  /** 显示/更新等待指示（低调小字 + 呼吸点，区别于思考块） */
  private showWaitIndicator(text: string): void {
    if (!this.waitEl) {
      const el = this.messagesEl.createDiv({ cls: "kimidian-wait" });
      el.createSpan({ cls: "kimidian-wait-dot" });
      this.waitTextEl = el.createSpan({ cls: "kimidian-wait-text" });
      this.waitEl = el;
    }
    this.waitTextEl?.setText(text);
    this.scrollToBottom();
  }

  /** 工具开始执行：立即显示「正在执行：工具名 文件」（不等 5s；回放忽略） */
  private onToolActivityStart(tc: ToolCallInfo): void {
    if (this.replaying) return;
    this.runningTools++;
    if (this.waitTimer !== null) {
      window.clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    if (this.waitSlowTimer !== null) {
      window.clearTimeout(this.waitSlowTimer);
      this.waitSlowTimer = null;
    }
    const loc = (tc.locations ?? []).map((l) => l.path).filter(Boolean)[0];
    const short = loc ? (loc.replace(/\\/g, "/").split("/").pop() ?? "") : "";
    const name = tc.title ?? tc.kind ?? "工具";
    this.showWaitIndicator(`正在执行：${name}${short ? ` ${short}` : ""}`);
  }

  /** 工具终态：全部完成后撤掉执行指示，重新等模型输出（回放忽略） */
  private onToolActivityEnd(
    tc: Partial<ToolCallInfo> & { toolCallId: string }
  ): void {
    if (this.replaying) return;
    if (tc.status !== "completed" && tc.status !== "failed") return;
    this.runningTools = Math.max(0, this.runningTools - 1);
    if (this.runningTools === 0) {
      this.hideWaitIndicator();
      this.armWaitIndicator();
    }
  }

  // ================= 选区复制浮层 =================

  /** 消息区内是否有活跃的文字选区（流式重渲染会让位给它） */
  private selectionActiveInMessages(): boolean {
    return selectionInfoIn(this.messagesEl, window.getSelection()) !== null;
  }

  /** 选区变化：消息区内有选中文字 → 浮现「复制」小按钮；消失 → 隐藏并补渲染 */
  private onSelectionChange = (): void => {
    // 防御：document 级监听在全局频繁触发，异常绝不能外溢影响应用
    try {
      const info = selectionInfoIn(this.messagesEl, window.getSelection());
      if (!info) {
        this.hideSelCopyBtn();
        // 选区结束：补上做选期间推迟的流式渲染
        if (this.deferredStreamRender) this.flushStreamRender();
        return;
      }
      this.selCopyText = info.text;
      this.showSelCopyBtn(info.rect);
    } catch (e) {
      console.error("[kimidian] selectionchange 处理异常:", e);
    }
  };

  private showSelCopyBtn(rect: RectLike | null): void {
    if (!this.selCopyBtn) {
      const btn = this.contentEl.createDiv({ cls: "kimidian-sel-copy" });
      setIcon(btn, "copy");
      btn.createSpan({ text: " 复制" });
      // mousedown 阻止默认：保住选区，等 click 再复制
      btn.onmousedown = (e) => e.preventDefault();
      btn.onclick = () => void this.copySelectedText();
      this.selCopyBtn = btn;
    }
    const pos = selCopyPos(rect, this.contentEl.getBoundingClientRect(), {
      width: 64,
      height: 26,
    });
    this.selCopyBtn.style.left = `${pos.left}px`;
    this.selCopyBtn.style.top = `${pos.top}px`;
  }

  private hideSelCopyBtn(): void {
    if (this.selCopyBtn) {
      this.selCopyBtn.remove();
      this.selCopyBtn = null;
    }
    this.selCopyText = "";
  }

  /** 点击浮层：复制选中文字（用缓存值，点击时选区可能已变化） */
  private async copySelectedText(): Promise<void> {
    const t = this.selCopyText;
    if (!t) return;
    try {
      await writeClipboardText(t);
      const btn = this.selCopyBtn;
      if (btn) {
        btn.empty();
        setIcon(btn, "check");
        btn.createSpan({ text: " 已复制" });
      }
      // 复制完成：清选区（真实环境触发 selectionchange 自然隐藏按钮）
      window.getSelection()?.removeAllRanges();
      window.setTimeout(() => this.hideSelCopyBtn(), 900);
    } catch (e) {
      new Notice(`复制失败：${(e as Error).message}`);
    }
  }

  /** 选区结束后补做被推迟的流式渲染（正文 + 思考） */
  private flushStreamRender(): void {
    this.deferredStreamRender = false;
    if (this.streamEl && this.streamText) {
      const el = this.streamEl;
      const md = this.streamText;
      el.empty();
      void MarkdownRenderer.render(this.app, md, el, "", this).then(() =>
        this.scrollToBottom()
      );
    }
    if (this.thoughtBodyEl && this.thoughtText) {
      this.thoughtBodyEl.setText(this.thoughtText);
    }
  }

  // ================= session/update 流式渲染 =================

  handleSessionUpdate(n: SessionNotification): void {
    // 渲染防御：任何渲染异常都不能静默吞掉（否则表现为"生成中但零渲染"）。
    // 记 console.error + 弹 Notice（每实例只弹一次，防刷屏），连接与后续通知不受影响。
    try {
      this.handleSessionUpdateInner(n);
    } catch (e) {
      console.error(
        `[kimidian] 渲染 session/update 失败（${n?.update?.sessionUpdate}）:`,
        e
      );
      if (!this.renderErrorNoticed) {
        this.renderErrorNoticed = true;
        new Notice(
          `Kimidian 渲染出错：${(e as Error)?.message ?? String(e)}（详见控制台）`,
          10000
        );
      }
    }
  }

  private handleSessionUpdateInner(n: SessionNotification): void {
    if (n.sessionId !== this.sessionId) return;
    const u = n.update;
    // 回放期间记录内容 chunk 到达时间（drain 窗口判定依据；
    // available_commands_update 等控制类通知不算）
    if (
      this.replaying &&
      /^(user_message_chunk|agent_message_chunk|agent_thought_chunk|tool_call|tool_call_update)$/.test(
        u.sessionUpdate
      )
    ) {
      this.lastReplayChunkAt = Date.now();
    }
    // 兜底分支让 content 窄化失效，这里统一取出文本内容
    const chunkText = (x: unknown): string => {
      const c = (x as { content?: ContentBlock }).content;
      return c && c.type === "text" ? c.text : "";
    };
    // 内容 chunk 到达：撤等待指示并重计 5s（回放时 arm 内部直接返回）
    if (
      /^(user_message_chunk|agent_message_chunk|agent_thought_chunk)$/.test(
        u.sessionUpdate
      )
    ) {
      this.hideWaitIndicator();
      this.armWaitIndicator();
    }
    switch (u.sessionUpdate) {
      case "user_message_chunk": {
        // 回放历史时的用户消息：每条 user chunk 是一轮的边界——
        // 不重置的话，下一轮的 agent chunk 会被合并进上一轮的回答气泡
        //（streamEl 未 sealed），表现为"回答丢失/错位，末尾只剩用户气泡"。
        const t = chunkText(u);
        if (t && this.replaying) {
          this.beginAssistantTurn();
          this.renderUserMsg(t);
        }
        break;
      }
      case "agent_message_chunk": {
        const t = chunkText(u);
        if (t) this.appendAssistantText(t);
        break;
      }
      case "agent_thought_chunk": {
        const t = chunkText(u);
        if (t) this.appendThoughtText(t);
        break;
      }
      case "tool_call":
        this.renderToolCall(u as ToolCallInfo);
        this.onToolActivityStart(u as ToolCallInfo);
        break;
      case "tool_call_update": {
        const tu = u as Partial<ToolCallInfo> & { toolCallId: string };
        this.updateToolCall(tu);
        this.onToolActivityEnd(tu);
        break;
      }
      case "config_option_update":
        this.applyConfigOptions(
          (u as { configOptions?: SessionConfigOption[] }).configOptions ?? null
        );
        break;
      default:
        break; // plan / available_commands_update 等暂不展示
    }
  }

  /** 一轮助手输出开始（新 prompt 时调用） */
  private beginAssistantTurn(): void {
    this.streamEl = null;
    this.streamText = "";
    this.thoughtEl = null;
    this.thoughtText = "";
    this.toolBlocks.clear();
    // 数据层同步重置：新一轮起新的正文/思考/工具条目
    this.curAssistantEntry = null;
    this.curThoughtEntry = null;
    this.toolEntries.clear();
  }

  private endAssistantTurn(): void {
    this.beginAssistantTurn();
  }

  private currentMsgContainer(): HTMLElement {
    if (!this.streamEl) {
      const wrap = this.messagesEl.createDiv({
        cls: "kimidian-msg kimidian-msg-assistant",
      });
      this.streamEl = wrap.createDiv({ cls: "kimidian-msg-body" });
      this.streamText = "";
    }
    return this.streamEl;
  }

  private appendAssistantText(text: string): void {
    // 文本和工具块交错时，每段文本独立成块
    if (!this.streamEl || this.streamEl.dataset.sealed === "1") {
      const wrap = this.messagesEl.createDiv({
        cls: "kimidian-msg kimidian-msg-assistant",
      });
      this.streamEl = wrap.createDiv({ cls: "kimidian-msg-body" });
      this.streamText = "";
      // 数据层：新开一个正文条目，后续增量写同一对象
      // ts = 本轮开始时间（流式期间不变）；回放时先标估算，drain 后用 wire 日志回填
      const entry: MsgEntry & { kind: "assistant" } = {
        kind: "assistant",
        text: "",
        ts: Date.now(),
        tsEst: this.replaying ? true : undefined,
      };
      this.curAssistantEntry = entry;
      this.logPush(entry);
      this.addCopyBtn(wrap, () => entry.text);
      this.renderMsgTs(wrap, entry);
    }
    this.streamText += text;
    if (this.curAssistantEntry) this.curAssistantEntry.text = this.streamText;
    // 用户正在消息区拖选：整泡重渲染会销毁选区，先记账，选区结束后补渲染
    if (this.selectionActiveInMessages()) {
      this.deferredStreamRender = true;
      return;
    }
    const el = this.streamEl;
    const md = this.streamText;
    el.empty();
    void MarkdownRenderer.render(this.app, md, el, "", this).then(() => {
      this.scrollToBottom();
    });
    this.scrollToBottom();
  }

  private appendThoughtText(text: string): void {
    if (!this.thoughtEl) {
      const d = this.messagesEl.createEl("details", {
        cls: "kimidian-thought",
      });
      d.createEl("summary", { text: "思考过程" });
      this.thoughtBodyEl = d.createDiv({ cls: "kimidian-thought-body" });
      this.thoughtEl = d;
      this.thoughtText = "";
      this.curThoughtEntry = { kind: "thought", text: "", ts: Date.now() };
      this.logPush(this.curThoughtEntry);
      // 思考块出现后，后续正文另起一段
      if (this.streamEl) this.streamEl.dataset.sealed = "1";
    }
    this.thoughtText += text;
    if (this.curThoughtEntry) this.curThoughtEntry.text = this.thoughtText;
    // 同正文：做选期间不覆盖思考块（setText 会销毁选区）
    if (this.selectionActiveInMessages()) {
      this.deferredStreamRender = true;
      return;
    }
    if (this.thoughtBodyEl) this.thoughtBodyEl.setText(this.thoughtText);
    this.scrollToBottom();
  }

  private renderToolCall(tc: ToolCallInfo): void {
    if (!tc.toolCallId || this.toolBlocks.has(tc.toolCallId)) {
      if (tc.toolCallId) this.updateToolCall(tc);
      return;
    }
    if (this.streamEl) this.streamEl.dataset.sealed = "1";
    const d = this.messagesEl.createEl("details", {
      cls: "kimidian-tool",
    });
    const summary = d.createEl("summary", { cls: "kimidian-tool-summary" });
    const icon = summary.createSpan({ cls: "kimidian-tool-icon" });
    setIcon(icon, "wrench");
    const title = summary.createSpan({ cls: "kimidian-tool-title" });
    title.setText(tc.title ?? tc.kind ?? "工具调用");
    const status = summary.createSpan({ cls: "kimidian-tool-status" });
    const body = d.createDiv({ cls: "kimidian-tool-body" });
    const block: ToolBlock = { el: d, titleEl: title, statusEl: status, bodyEl: body };
    this.toolBlocks.set(tc.toolCallId, block);
    // 数据层：同一 toolCallId 的条目随 update 增量合并
    const entry: MsgEntry & { kind: "tool" } = {
      kind: "tool",
      tool: { ...tc },
    };
    this.toolEntries.set(tc.toolCallId, entry);
    this.logPush(entry);
    this.updateToolCall(tc);
    this.scrollToBottom();
  }

  private updateToolCall(tc: Partial<ToolCallInfo> & { toolCallId: string }): void {
    // 数据层合并（undefined 字段不覆盖旧值）
    const entry = this.toolEntries.get(tc.toolCallId);
    if (entry) {
      for (const [k, v] of Object.entries(tc)) {
        if (v !== undefined) {
          (entry.tool as unknown as Record<string, unknown>)[k] = v;
        }
      }
    }
    const b = this.toolBlocks.get(tc.toolCallId);
    if (!b) {
      // 没有先收到 tool_call 就直接收到 update（回放时可能发生）
      this.renderToolCall(tc as ToolCallInfo);
      return;
    }
    if (tc.title) b.titleEl.setText(tc.title);
    const st = tc.status ?? "in_progress";
    const label =
      st === "completed" ? "完成" : st === "failed" ? "失败" : st === "pending" ? "等待" : "执行中";
    b.statusEl.setText(label);
    b.statusEl.dataset.status = st;
    // 目标文件路径
    const paths = (tc.locations ?? []).map((l) => l.path).filter(Boolean);
    if (paths.length > 0) {
      const p = b.bodyEl.createDiv({ cls: "kimidian-tool-path" });
      p.setText(paths.join("\n"));
    }
    // 文本内容（diff / 结果摘要）
    for (const c of tc.content ?? []) {
      if (c.type === "content" && c.text) {
        b.bodyEl.createEl("pre", {
          cls: "kimidian-tool-output",
          text: c.text.slice(0, 4000),
        });
      } else if (c.type === "diff" && c.path) {
        b.bodyEl.createEl("pre", {
          cls: "kimidian-tool-diff",
          text: `--- ${c.path}\n${(c.newText ?? "").slice(0, 3000)}`,
        });
      }
    }
    this.scrollToBottom();
  }

  // ================= 权限模式（盾牌按钮 + 菜单） =================

  private get permissionMode(): PermissionMode {
    return this.plugin.settings.permissionMode;
  }

  /** 刷新盾牌按钮：模式文案、橙色高亮（非默认）、pending 角标 */
  private updateShield(): void {
    if (!this.shieldBtn) return;
    const mode = this.permissionMode;
    this.shieldLabel.setText(PERMISSION_MODE_LABELS[mode]);
    this.shieldBtn.classList.toggle("is-active", mode !== "ask");
    this.shieldBtn.classList.toggle("has-pending", this.pendingPermissions > 0);
    if (this.pendingPermissions > 0) {
      this.shieldBadge.setText(String(this.pendingPermissions));
      this.shieldBadge.style.display = "";
    } else {
      this.shieldBadge.style.display = "none";
    }
  }

  /** 弹出权限模式菜单 */
  private showPermissionMenu(e: MouseEvent): void {
    const menu = new Menu();
    const modes: PermissionMode[] = ["ask", "smart", "yolo"];
    const descs: Record<PermissionMode, string> = {
      ask: "每个工具调用都需手动批准",
      smart: "只读工具自动允许，写/删/执行仍询问",
      yolo: "不再询问（有风险）",
    };
    for (const m of modes) {
      menu.addItem((item) =>
        item
          .setTitle(PERMISSION_MODE_LABELS[m])
          .setIcon(m === "yolo" ? "zap" : m === "smart" ? "shield-check" : "shield")
          .setChecked(this.permissionMode === m)
          .onClick(() => void this.setPermissionMode(m))
      );
      menu.addItem((item) => {
        item.setTitle(`    ${descs[m]}`).setDisabled(true);
      });
    }
    menu.showAtMouseEvent(e);
  }

  /** 切换权限模式：持久化 + 刷新按钮 + 同步 CLI 原生 mode（双保险） */
  private async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.plugin.settings.permissionMode = mode;
    await this.plugin.saveSettings();
    this.updateShield();
    this.syncCliMode();
    new Notice(`权限模式已切换：${PERMISSION_MODE_LABELS[mode]}`);
  }

  /** 把当前模式同步给 kimi CLI（configOptions 里有 mode：default/plan/auto/yolo） */
  private syncCliMode(): void {
    if (!this.sessionId || !this.client.ready) return;
    this.client
      .setConfigOption(this.sessionId, "mode", cliModeFor(this.permissionMode))
      .catch((e) => console.warn("[kimidian] 同步 CLI mode 失败（忽略）", e));
  }

  // ================= 权限请求 =================

  async handlePermissionRequest(
    params: RequestPermissionParams
  ): Promise<RequestPermissionOutcome> {
    const mode = this.permissionMode;
    const granted = new Set(this.plugin.settings.grantedAlwaysTools);
    const key = toolKeyOf(params.toolCall ?? {});
    const decision = decidePermission(mode, params.toolCall ?? {}, granted);

    if (decision === "auto-allow") {
      // 自动放行：优先 allow_once（agent 只批本次；客户端每次自动应答，
      // 记忆逻辑由我们按工具 key 保证，不依赖 agent 的 session 记忆）
      const opt =
        params.options.find((o) => o.kind === "allow_once") ??
        KimiAcpClient.pickAllowOption(params.options);
      if (opt) {
        const reason =
          mode === "yolo"
            ? "全部允许"
            : granted.has(key)
              ? "已记住的始终允许"
              : "智能放行（只读）";
        this.renderSystemMsg(`🛡 已自动允许：${params.toolCall?.title ?? key}（${reason}）`);
        return { outcome: "selected", optionId: opt.optionId };
      }
      return { outcome: "cancelled" };
    }

    // 逐个询问：内联按钮 + pending 角标
    this.pendingPermissions++;
    this.updateShield();
    return new Promise<RequestPermissionOutcome>((resolve) => {
      const done = (o: RequestPermissionOutcome) => {
        this.pendingPermissions = Math.max(0, this.pendingPermissions - 1);
        this.updateShield();
        this.pendingPermissionResolve = null;
        resolve(o);
      };
      this.pendingPermissionResolve = done;
      const box = this.messagesEl.createDiv({ cls: "kimidian-permission" });
      const title = params.toolCall?.title ?? "工具调用";
      const paths = (params.toolCall?.locations ?? [])
        .map((l) => l.path)
        .filter(Boolean)
        .join("\n");
      box.createDiv({
        cls: "kimidian-permission-title",
        text: `Kimi 请求执行：${title}`,
      });
      if (paths) box.createEl("pre", { cls: "kimidian-permission-path", text: paths });
      const btnRow = box.createDiv({ cls: "kimidian-permission-btns" });
      const labelFor = (kind: string): string =>
        kind === "allow_always"
          ? "始终允许"
          : kind === "allow_once"
            ? "允许一次"
            : kind === "reject_always"
              ? "始终拒绝"
              : "拒绝";
      for (const opt of params.options) {
        const b = btnRow.createEl("button", {
          text: `${opt.name || labelFor(opt.kind)}`,
          cls:
            opt.kind.startsWith("allow")
              ? "kimidian-perm-allow"
              : "kimidian-perm-reject",
        });
        b.onclick = () => {
          box.remove();
          // 「始终允许」：按稳定工具 key 记忆（持久化到 settings，跨会话保留）
          if (opt.kind === "allow_always" && !granted.has(key)) {
            this.plugin.settings.grantedAlwaysTools.push(key);
            void this.plugin.saveSettings();
            new Notice(`已记住「始终允许」：${key}`);
          }
          done({ outcome: "selected", optionId: opt.optionId });
        };
      }
      this.scrollToBottom();
    });
  }

  private resolvePendingPermission(o: RequestPermissionOutcome): void {
    const r = this.pendingPermissionResolve;
    this.pendingPermissionResolve = null;
    if (r) r(o);
  }

  // ================= 历史 =================

  /** 界面状态记忆：历史面板开合写入 data.json，重开视图时如实恢复 */
  private persistUiState(historyOpen: boolean): void {
    const st = this.plugin.settings;
    if (!st.uiState) st.uiState = { historyOpen };
    else st.uiState.historyOpen = historyOpen;
    void this.plugin.saveSettings();
  }

  private async toggleHistory(): Promise<void> {
    if (this.historyPanelEl) {
      this.historyPanelEl.remove();
      this.historyPanelEl = null;
      this.persistUiState(false);
      return;
    }
    if (!(await this.ensureConnected())) return;
    this.persistUiState(true);
    const panel = this.contentEl.createDiv({ cls: "kimidian-history" });
    this.historyPanelEl = panel;
    panel.createDiv({ cls: "kimidian-history-loading", text: "加载会话列表…" });
    const base = this.vaultBasePath();
    try {
      const sessions = base ? await this.client.sessionList(base) : [];
      panel.empty();
      if (sessions.length === 0) {
        panel.createDiv({
          cls: "kimidian-history-empty",
          text: "当前 vault 暂无历史会话。",
        });
        return;
      }
      sessions.sort((a, b) =>
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
      );
      const diagId = this.plugin.settings.diagSessionId;
      const visible = this.plugin.settings.hideDiagSession
        ? sessions.filter((s) => s.sessionId !== diagId)
        : sessions;
      if (visible.length === 0) {
        panel.createDiv({
          cls: "kimidian-history-empty",
          text: "当前 vault 暂无历史会话（诊断会话已隐藏）。",
        });
        return;
      }
      for (const s of visible.slice(0, 50)) {
        const item = panel.createDiv({ cls: "kimidian-history-item" });
        const meta = this.plugin.settings.sessionMeta[s.sessionId];
        const isDiag = !!diagId && s.sessionId === diagId;
        const title = isDiag
          ? "🔧 自我诊断"
          : (s.title ?? meta?.title ?? "（无标题会话）");
        item.createDiv({ cls: "kimidian-history-title", text: title });
        const time = s.updatedAt
          ? new Date(s.updatedAt).toLocaleString()
          : meta
            ? new Date(meta.updatedAt).toLocaleString()
            : "";
        // 所属 vault（session/list 返回 cwd）：取末级目录名帮助辨认
        const cwdShort = s.cwd
          ? (s.cwd.replace(/\\/g, "/").split("/").pop() ?? "")
          : "";
        item.createDiv({
          cls: "kimidian-history-time",
          text: cwdShort ? `${time} · ${cwdShort}` : time,
        });
        item.onclick = () => void this.loadSession(s);
      }
    } catch (e) {
      panel.empty();
      if (e instanceof AuthRequiredError) {
        panel.createDiv({ text: "未登录，请先在终端运行 kimi login。" });
      } else {
        panel.createDiv({ text: `加载失败：${(e as Error).message}` });
      }
    }
  }

  private async loadSession(s: SessionInfo): Promise<void> {
    if (this.historyPanelEl) {
      this.historyPanelEl.remove();
      this.historyPanelEl = null;
      this.persistUiState(false);
    }
    const base = this.vaultBasePath();
    if (!base) return;
    try {
      this.msgLog = [];
      this.messagesEl.empty();
      this.beginAssistantTurn();
      this.sessionId = s.sessionId;
      this.wirePath = null;
      this.replaying = true;
      // 历史回放通过 session/update 推送（可能在响应返回前后到达），
      // 这里只放一条可移除的提示，绝不在响应后清空消息区。
      const loadingEl = this.messagesEl.createDiv({ cls: "kimidian-system" });
      loadingEl.setText("正在恢复会话…");
      const result = (await this.client.sessionLoad(s.sessionId, base)) as unknown as {
        configOptions?: SessionConfigOption[];
      };
      // 同 restoreSession：等静默窗口，迟到 chunk 不丢
      await this.waitForReplayQuiet();
      this.replaying = false;
      loadingEl.remove();
      // drain 期间用户已切走：不写状态
      if (this.sessionId !== s.sessionId) return;
      this.applyConfigOptions(result?.configOptions ?? null);
      // 历史恢复路径同样保持「手动选择 > 默认 K3」
      await this.applyModelPreference();
      this.plugin.lastSessionId = s.sessionId;
      // 回放消息的时间戳：用 wire.jsonl 落盘时间回填（否则全显示"现在"）
      await this.backfillReplayTimes();
      this.renderStatus();
      this.refreshUsage(0);
      this.scrollToBottom();
    } catch (e) {
      this.replaying = false;
      this.sessionId = null;
      this.handleSessionError(e);
    }
  }

  // ================= 输入与 @ 补全 =================

  private onInputKeydown(e: KeyboardEvent): void {
    if (this.suggestEl) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.moveSuggest(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this.pickSuggest();
        return;
      }
      if (e.key === "Escape") {
        this.closeSuggest();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void this.sendMessage();
    }
  }

  /** 当前光标前是否有 @token */
  private currentAtToken(): { start: number; query: string } | null {
    const pos = this.inputEl.selectionStart ?? 0;
    const before = this.inputEl.value.slice(0, pos);
    const m = /(?:^|[\s，。])@([^\s@]*)$/.exec(before);
    if (!m) return null;
    return { start: pos - m[1].length - 1, query: m[1] };
  }

  private updateSuggest(): void {
    const tok = this.currentAtToken();
    if (!tok) {
      this.closeSuggest();
      return;
    }
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => this.fuzzyMatch(f.path.toLowerCase(), tok.query.toLowerCase()))
      .slice(0, 12);
    if (files.length === 0) {
      this.closeSuggest();
      return;
    }
    this.closeSuggest();
    const box = this.contentEl.createDiv({ cls: "kimidian-suggest" });
    this.suggestEl = box;
    files.forEach((f, i) => {
      const item = box.createDiv({
        cls: "kimidian-suggest-item" + (i === 0 ? " is-active" : ""),
        text: f.path,
      });
      item.dataset.path = f.path;
      item.onmousedown = (e) => {
        e.preventDefault();
        this.acceptSuggestion(f);
      };
    });
  }

  private fuzzyMatch(text: string, query: string): boolean {
    if (!query) return true;
    let ti = 0;
    for (const ch of query) {
      ti = text.indexOf(ch, ti);
      if (ti < 0) return false;
      ti++;
    }
    return true;
  }

  private moveSuggest(delta: number): void {
    if (!this.suggestEl) return;
    const items = Array.from(
      this.suggestEl.querySelectorAll<HTMLElement>(".kimidian-suggest-item")
    );
    const cur = items.findIndex((el) => el.classList.contains("is-active"));
    const next = (cur + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle("is-active", i === next));
    items[next]?.scrollIntoView({ block: "nearest" });
  }

  private pickSuggest(): void {
    const active = this.suggestEl?.querySelector<HTMLElement>(
      ".kimidian-suggest-item.is-active"
    );
    const path = active?.dataset.path;
    if (!path) return;
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) this.acceptSuggestion(f);
  }

  private acceptSuggestion(f: TFile): void {
    const tok = this.currentAtToken();
    if (!tok) return;
    const pos = this.inputEl.selectionStart ?? 0;
    const before = this.inputEl.value.slice(0, tok.start + 1);
    const after = this.inputEl.value.slice(pos);
    const token = `@[[${f.path}]] `;
    this.inputEl.value = `${before}${token}${after}`;
    const newPos = (before + token).length;
    this.inputEl.selectionStart = this.inputEl.selectionEnd = newPos;
    if (!this.attachments.some((a) => a.path === f.path)) {
      this.attachments.push({ path: f.path });
      this.renderChips();
    }
    this.closeSuggest();
    this.inputEl.focus();
  }

  private closeSuggest(): void {
    this.suggestEl?.remove();
    this.suggestEl = null;
  }

  private renderChips(): void {
    this.chipsEl.empty();
    for (const a of this.attachments) {
      const chip = this.chipsEl.createSpan({ cls: "kimidian-chip" });
      chip.createSpan({ text: a.path });
      const x = chip.createSpan({ cls: "kimidian-chip-x", text: "×" });
      x.onclick = () => {
        this.attachments = this.attachments.filter((t) => t !== a);
        this.renderChips();
      };
    }
    // 粘贴/拖拽的待发送附件卡片
    for (const p of this.pending) {
      const card = this.chipsEl.createSpan({
        cls: `kimidian-chip kimidian-attach-card kimidian-attach-${p.kind}`,
      });
      if (p.kind === "image") {
        card.createEl("img", {
          cls: "kimidian-attach-thumb",
          attr: { src: `data:${p.mimeType};base64,${p.dataBase64}`, alt: p.name },
        });
      } else {
        card.createSpan({
          cls: "kimidian-attach-icon",
          text: p.kind === "text" ? "📄" : "📎",
        });
      }
      const label =
        p.kind === "binary"
          ? `${p.name}（已存入仓库）`
          : p.kind === "image"
            ? `${p.name} ${formatSize(p.sizeBytes)}`
            : p.name;
      card.createSpan({ cls: "kimidian-attach-name", text: label });
      const x = card.createSpan({ cls: "kimidian-chip-x", text: "×" });
      x.onclick = () => {
        this.pending = this.pending.filter((t) => t !== p);
        this.renderChips();
      };
    }
  }

  // ================= 粘贴 / 拖拽附件 =================

  /** 粘贴：图片进待发送附件；剪贴板有文本时保留正常文本粘贴（图片优先但不冲突） */
  private async onPaste(e: ClipboardEvent): Promise<void> {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    let tookImage = false;
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const f = item.getAsFile();
      if (!f) continue;
      const mime = item.type;
      const bytes = new Uint8Array(await f.arrayBuffer());
      this.addImageBytes(f.name || `pasted-${Date.now()}.png`, mime, bytes);
      tookImage = true;
    }
    if (tookImage) {
      const hasText = ((e.clipboardData?.getData("text") as string | undefined) ?? "").trim().length > 0;
      // 纯图片粘贴：阻止默认，避免文件名/占位文本进输入框
      if (!hasText) e.preventDefault();
    }
  }

  /** 拖拽落下：外部文件走 File 对象；vault 内部拖拽（text 里的 [[路径]]）走 vault 路径 */
  private async onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    this.inputWrapEl.classList.remove("is-dragover");
    const dt = e.dataTransfer;
    if (!dt) return;
    if (dt.files && dt.files.length > 0) {
      for (const f of Array.from(dt.files)) await this.addDroppedFile(f);
      return;
    }
    const m = (dt.getData("text") ?? "").match(/\[\[([^\]]+)\]\]/);
    if (m) await this.addVaultFile(m[1]);
  }

  /** 外部文件（操作系统拖入）：按扩展名分类处理 */
  private async addDroppedFile(f: File): Promise<void> {
    const kind = classifyFile(f.name);
    if (kind === "image") {
      const bytes = new Uint8Array(await f.arrayBuffer());
      this.addImageBytes(f.name, imageMimeFor(f.name) ?? f.type ?? "image/png", bytes);
    } else if (kind === "text") {
      this.pending.push({ kind: "text", name: f.name, content: await f.text() });
      this.renderChips();
    } else {
      // 二进制：复制进仓库 attachments/kimidian/，prompt 里给路径引用
      const bytes = new Uint8Array(await f.arrayBuffer());
      const vaultPath = `${BINARY_STORE_DIR}/${f.name}`;
      try {
        await this.ensureStoreDir();
        await this.app.vault.adapter.writeBinary(vaultPath, bytes.buffer as ArrayBuffer);
        this.pending.push({ kind: "binary", name: f.name, vaultPath });
        this.renderChips();
      } catch (e) {
        new Notice(`存入附件失败：${(e as Error).message}`);
      }
    }
  }

  /** vault 内部文件（文件列表拖入）：图片读字节，文本读内容，二进制直接引用原路径 */
  private async addVaultFile(path: string): Promise<void> {
    const name = path.split("/").pop() ?? path;
    const kind = classifyFile(name);
    try {
      if (kind === "image") {
        const buf = await this.app.vault.adapter.readBinary(path);
        this.addImageBytes(name, imageMimeFor(name) ?? "image/png", new Uint8Array(buf));
      } else if (kind === "text") {
        this.pending.push({ kind: "text", name: path, content: await this.app.vault.adapter.read(path) });
        this.renderChips();
      } else {
        this.pending.push({ kind: "binary", name, vaultPath: path });
        this.renderChips();
      }
    } catch (e) {
      new Notice(`读取拖入文件失败：${(e as Error).message}`);
    }
  }

  /** 图片字节 → 待发送附件（超 10MB 提示并拒绝） */
  private addImageBytes(name: string, mimeType: string, bytes: Uint8Array): void {
    if (bytes.length > MAX_IMAGE_BYTES) {
      new Notice(`图片 ${name} 超过 10MB（${formatSize(bytes.length)}），已拒绝`);
      return;
    }
    this.pending.push({
      kind: "image",
      name,
      mimeType,
      dataBase64: bytesToBase64(bytes),
      sizeBytes: bytes.length,
    });
    this.renderChips();
  }

  /** 确保二进制附件目录存在（逐级 mkdir，已存在则忽略） */
  private async ensureStoreDir(): Promise<void> {
    const adapter = this.app.vault.adapter;
    const parts = BINARY_STORE_DIR.split("/");
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      try {
        if (!(await adapter.exists(cur))) await adapter.mkdir(cur);
      } catch {
        /* 目录已存在或并发创建，忽略 */
      }
    }
  }

  /** 外部命令调用：把选中文本塞进输入框 */
  insertExternalText(text: string): void {
    const cur = this.inputEl.value;
    this.inputEl.value = cur ? `${cur}\n${text}` : text;
    this.inputEl.focus();
  }

  // ================= 消息日志（数据层） =================

  /** 追加消息条目（带上限）；DOM 渲染由各 render* 函数负责，日志只是状态 */
  private logPush(entry: MsgEntry): void {
    this.msgLog.push(entry);
    if (this.msgLog.length > MSG_LOG_MAX) {
      this.msgLog.splice(0, this.msgLog.length - MSG_LOG_MAX);
    }
  }

  /**
   * 从消息日志重建 DOM（视图重挂载 / 面板切换后）。
   * 只渲染 DOM，不再回写日志（条目已在数组里）。
   */
  private restoreMsgLog(): void {
    this.messagesEl.empty();
    this.streamEl = null;
    this.streamText = "";
    this.thoughtEl = null;
    this.thoughtBodyEl = null;
    this.thoughtText = "";
    this.toolBlocks.clear();
    for (const entry of this.msgLog) {
      switch (entry.kind) {
        case "user": {
          const wrap = this.messagesEl.createDiv({ cls: "kimidian-msg kimidian-msg-user" });
          if (entry.text) {
            wrap.createDiv({ cls: "kimidian-msg-body", text: entry.text });
            this.addCopyBtn(wrap, () => entry.text);
          }
          this.renderRefChips(wrap, entry.refs ?? []);
          this.renderMsgTs(wrap, entry);
          break;
        }
        case "assistant": {
          const wrap = this.messagesEl.createDiv({ cls: "kimidian-msg kimidian-msg-assistant" });
          const body = wrap.createDiv({ cls: "kimidian-msg-body" });
          this.addCopyBtn(wrap, () => entry.text);
          this.renderMsgTs(wrap, entry);
          void MarkdownRenderer.render(this.app, entry.text, body, "", this);
          break;
        }
        case "thought": {
          const d = this.messagesEl.createEl("details", { cls: "kimidian-thought" });
          d.createEl("summary", { text: "思考过程" });
          const body = d.createDiv({ cls: "kimidian-thought-body" });
          body.setText(entry.text);
          break;
        }
        case "tool": {
          this.domRestoreTool(entry.tool);
          break;
        }
        case "system": {
          const el = this.messagesEl.createDiv({ cls: "kimidian-system" });
          el.setText(entry.text);
          break;
        }
        case "error": {
          const el = this.messagesEl.createDiv({ cls: "kimidian-error" });
          el.createDiv({ cls: "kimidian-error-title", text: entry.text });
          break;
        }
      }
    }
    this.scrollToBottom();
  }

  /** 从数据层工具条目重建工具块（含最终状态），并回填 toolBlocks 供后续 update */
  private domRestoreTool(tool: ToolCallInfo): void {
    if (!tool.toolCallId) return;
    const d = this.messagesEl.createEl("details", { cls: "kimidian-tool" });
    const summary = d.createEl("summary", { cls: "kimidian-tool-summary" });
    const icon = summary.createSpan({ cls: "kimidian-tool-icon" });
    setIcon(icon, "wrench");
    const title = summary.createSpan({ cls: "kimidian-tool-title" });
    const status = summary.createSpan({ cls: "kimidian-tool-status" });
    const body = d.createDiv({ cls: "kimidian-tool-body" });
    this.toolBlocks.set(tool.toolCallId, { el: d, titleEl: title, statusEl: status, bodyEl: body });
    // 复用 update 视觉逻辑渲染最终状态（title/status/路径/内容）
    this.updateToolCall(tool);
  }

  // ================= 渲染辅助 =================

  private renderWelcome(): void {
    const w = this.messagesEl.createDiv({ cls: "kimidian-welcome" });
    w.createEl("div", {
      cls: "kimidian-welcome-title",
      text: "Kimi 已就绪",
    });
    w.createEl("div", {
      cls: "kimidian-welcome-sub",
      text: "在下方输入问题，Kimi 可以读取、搜索和修改你的笔记。输入 @ 可以引用笔记。",
    });
  }

  /** 气泡右上角复制按钮：hover 浮现，复制该消息的原始 Markdown 文本 */
  private addCopyBtn(wrap: HTMLElement, getText: () => string | null): void {
    const btn = wrap.createSpan({ cls: "kimidian-copy-btn" });
    setIcon(btn, "copy");
    btn.title = "复制原文（Markdown）";
    btn.onclick = () => {
      const t = getText();
      if (!t) {
        new Notice("没有可复制的内容");
        return;
      }
      void writeClipboardText(t)
        .then(() => {
          btn.empty();
          setIcon(btn, "check");
          window.setTimeout(() => {
            btn.empty();
            setIcon(btn, "copy");
          }, 1200);
        })
        .catch((e) => new Notice(`复制失败：${(e as Error).message}`));
    };
  }

  /** 气泡右下角的小号时间戳；估算时间（恢复时的时间）淡化显示 */
  private renderMsgTs(
    wrap: HTMLElement,
    entry: { ts?: number; tsEst?: boolean }
  ): void {
    if (!entry.ts) return;
    const el = wrap.createSpan({
      cls: "kimidian-msg-ts" + (entry.tsEst ? " kimidian-msg-ts-est" : ""),
    });
    el.setText(formatMsgTime(entry.ts));
    if (entry.tsEst) el.title = "恢复时的时间（原始时间未知）";
  }

  private renderUserMsg(raw: string): void {
    // 显示层过滤：剥 <system-reminder> 等内部注入，折叠 <file>/<active-note>/[附件] 引用块
    const disp = formatUserDisplay(raw);
    // 纯内部注入消息（剥离后无正文无引用）：整个气泡不显示
    if (!disp.text && disp.refs.length === 0) return;
    // ts = 发送时间；回放时先标估算，drain 后用 wire 日志回填真实落盘时间
    const entry: MsgEntry & { kind: "user" } = {
      kind: "user",
      text: disp.text,
      refs: disp.refs,
      ts: Date.now(),
      tsEst: this.replaying ? true : undefined,
    };
    this.logPush(entry);
    const wrap = this.messagesEl.createDiv({ cls: "kimidian-msg kimidian-msg-user" });
    if (disp.text) {
      wrap.createDiv({ cls: "kimidian-msg-body", text: disp.text });
      this.addCopyBtn(wrap, () => disp.text);
    }
    this.renderRefChips(wrap, disp.refs);
    this.renderMsgTs(wrap, entry);
    this.scrollToBottom();
  }

  /** 上下文引用的小标签（显示层折叠，tooltip 给完整路径） */
  private renderRefChips(wrap: HTMLElement, refs: DisplayRef[]): void {
    if (refs.length === 0) return;
    const row = wrap.createDiv({ cls: "kimidian-ref-chips" });
    for (const r of refs) {
      const prefix =
        r.kind === "note" ? "📎 当前笔记：" : r.kind === "file" ? "📄 引用：" : "📎 附件：";
      const chip = row.createSpan({ cls: "kimidian-ref-chip" });
      chip.setText(`${prefix}${r.label}`);
      chip.title = r.path;
    }
  }

  private renderSystemMsg(text: string): void {
    this.logPush({ kind: "system", text });
    const el = this.messagesEl.createDiv({ cls: "kimidian-system" });
    el.setText(text);
    this.scrollToBottom();
  }

  /**
   * 富错误条：展示 JSON-RPC 错误码 / message / data / 最近 stderr，
   * 避免"Internal error"四个字的死胡同。提供「重试」和「重连后重试」。
   */
  private renderErrorWithRetry(e: unknown): void {
    const err = e as Error & { code?: number; data?: unknown };
    const message = err?.message ?? String(e);
    this.logPush({ kind: "error", text: `出错了：${message}` });
    const box = this.messagesEl.createDiv({ cls: "kimidian-error" });
    box.createDiv({ cls: "kimidian-error-title", text: `出错了：${message}` });

    // Git Bash 缺失（Windows 常见根因）：给出可操作提示 + 探测过的路径
    const dataStr = (() => {
      try {
        return JSON.stringify(err?.data ?? "");
      } catch {
        return String(err?.data ?? "");
      }
    })();
    if (/git ?bash/i.test(message) || /git ?bash/i.test(dataStr)) {
      const hint = box.createDiv({ cls: "kimidian-bash-hint" });
      hint.createDiv({
        text: "💡 未找到 Git Bash——Kimi CLI 在 Windows 上运行需要它。插件会自动探测 Git for Windows 与 kimi-desktop 捆绑的 Git Bash 并注入；如果仍失败，请在插件设置的「Git Bash 路径」中手动指定 bash.exe。",
      });
      const probe = this.client.getBashProbe();
      if (probe && probe.candidates.length > 0) {
        const d = hint.createEl("details", { cls: "kimidian-error-details" });
        d.createEl("summary", { text: "探测过的路径" });
        const pre = d.createEl("pre");
        pre.setText(
          probe.candidates
            .map((c) => `${c.exists ? "✅" : "❌"} ${c.path}（${c.source}）`)
            .join("\n") +
            `\n最终注入：${probe.found ?? "<无>"}${probe.fromEnv ? "（来自用户环境变量）" : ""}`
        );
      }
    }
    if (err?.code !== undefined) {
      box.createDiv({
        cls: "kimidian-error-code",
        text: `JSON-RPC 错误码：${err.code}`,
      });
    }
    if (err?.data !== undefined && err.data !== null) {
      const d = box.createEl("details", { cls: "kimidian-error-details" });
      d.createEl("summary", { text: "错误详情（error.data）" });
      d.createEl("pre", {
        text: (() => {
          try {
            return JSON.stringify(err.data, null, 2);
          } catch {
            return String(err.data);
          }
        })(),
      });
    }
    const stderrTail = this.client.getStderrTail(15);
    if (stderrTail) {
      const d = box.createEl("details", { cls: "kimidian-error-details" });
      d.createEl("summary", { text: "Kimi CLI 日志（stderr 最近 15 行）" });
      d.createEl("pre", { text: stderrTail });
    }
    const btnRow = box.createDiv({ cls: "kimidian-error-btns" });
    const retryBtn = btnRow.createEl("button", { text: "重试" });
    retryBtn.onclick = () => {
      box.remove();
      if (this.lastUserText) {
        this.inputEl.value = this.lastUserText;
        void this.sendMessage();
      }
    };
    const reconnectBtn = btnRow.createEl("button", { text: "重连后重试" });
    reconnectBtn.title = "杀掉并重启 kimi acp 子进程（可解决登录后旧进程状态过期等问题）";
    reconnectBtn.onclick = () => {
      box.remove();
      void (async () => {
        await this.reconnect();
        if (this.lastUserText) {
          this.inputEl.value = this.lastUserText;
          void this.sendMessage();
        }
      })();
    };
    this.scrollToBottom();
  }

  private handleSessionError(e: unknown): void {
    this.renderStatus();
    if (e instanceof AuthRequiredError) {
      const box = this.messagesEl.createDiv({ cls: "kimidian-error" });
      box.createDiv({
        text: "尚未登录 Kimi。请在终端中运行 `kimi login` 完成登录，然后点击下方按钮重试。",
      });
      const btn = box.createEl("button", { text: "我已登录，重试" });
      btn.onclick = () => {
        box.remove();
        void this.reconnect().then(() => void this.newSession());
      };
    } else {
      this.renderErrorWithRetry(e);
    }
  }

  /** 供插件在连接状态变化时刷新状态栏 */
  refreshStatus(): void {
    this.renderStatus();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.sendBtn.setText(busy ? "停止" : "发送");
    this.sendBtn.classList.toggle("is-stop", busy);
    this.renderStatus();
  }

  private renderStatus(): void {
    if (!this.statusModelEl) return;
    // 会话引导态：创建中显示「加载中…」，失败显示可点击的「重试」（不吞成静态文本）
    if (!this.sessionId && this.sessionBoot === "creating") {
      this.statusModelEl.empty();
      this.statusModelEl.setText("模型：加载中…");
    } else if (!this.sessionId && this.sessionBoot === "failed") {
      this.statusModelEl.empty();
      this.statusModelEl.createSpan({
        cls: "kimidian-status-label",
        text: `模型：${this.sessionBootError ?? "创建失败"}`,
      });
      const retry = this.statusModelEl.createEl("a", {
        cls: "kimidian-status-retry",
        text: "重试",
      });
      retry.title = "重新创建会话";
      retry.onclick = () => void this.bootstrap();
    } else {
      // 模型下拉（占位文本显示当前将生效的模型名：手动选择 > 默认模型）
      const wantId = this.plugin.settings.model || this.plugin.settings.defaultModel;
      const wantName =
        this.plugin.settings.lastModelOptions.find((o) => o.value === wantId)
          ?.name ?? "默认模型";
      this.renderConfigSelect(
        this.statusModelEl,
        this.modelOptions,
        "model",
        "模型",
        wantName
      );
    }
    // 思考强度下拉：只有当前模型暴露多档（如 k3 的 low/high/max）才可用
    this.renderConfigSelect(
      this.statusEffortEl,
      this.effortOptions,
      this.effortOptions?.id ?? "thinking",
      "思考",
      null
    );
    // 连接状态
    const stateText: Record<string, string> = {
      disconnected: "未连接",
      starting: "连接中…",
      connected: this.busy ? "已连接 · 生成中" : "已连接",
      auth_required: "未登录",
      error: "连接错误",
    };
    this.statusConnEl.setText(stateText[this.client.state] ?? this.client.state);
    this.statusConnEl.dataset.state = this.client.state;
  }

  // ================= 上下文用量指示 =================

  /**
   * 刷新上下文用量。
   * ACP 协议不推送 token 用量（已实测确认），数据来自 CLI 会话日志
   * wire.jsonl 每轮结束后落盘的 usage.record / llm.request 记录。
   * delayMs 用于轮次结束后稍等 CLI 落盘再读。
   */
  private refreshUsage(delayMs: number): void {
    if (this.usageTimer !== null) window.clearTimeout(this.usageTimer);
    this.usageTimer = window.setTimeout(() => {
      this.usageTimer = null;
      void this.loadUsage();
    }, delayMs);
  }

  /** CLI 会话日志根目录：优先从 cliPath 推导（…/.kimi-code/bin/kimi.exe → …/.kimi-code/sessions） */
  private sessionsRoot(): string {
    const cli = this.plugin.settings.cliPath;
    if (cli) {
      const cand = path.join(path.dirname(path.dirname(cli)), "sessions");
      return cand;
    }
    return path.join(os.homedir(), ".kimi-code", "sessions");
  }

  /** 按 sessionId 在 sessions 根下定位 wire.jsonl（目录名含工作区哈希，只能扫描匹配） */
  private async locateWirePath(sessionId: string): Promise<string | null> {
    if (this.wirePath) return this.wirePath;
    try {
      const root = this.sessionsRoot();
      for (const wd of await fsp.readdir(root)) {
        const p = path.join(root, wd, sessionId, "agents", "main", "wire.jsonl");
        try {
          await fsp.access(p);
          this.wirePath = p;
          return p;
        } catch {
          /* 不在此目录，继续 */
        }
      }
    } catch {
      /* sessions 根不存在等 */
    }
    return null;
  }

  /**
   * 回放时间回填：session/load 恢复的消息在渲染时只有"恢复当时"的估算时间，
   * 这里从 wire.jsonl 读取每轮消息的落盘时间按序对位回填，有改动则重渲染。
   * wire 读不到/对不上位的条目保留估算标记（淡化显示）。
   */
  private async backfillReplayTimes(): Promise<void> {
    if (!this.sessionId) return;
    const p = await this.locateWirePath(this.sessionId);
    if (!p) return;
    try {
      const raw = await fsp.readFile(p, "utf8");
      const times = parseWireMsgTimes(raw);
      if (backfillEntryTimes(this.msgLog, times, Date.now())) {
        this.restoreMsgLog();
      }
    } catch {
      /* wire 日志不可读：保持估算时间 */
    }
  }

  private async loadUsage(): Promise<void> {
    if (!this.sessionId) {
      this.renderUsage(null);
      return;
    }
    const p = await this.locateWirePath(this.sessionId);
    if (!p) {
      this.renderUsage(null);
      return;
    }
    try {
      // 先读尾部 128KB 找精确 usage.record（用量记录总在末尾）
      const fh = await fsp.open(p, "r");
      let tailText: string;
      try {
        const { size } = await fh.stat();
        const len = Math.min(size, 128 * 1024);
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, Math.max(0, size - len));
        tailText = buf.toString("utf8");
      } finally {
        await fh.close();
      }
      const parsed = parseWireUsage(tailText);
      const exactUsage = computeContextUsage(parsed);
      if (exactUsage) {
        this.renderUsage(exactUsage);
        return;
      }
      // 无精确记录（首轮进行中 / 落盘延迟）：读全文按字符估算，UI 带「约」字。
      // 有 usage.record 的会话不会走到这里，故全文读取只发生在小文件上。
      const full = await fsp.readFile(p, "utf8");
      const chars = estimateWireChars(full);
      const fullParsed = parseWireUsage(full); // 全文里找 maxTokens/最后 llm.request 的模型
      this.renderUsage(
        computeEstimatedUsage({
          ...chars,
          maxTokens: parsed.maxTokens ?? fullParsed.maxTokens,
          model: fullParsed.usage?.model ?? null,
        })
      );
    } catch {
      this.renderUsage(null);
    }
  }

  /** 渲染用量：无数据时显示「Ctx —」；估算值带「约」字；50%/80% 两档变色提醒 */
  private renderUsage(u: ContextUsage | null): void {
    if (!this.statusUsageEl) return;
    const el = this.statusUsageEl;
    el.classList.remove("is-warn", "is-danger");
    if (!u) {
      el.setText(this.sessionId ? "Ctx —" : "");
      el.title = this.sessionId
        ? "上下文用量：本轮结束后统计（数据来源：CLI 会话日志）"
        : "";
      return;
    }
    el.setText(u.estimated ? `Ctx 约${u.pct}%` : `Ctx ${u.pct}%`);
    if (u.pct >= 80) el.classList.add("is-danger");
    else if (u.pct >= 50) el.classList.add("is-warn");
    el.title =
      `上下文已用 ${u.estimated ? "约 " : ""}${u.used.toLocaleString()} / ${u.total.toLocaleString()} tokens（${u.pct}%）` +
      `${u.exact ? "" : " · 窗口大小为内置估值"}` +
      `${u.estimated ? "\n估算方式：按会话内容字符启发式换算（中文 ÷2、英文 ÷4），精确用量落盘后自动替换" : ""}` +
      `\n模型：${u.model ?? "未知"}\n数据来源：CLI 会话日志（每轮结束后更新）`;
  }

  /** 渲染一个 ACP config option 下拉（模型 / 思考强度共用；状态机由 config-options 纯模块给出） */
  private renderConfigSelect(
    container: HTMLElement,
    option: SessionConfigOption | null,
    configId: string,
    label: string,
    fallbackText: string | null
  ): void {
    container.empty();
    const state = selectViewState({
      option,
      label,
      hasSession: !!this.sessionId,
      fallbackText,
    });
    if (state.kind === "hidden") return;
    if (state.kind === "placeholder" || state.kind === "single") {
      container.setText(state.text);
      return;
    }
    container.createSpan({ cls: "kimidian-status-label", text: `${label}：` });
    const sel = container.createEl("select", { cls: "kimidian-model-select" });
    for (const o of state.options) {
      const opt = sel.createEl("option", { text: o.label, value: o.value });
      if (o.value === state.current) opt.selected = true;
    }
    sel.onchange = () => {
      if (!this.sessionId) return;
      void this.client
        .setConfigOption(this.sessionId, configId, sel.value)
        .then((opts) => {
          this.applyConfigOptions(opts);
          // 模型：记住手动选择（跨会话沿用，直到设置页改默认模型）
          if (configId === "model" && this.plugin.settings.model !== sel.value) {
            this.plugin.settings.model = sel.value;
            void this.plugin.saveSettings();
          }
          new Notice(`${label}已切换：${sel.options[sel.selectedIndex]?.text ?? sel.value}`);
        })
        .catch((e) => {
          console.warn(`[kimidian] 切换${label}失败`, e);
          new Notice(`切换${label}失败：${(e as Error).message}`);
        });
    };
  }

  // ================= 滚动跟随 =================

  /** 用户滚动：更新跟随态；回到底部附近时恢复跟随即隐藏「新消息」按钮 */
  private onMessagesScroll(): void {
    const stuck = this.scrollFollow.onScroll(
      this.messagesEl.scrollTop,
      this.messagesEl.clientHeight,
      this.messagesEl.scrollHeight
    );
    if (stuck) this.hideNewMsgBtn();
  }

  /**
   * 条件滚动：只有用户停留在底部附近才 auto-scroll；
   * 用户上翻期间来新内容 → 显示「↓ 新消息」悬浮按钮。
   */
  private scrollToBottom(): void {
    if (this.scrollFollow.shouldAutoScroll()) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    } else {
      this.showNewMsgBtn();
    }
  }

  /** 强制滚到底部并恢复跟随（点按钮 / 用户自己发消息时） */
  private forceScrollToBottom(): void {
    this.scrollFollow.stick();
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    this.hideNewMsgBtn();
  }

  private showNewMsgBtn(): void {
    if (this.newMsgBtn) return;
    const btn = this.contentEl.createDiv({ cls: "kimidian-new-msg-btn" });
    btn.createSpan({ text: "↓ 新消息" });
    btn.onclick = () => this.forceScrollToBottom();
    this.newMsgBtn = btn;
  }

  private hideNewMsgBtn(): void {
    this.newMsgBtn?.remove();
    this.newMsgBtn = null;
  }

  private persistSessionMeta(): void {
    if (!this.sessionId) return;
    const base = this.vaultBasePath() ?? "";
    const meta = this.plugin.settings.sessionMeta;
    const title =
      meta[this.sessionId]?.title ??
      (this.lastUserText.length > 40
        ? this.lastUserText.slice(0, 40) + "…"
        : this.lastUserText) ??
      "会话";
    meta[this.sessionId] = {
      title,
      updatedAt: Date.now(),
      cwd: base,
    };
    // 截断：最多保留 200 条
    const keys = Object.keys(meta);
    if (keys.length > 200) {
      const sorted = keys.sort(
        (a, b) => (meta[a].updatedAt ?? 0) - (meta[b].updatedAt ?? 0)
      );
      for (const k of sorted.slice(0, keys.length - 200)) delete meta[k];
    }
    void this.plugin.saveSettings();
  }
}
