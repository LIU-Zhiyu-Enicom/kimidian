var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/mock-obsidian.cjs
var require_mock_obsidian = __commonJS({
  "scripts/mock-obsidian.cjs"(exports2, module2) {
    "use strict";
    var FakeClassList = class {
      constructor() {
        this._s = /* @__PURE__ */ new Set();
      }
      add(...cs) {
        cs.forEach((c) => this._s.add(c));
      }
      remove(...cs) {
        cs.forEach((c) => this._s.delete(c));
      }
      toggle(c, force) {
        const want = force === void 0 ? !this._s.has(c) : !!force;
        if (want) this._s.add(c);
        else this._s.delete(c);
        return want;
      }
      contains(c) {
        return this._s.has(c);
      }
    };
    var idSeq = 0;
    var FakeEl = class _FakeEl {
      constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.parentEl = null;
        this.classList = new FakeClassList();
        this.style = {};
        this.dataset = {};
        this.attrs = {};
        this.title = "";
        this._text = "";
        this._id = ++idSeq;
        this.onclick = null;
        this.onchange = null;
        this._listeners = {};
      }
      // Obsidian 扩展 API
      createDiv(o = {}) {
        return this.createEl("div", o);
      }
      createSpan(o = {}) {
        return this.createEl("span", o);
      }
      createEl(tag, o = {}) {
        const el = new _FakeEl(tag);
        if (o.cls) o.cls.split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
        if (o.text !== void 0) el.setText(o.text);
        if (o.attr) Object.assign(el.attrs, o.attr);
        if (o.value !== void 0) el.value = o.value;
        if (o.type !== void 0) el.attrs.type = o.type;
        this.appendChild(el);
        return el;
      }
      setText(t) {
        this._text = String(t ?? "");
        this.children = [];
      }
      empty() {
        this.children = [];
        this._text = "";
      }
      addClass(c) {
        this.classList.add(c);
      }
      remove() {
        if (this.parentEl) this.parentEl.children = this.parentEl.children.filter((c) => c !== this);
      }
      appendChild(c) {
        c.parentEl = this;
        this.children.push(c);
        return c;
      }
      addEventListener(t, f) {
        (this._listeners[t] ??= []).push(f);
      }
      removeEventListener(t, f) {
        this._listeners[t] = (this._listeners[t] ?? []).filter((g) => g !== f);
      }
      dispatch(t, ev = {}) {
        (this._listeners[t] ?? []).forEach((f) => f(ev));
      }
      // DOM 树包含判定（选区 anchorNode 归属检查用）
      contains(node) {
        for (const c of this.children) {
          if (c === node || c.contains(node)) return true;
        }
        return false;
      }
      // 布局矩形（测试可用 _rect 覆盖）
      getBoundingClientRect() {
        return this._rect ?? { left: 0, top: 0, right: 400, bottom: 600, width: 400, height: 600 };
      }
      // 断言辅助
      get textContent() {
        return this._text + this.children.map((c) => c.textContent).join("");
      }
      findAll(pred, out = []) {
        for (const c of this.children) {
          if (pred(c)) out.push(c);
          c.findAll(pred, out);
        }
        return out;
      }
      find(pred) {
        return this.findAll(pred)[0] ?? null;
      }
      // 标准 DOM 选择器：仅支持 ".class"（测试断言够用；querySelectorAll 返回数组即可，调用方会 Array.from）
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] ?? null;
      }
      querySelectorAll(sel) {
        const cls = String(sel).replace(/^\./, "");
        return this.findAll((e) => e.classList.contains(cls));
      }
      // select 语义
      get options() {
        return this.children.filter((c) => c.tagName === "OPTION");
      }
      get selectedIndex() {
        return this.options.findIndex((o) => o.selected);
      }
      // textarea/select 的值
      get value() {
        return this._value ?? "";
      }
      set value(v) {
        this._value = v;
      }
      focus() {
      }
      scrollTo() {
      }
      get scrollTop() {
        return 0;
      }
      get clientHeight() {
        return 500;
      }
      get scrollHeight() {
        return 500;
      }
      set scrollTop(v) {
      }
    };
    var FakeItemView = class {
      constructor(leaf) {
        this.leaf = leaf;
        this.app = leaf?.app;
        this.contentEl = new FakeEl("div");
      }
      getViewType() {
        return "mock";
      }
      getDisplayText() {
        return "mock";
      }
      getIcon() {
        return "mock";
      }
      registerEvent() {
      }
      register() {
      }
      async onOpen() {
      }
      async onClose() {
      }
    };
    var FakeNotice = class _FakeNotice {
      constructor(msg) {
        _FakeNotice.log.push(String(msg));
      }
    };
    FakeNotice.log = [];
    var FakeMenuItem = class {
      constructor() {
        this._title = "";
        this._checked = false;
        this._disabled = false;
        this._onClick = null;
      }
      setTitle(t) {
        this._title = t;
        return this;
      }
      setIcon() {
        return this;
      }
      setChecked(c) {
        this._checked = c;
        return this;
      }
      setDisabled(d) {
        this._disabled = d;
        return this;
      }
      onClick(f) {
        this._onClick = f;
        return this;
      }
    };
    var FakeMenu = class {
      constructor() {
        this.items = [];
      }
      addItem(f) {
        const it = new FakeMenuItem();
        f(it);
        this.items.push(it);
        return this;
      }
      showAtMouseEvent() {
      }
    };
    var FakeFileSystemAdapter = class {
      constructor(base) {
        this._base = base;
        this.__files = /* @__PURE__ */ new Map();
        this.__dirs = /* @__PURE__ */ new Set([""]);
      }
      getBasePath() {
        return this._base;
      }
      async read(path2) {
        const f = this.__files.get(path2);
        if (f && typeof f.text === "string") return f.text;
        throw new Error("ENOENT: " + path2);
      }
      async readBinary(path2) {
        const f = this.__files.get(path2);
        if (f && f.bin) return f.bin;
        throw new Error("ENOENT: " + path2);
      }
      async write(path2, text) {
        this.__files.set(path2, { text });
      }
      async writeBinary(path2, bin) {
        this.__files.set(path2, { bin });
      }
      async exists(path2) {
        return this.__files.has(path2) || this.__dirs.has(path2);
      }
      async mkdir(path2) {
        this.__dirs.add(path2);
      }
    };
    var FakeMarkdownRenderer = {
      render(app, md, el) {
        if (el && el.setText) el.setText(String(md ?? ""));
        return Promise.resolve();
      },
      renderMarkdown() {
        return Promise.resolve();
      }
    };
    if (typeof globalThis.window === "undefined") {
      globalThis.window = {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id)
      };
    }
    var __collapsedSel = () => ({
      isCollapsed: true,
      rangeCount: 0,
      anchorNode: null,
      toString: () => "",
      removeAllRanges() {
      }
    });
    globalThis.window.getSelection = () => globalThis.__mockSelection ?? __collapsedSel();
    globalThis.__collapsedSel = __collapsedSel;
    globalThis.window.confirm = (msg) => (globalThis.__mockConfirm ?? (() => true))(msg);
    if (typeof globalThis.document === "undefined") {
      const listeners = {};
      globalThis.document = {
        addEventListener(t, f) {
          (listeners[t] ??= []).push(f);
        },
        removeEventListener(t, f) {
          listeners[t] = (listeners[t] ?? []).filter((g) => g !== f);
        },
        dispatch(t, ev = {}) {
          (listeners[t] ?? []).forEach((f) => f(ev));
        }
      };
    }
    function setIcon2(el, id) {
      if (el) el.innerHTML = `<svg data-icon="${String(id)}" stroke="currentColor"></svg>`;
    }
    module2.exports = {
      App: class FakeApp {
      },
      FileSystemAdapter: FakeFileSystemAdapter,
      ItemView: FakeItemView,
      MarkdownRenderer: FakeMarkdownRenderer,
      Menu: FakeMenu,
      Notice: FakeNotice,
      // TFile/TFolder：bundle 内联的是另一份 mock 类，instanceof 会跨类失效，
      // 用 __mockTFile/__mockTFolder 标记 + Symbol.hasInstance 让两份类互相承认
      TFile: class FakeTFile {
        constructor() {
          this.__mockTFile = true;
        }
        static [Symbol.hasInstance](x) {
          return !!x && x.__mockTFile === true;
        }
      },
      TFolder: class FakeTFolder {
        constructor() {
          this.__mockTFolder = true;
        }
        static [Symbol.hasInstance](x) {
          return !!x && x.__mockTFolder === true;
        }
      },
      WorkspaceLeaf: class FakeWorkspaceLeaf {
      },
      setIcon: setIcon2,
      // 测试工具出口
      __fake: { FakeEl, FakeNotice, FakeMenu }
    };
  }
});

// src/chat-view.ts
var chat_view_exports = {};
__export(chat_view_exports, {
  KIMIDIAN_VIEW_TYPE: () => KIMIDIAN_VIEW_TYPE,
  KimidianView: () => KimidianView
});
module.exports = __toCommonJS(chat_view_exports);
var import_obsidian = __toESM(require_mock_obsidian());
var import_fs3 = require("fs");
var os = __toESM(require("os"));
var path = __toESM(require("path"));

// src/acp-client.ts
var import_child_process = require("child_process");
var import_fs2 = require("fs");
var import_path2 = require("path");

// src/shell-path.ts
var import_fs = require("fs");
var import_path = require("path");
function standardGitPaths() {
  const out = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe"
  ];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    out.push((0, import_path.join)(local, "Programs", "Git", "bin", "bash.exe"));
    out.push((0, import_path.join)(local, "Programs", "Git", "usr", "bin", "bash.exe"));
  }
  return out;
}
function kimiDesktopPaths() {
  const out = [];
  const appdata = process.env.APPDATA;
  if (appdata) {
    out.push(
      (0, import_path.join)(appdata, "kimi-desktop", "daimon-bundle", "runtime", "git", "bin", "bash.exe")
    );
    out.push(
      (0, import_path.join)(appdata, "kimi-desktop", "daimon-bundle", "runtime", "git", "usr", "bin", "bash.exe")
    );
  }
  return out;
}
function probeGitBash(manualPath) {
  const envVal = process.env.KIMI_SHELL_PATH;
  if (envVal) {
    return {
      found: envVal,
      source: "\u7528\u6237\u73AF\u5883\u53D8\u91CF KIMI_SHELL_PATH",
      fromEnv: true,
      candidates: [{ path: envVal, exists: (0, import_fs.existsSync)(envVal), source: "\u73AF\u5883\u53D8\u91CF" }]
    };
  }
  const candidates = [];
  const check = (path2, source) => {
    const exists = (0, import_fs.existsSync)(path2);
    candidates.push({ path: path2, exists, source });
    return exists;
  };
  if (manualPath && manualPath.trim()) {
    if (check(manualPath.trim(), "\u8BBE\u7F6E\u9875\u624B\u52A8\u914D\u7F6E")) {
      return { found: manualPath.trim(), source: "\u8BBE\u7F6E\u9875\u624B\u52A8\u914D\u7F6E", fromEnv: false, candidates };
    }
  }
  for (const p of standardGitPaths()) {
    if (check(p, "Git for Windows \u6807\u51C6\u8DEF\u5F84")) {
      return { found: p, source: "Git for Windows \u6807\u51C6\u8DEF\u5F84", fromEnv: false, candidates };
    }
  }
  for (const p of kimiDesktopPaths()) {
    if (check(p, "kimi-desktop \u6346\u7ED1")) {
      return { found: p, source: "kimi-desktop \u6346\u7ED1", fromEnv: false, candidates };
    }
  }
  return { found: null, source: null, fromEnv: false, candidates };
}

// src/acp-types.ts
var ACP_ERR_AUTH_REQUIRED = -32e3;

// src/acp-client.ts
var AuthRequiredError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthRequiredError";
  }
};
var KimiAcpClient = class {
  constructor(cliPath, extraArgs, events) {
    this.cliPath = cliPath;
    this.extraArgs = extraArgs;
    this.events = events;
    this.proc = null;
    this.nextId = 1;
    this.pending = /* @__PURE__ */ new Map();
    this.buffer = "";
    this.stopping = false;
    /** 子进程工作目录（vault 根目录），由视图在启动前设置 */
    this.cwd = null;
    /** 当前进程实际使用的 cwd（用于检测变化后重启） */
    this.startedCwd = null;
    /** 进程代次：stop/restart 时递增，使旧进程的 exit/error 事件失效 */
    this.generation = 0;
    /** 最近一次进程退出信息（错误展示用） */
    this.lastExitInfo = null;
    /** 自动重启限流：5 分钟窗口内最多 3 次 */
    this.autoRestartTimes = [];
    /** 设置页手动配置的 Git Bash 路径（空 = 自动探测） */
    this.bashPath = "";
    /** 最近一次 bash 探测结果（诊断/错误展示用） */
    this.lastBashProbe = null;
    /** 当前进程实际使用的 bash 注入值（变化时触发重启） */
    this.startedBash = null;
    /** stderr 环形缓冲，用于错误诊断展示 */
    this.stderrLines = [];
    this.state = "disconnected";
    this.agentCapabilities = null;
    this.authMethods = [];
    this.agentVersion = "";
  }
  /** 是否已握手且可用 */
  get ready() {
    return this.state === "connected" && !!this.proc;
  }
  /** 更新 CLI 路径 / 参数（设置变更时调用，之后需 restart） */
  updateCommand(cliPath, extraArgs) {
    this.cliPath = cliPath;
    this.extraArgs = extraArgs;
  }
  /** 设置子进程工作目录；若与当前进程不同需要 restart 才会生效 */
  setCwd(cwd) {
    this.cwd = cwd;
  }
  /** 设置手动 Git Bash 路径（空 = 自动探测）；变化后 ensureStarted 自动重启生效 */
  setBashPath(p) {
    this.bashPath = p.trim();
  }
  /** 最近一次 bash 探测结果 */
  getBashProbe() {
    return this.lastBashProbe;
  }
  /** 当前生效的 bash 注入值（手动配置或自动探测；null = 不注入） */
  effectiveBash() {
    const probe = probeGitBash(this.bashPath || void 0);
    this.lastBashProbe = probe;
    return probe.fromEnv ? null : probe.found;
  }
  /** 最近的 stderr 行（诊断用） */
  getStderrTail(maxLines = 20) {
    return this.stderrLines.slice(-maxLines).join("\n");
  }
  /** 启动子进程并完成 initialize 握手；已连接时直接返回 */
  async ensureStarted() {
    const bash = this.effectiveBash();
    if (this.ready && this.startedCwd === this.cwd && this.startedBash === bash)
      return;
    if (this.ready) {
      await this.stopAndWait();
    }
    if (this.state === "starting") {
      const ok = await this.waitFor((s) => s !== "starting", 15e3);
      if (!ok) throw new Error("\u7B49\u5F85 Kimi CLI \u542F\u52A8\u8D85\u65F6");
      if (this.ready) return;
    }
    this.setState("starting");
    this.stopping = false;
    let proc;
    try {
      proc = await this.spawnWithRetry();
    } catch (e) {
      this.setState("error", String(e));
      throw new Error(
        `\u65E0\u6CD5\u542F\u52A8 Kimi CLI\uFF1A${this.cliPath}
\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u68C0\u67E5 CLI \u8DEF\u5F84\u3002(${String(e)})`
      );
    }
    const gen = ++this.generation;
    this.proc = proc;
    this.startedCwd = this.cwd;
    this.startedBash = this.lastBashProbe && !this.lastBashProbe.fromEnv ? this.lastBashProbe.found : null;
    this.buffer = "";
    this.stderrLines = [];
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (d) => this.onStdout(d));
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (d) => {
      const text = d.trim();
      if (text) {
        for (const line of text.split("\n")) {
          this.stderrLines.push(line);
        }
        if (this.stderrLines.length > 80) {
          this.stderrLines.splice(0, this.stderrLines.length - 80);
        }
      }
      console.warn("[kimidian:acp stderr]", text);
    });
    proc.on("error", (e) => {
      if (gen !== this.generation) return;
      this.setState("error", String(e));
      this.failAllPending(new Error(`\u5B50\u8FDB\u7A0B\u9519\u8BEF: ${String(e)}`));
    });
    proc.on("exit", (code, signal) => {
      if (gen !== this.generation) return;
      console.warn(`[kimidian] kimi acp \u9000\u51FA code=${code} signal=${signal}`);
      this.proc = null;
      this.lastExitInfo = { code, signal: signal ?? null };
      const e = new Error(
        `Kimi CLI \u8FDB\u7A0B\u5DF2\u9000\u51FA (code=${code ?? "null"}, signal=${signal ?? "\u65E0"})`
      );
      e.data = { exitCode: code, signal: signal ?? null };
      this.failAllPending(e);
      if (!this.stopping) {
        this.setState("disconnected", `\u8FDB\u7A0B\u610F\u5916\u9000\u51FA (code=${code})`);
      } else {
        this.setState("disconnected");
      }
    });
    try {
      const init = await this.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false
        },
        clientInfo: { name: "kimidian", version: "0.1.0" }
      });
      this.agentCapabilities = init.agentCapabilities ?? null;
      this.authMethods = init.authMethods ?? [];
      this.agentVersion = init.agentInfo?.version ?? "";
      this.setState("connected");
    } catch (e) {
      await this.stopAndWait();
      throw e;
    }
  }
  /**
   * spawn 并处理 Windows 上 EBUSY/EPERM（旧进程刚被杀、二进制仍被占用）：
   * 监听 'spawn'/'error' 事件确认结果，失败退避重试最多 3 次。
   *
   * 关键：注入 KIMI_SHELL_PATH。Kimi CLI 在 Windows 建会话时必须找到
   * Git Bash，否则 session/new 返回 -32603（"Git Bash was not found"）。
   * Obsidian 环境通常没有该变量，按探测结果注入；用户环境已有则不覆盖。
   */
  spawnWithRetry() {
    const probe = probeGitBash(this.bashPath || void 0);
    this.lastBashProbe = probe;
    const env = { ...process.env };
    if (!probe.fromEnv && probe.found) {
      env.KIMI_SHELL_PATH = probe.found;
      console.warn(
        `[kimidian] \u6CE8\u5165 KIMI_SHELL_PATH=${probe.found}\uFF08\u6765\u6E90\uFF1A${probe.source}\uFF09`
      );
    } else if (!probe.found) {
      console.warn("[kimidian] \u672A\u627E\u5230\u53EF\u7528\u7684 Git Bash\uFF0Csession/new \u53EF\u80FD\u5931\u8D25");
    }
    return new Promise((resolvePromise, rejectPromise) => {
      let attempt = 0;
      const trySpawn = () => {
        attempt++;
        let proc;
        try {
          proc = (0, import_child_process.spawn)(this.cliPath, ["acp", ...this.extraArgs], {
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
            cwd: this.cwd ?? void 0,
            env
          });
        } catch (e) {
          if (attempt < 3) {
            setTimeout(trySpawn, 500 * attempt);
          } else {
            rejectPromise(e);
          }
          return;
        }
        proc.once("spawn", () => resolvePromise(proc));
        proc.once("error", (e) => {
          console.warn(
            `[kimidian] spawn \u7B2C ${attempt} \u6B21\u5931\u8D25: ${String(e)}`
          );
          if (attempt < 3) {
            setTimeout(trySpawn, 500 * attempt);
          } else {
            rejectPromise(e);
          }
        });
      };
      trySpawn();
    });
  }
  async restart() {
    await this.stopAndWait();
    await this.ensureStarted();
  }
  /** 同步快速停止（插件卸载用） */
  stop() {
    this.stopping = true;
    this.generation++;
    const p = this.proc;
    this.proc = null;
    this.failAllPending(new Error("\u5BA2\u6237\u7AEF\u5DF2\u505C\u6B62"));
    try {
      p?.kill();
    } catch {
    }
    this.setState("disconnected");
  }
  /**
   * 停止并等待旧进程真正退出（Windows 上 kimi.exe 文件被将死进程占用，
   * 立即 respawn 会 EBUSY/EPERM），再留 400ms 让 OS 释放文件句柄。
   */
  async stopAndWait() {
    const p = this.proc;
    this.stop();
    if (p && p.exitCode === null && !p.killed) {
      await Promise.race([
        new Promise((resolve2) => p.once("exit", () => resolve2())),
        this.sleep(2e3)
        // 2s 内不退出就强等超时继续
      ]);
    } else if (p) {
      await this.sleep(300);
    }
    await this.sleep(400);
  }
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  // ---------- ACP 方法 ----------
  async sessionNew(cwd) {
    try {
      return await this.request("session/new", {
        cwd,
        mcpServers: []
      });
    } catch (e) {
      const err = e;
      if (err?.code === -32603 && this.canAutoRestart()) {
        console.warn("[kimidian] session/new \u8FD4\u56DE -32603\uFF0C\u81EA\u52A8\u91CD\u542F acp \u8FDB\u7A0B\u91CD\u8BD5");
        try {
          await this.restart();
          return await this.request("session/new", {
            cwd,
            mcpServers: []
          });
        } catch (e2) {
          throw this.wrapAuth(e2);
        }
      }
      throw this.wrapAuth(e);
    }
  }
  /** 自动重启限流：5 分钟最多 3 次 */
  canAutoRestart() {
    const now = Date.now();
    this.autoRestartTimes = this.autoRestartTimes.filter(
      (t) => now - t < 5 * 60 * 1e3
    );
    if (this.autoRestartTimes.length >= 3) {
      console.warn("[kimidian] \u81EA\u52A8\u91CD\u542F\u6B21\u6570\u8D85\u9650\uFF085 \u5206\u949F\u5185 3 \u6B21\uFF09\uFF0C\u4E0D\u518D\u81EA\u52A8\u91CD\u542F");
      return false;
    }
    this.autoRestartTimes.push(now);
    return true;
  }
  async sessionLoad(sessionId, cwd) {
    try {
      return await this.request("session/load", {
        sessionId,
        cwd,
        mcpServers: []
      });
    } catch (e) {
      throw this.wrapAuth(e);
    }
  }
  async sessionList(cwd) {
    const all = [];
    let cursor = null;
    for (let i = 0; i < 20; i++) {
      const r = await this.request("session/list", {
        cwd,
        cursor
      });
      all.push(...r.sessions ?? []);
      cursor = r.nextCursor ?? null;
      if (!cursor) break;
    }
    return all;
  }
  /** 发送 prompt；流式内容通过 onSessionUpdate 回调，这里只等最终结果 */
  async prompt(sessionId, blocks) {
    try {
      return await this.request("session/prompt", {
        sessionId,
        prompt: blocks
      });
    } catch (e) {
      throw this.wrapAuth(e);
    }
  }
  cancel(sessionId) {
    this.notify("session/cancel", { sessionId });
  }
  async setConfigOption(sessionId, configId, value) {
    const r = await this.request("session/set_config_option", {
      sessionId,
      configId,
      value
    });
    return r.configOptions ?? [];
  }
  // ---------- JSON-RPC 收发 ----------
  request(method, params) {
    if (!this.proc?.stdin?.writable) {
      return Promise.reject(new Error("Kimi CLI \u672A\u8FDE\u63A5"));
    }
    const id = this.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve2, reject) => {
      this.pending.set(id, { resolve: resolve2, reject, method });
      try {
        this.proc.stdin.write(JSON.stringify(msg) + "\n");
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  notify(method, params) {
    if (!this.proc?.stdin?.writable) return;
    try {
      this.proc.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"
      );
    } catch {
    }
  }
  respond(id, result, error) {
    if (!this.proc?.stdin?.writable) return;
    const msg = { jsonrpc: "2.0", id };
    if (error) msg.error = error;
    else msg.result = result ?? null;
    try {
      this.proc.stdin.write(JSON.stringify(msg) + "\n");
    } catch {
    }
  }
  onStdout(data) {
    this.buffer += data;
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        console.warn("[kimidian] \u975E JSON \u884C:", line.slice(0, 200));
        continue;
      }
      this.dispatch(msg);
    }
  }
  dispatch(msg) {
    const hasMethod = typeof msg.method === "string";
    const hasId = msg.id !== void 0 && msg.id !== null;
    if (hasMethod && hasId) {
      void this.handleAgentRequest(
        msg.id,
        msg.method,
        msg.params
      );
    } else if (hasMethod) {
      if (msg.method === "session/update") {
        try {
          this.events.onSessionUpdate(msg.params);
        } catch (e) {
          console.error("[kimidian] session/update \u76D1\u542C\u5668\u5F02\u5E38:", e);
        }
      }
    } else if (hasId) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      const err = msg.error;
      if (err) {
        const e = new Error(err.message);
        e.code = err.code;
        e.data = err.data;
        p.reject(e);
      } else {
        p.resolve(msg.result);
      }
    }
  }
  /** 处理 agent 反向请求：权限审批 + 文件读写 */
  async handleAgentRequest(id, method, params) {
    try {
      if (method === "session/request_permission") {
        const outcome = await this.events.onPermissionRequest(
          params
        );
        this.respond(id, { outcome });
        return;
      }
      if (method === "fs/read_text_file") {
        const p = params;
        let content = await import_fs2.promises.readFile(this.resolveFsPath(p.path), "utf8");
        if (p.line != null || p.limit != null) {
          const lines = content.split("\n");
          const start = Math.max(0, (p.line ?? 1) - 1);
          const end = p.limit != null ? start + p.limit : void 0;
          content = lines.slice(start, end).join("\n");
        }
        this.respond(id, { content });
        return;
      }
      if (method === "fs/write_text_file") {
        const p = params;
        await import_fs2.promises.writeFile(this.resolveFsPath(p.path), p.content, "utf8");
        this.respond(id, {});
        return;
      }
      this.respond(id, void 0, { code: -32601, message: `Method not found: ${method}` });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      this.respond(id, void 0, {
        code: -32603,
        message: `[kimidian] ${method} \u5931\u8D25: ${detail}`
      });
    }
  }
  /**
   * 防御性路径解析：agent 理论上应发绝对路径，但若发来相对/盘符相对路径
   * （如 \tmp\x.py），按会话工作目录（vault 根）解析，而不是 Obsidian 进程 cwd。
   */
  resolveFsPath(p) {
    const isDriveAbsolute = /^[a-zA-Z]:[\\/]/.test(p);
    const isUnc = p.startsWith("\\\\");
    if (isDriveAbsolute || isUnc || !this.cwd) return p;
    return (0, import_path2.resolve)(this.cwd, p);
  }
  /** 默认权限决策（autoApprove 开启时使用）：优先 allow_always，其次 allow_once */
  static pickAllowOption(options) {
    return options.find((o) => o.kind === "allow_always") ?? options.find((o) => o.kind === "allow_once") ?? null;
  }
  // ---------- 工具 ----------
  wrapAuth(e) {
    const err = e;
    if (err?.code === ACP_ERR_AUTH_REQUIRED) {
      this.setState("auth_required");
      return new AuthRequiredError(err.message);
    }
    return err instanceof Error ? err : new Error(String(e));
  }
  setState(s, detail) {
    this.state = s;
    this.events.onStateChange(s, detail);
  }
  /** 最近一次进程退出信息（诊断/错误展示用） */
  getLastExitInfo() {
    return this.lastExitInfo;
  }
  failAllPending(e) {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
  }
  /** 等待状态满足条件；超时返回 false（不再无限悬挂） */
  waitFor(pred, timeoutMs = 15e3) {
    return new Promise((resolve2) => {
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        if (pred(this.state)) resolve2(true);
        else if (Date.now() > deadline) resolve2(false);
        else setTimeout(check, 50);
      };
      check();
    });
  }
};

// src/brand.ts
var MOON_ICON_ID = "kimidian-moon";
var BRAND_NAME = "Kimidian";

// src/attachments.ts
var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
var BINARY_STORE_DIR = "attachments/kimidian";
var IMAGE_MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};
var TEXT_EXTS = /* @__PURE__ */ new Set([
  "md",
  "txt",
  "csv",
  "json",
  "log",
  "yaml",
  "yml",
  "xml",
  "ts",
  "js",
  "py",
  "css",
  "html"
]);
function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
function classifyFile(name) {
  const ext = extOf(name);
  if (IMAGE_MIME_BY_EXT[ext]) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  return "binary";
}
function imageMimeFor(name) {
  return IMAGE_MIME_BY_EXT[extOf(name)] ?? null;
}
function truncateText(content, maxChars) {
  if (content.length <= maxChars) return { text: content, truncated: false };
  return { text: content.slice(0, maxChars), truncated: true };
}
function fileRefXml(absPath, content, truncated) {
  return `<file path="${absPath}">
${content}${truncated ? "\n\u2026\uFF08\u5185\u5BB9\u8FC7\u957F\uFF0C\u5DF2\u622A\u65AD\uFF09" : ""}
</file>`;
}
function binaryRefLine(vaultPath) {
  return `[\u9644\u4EF6] ${vaultPath}\uFF08\u5DF2\u5B58\u5165\u4ED3\u5E93\uFF0C\u53EF\u7528\u5DE5\u5177\u8BFB\u53D6\uFF09`;
}
function bytesToBase64(bytes) {
  const buf = globalThis.Buffer;
  if (buf) return buf.from(bytes).toString("base64");
  let bin = "";
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// src/copy.ts
async function writeClipboardText(text) {
  const nav = globalThis.navigator;
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return;
  }
  const doc = globalThis.document;
  if (!doc) throw new Error("\u5F53\u524D\u73AF\u5883\u65E0\u526A\u8D34\u677F\u80FD\u529B");
  const ta = doc.createElement("textarea");
  ta.value = text;
  ta.classList.add("kimidian-clipboard-ta");
  doc.body.appendChild(ta);
  ta.select();
  try {
    doc.execCommand("copy");
  } finally {
    ta.remove();
  }
}

// src/message-filter.ts
var INTERNAL_BLOCK_TAGS = ["system-reminder"];
function basename(p) {
  const s = p.replace(/\\/g, "/");
  return s.split("/").pop() ?? p;
}
function stripInternalBlocks(raw) {
  let out = raw;
  for (const tag of INTERNAL_BLOCK_TAGS) {
    const paired = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g");
    out = out.replace(paired, "");
    const tail = new RegExp(`<${tag}>[\\s\\S]*$`);
    out = out.replace(tail, "");
  }
  return out;
}
function extractContextRefs(raw) {
  const refs = [];
  let text = raw;
  text = text.replace(/<active-note\s+path="([^"]+)"\s*\/>/g, (_, p) => {
    refs.push({ kind: "note", path: p, label: basename(p) });
    return "";
  });
  text = text.replace(
    /<file\s+path="([^"]+)"\s*>[\s\S]*?<\/file>/g,
    (_, p) => {
      refs.push({ kind: "file", path: p, label: basename(p) });
      return "";
    }
  );
  text = text.replace(/<file\s+path="([^"]+)"\s*>[\s\S]*$/, (_, p) => {
    refs.push({ kind: "file", path: p, label: basename(p) });
    return "";
  });
  text = text.replace(
    /\n?\[附件\]\s*(\S+)（已存入仓库[^\n]*/g,
    (_, p) => {
      refs.push({ kind: "attachment", path: p, label: basename(p) });
      return "";
    }
  );
  return { text, refs };
}
function formatUserDisplay(raw) {
  const stripped = stripInternalBlocks(raw);
  const { text, refs } = extractContextRefs(stripped);
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, refs };
}

// src/selection-pop.ts
function selectionInfoIn(root, sel) {
  if (!sel || sel.isCollapsed) return null;
  const text = sel.toString();
  if (!text || !text.trim()) return null;
  const node = sel.anchorNode;
  if (!node || !root.contains(node)) return null;
  let rect = null;
  try {
    if (sel.rangeCount > 0 && sel.getRangeAt) {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    }
  } catch {
    rect = null;
  }
  return { text, rect };
}
function selCopyPos(rect, rootRect, btn, gap = 6) {
  const rw = rootRect.width ?? rootRect.right - rootRect.left;
  const rh = rootRect.height ?? rootRect.bottom - rootRect.top;
  let left;
  let top;
  if (rect) {
    left = rect.right - rootRect.left - btn.width;
    top = rect.top - rootRect.top - btn.height - gap;
  } else {
    left = rw - btn.width - 8;
    top = 8;
  }
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  return {
    left: clamp(left, 4, rw - btn.width - 4),
    top: clamp(top, 4, rh - btn.height - 4)
  };
}

// src/msg-time.ts
function formatMsgTime(ts, now = Date.now()) {
  const d = new Date(ts);
  const n = new Date(now);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
function parseWireMsgTimes(wireJsonl) {
  const out = [];
  let pendingStepEnd = null;
  const flushAssistant = () => {
    if (pendingStepEnd !== null) {
      out.push({ role: "assistant", time: pendingStepEnd });
      pendingStepEnd = null;
    }
  };
  for (const line of wireJsonl.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    if (s.includes("context.append_message")) {
      try {
        const j = JSON.parse(s);
        if (j.type === "context.append_message" && j.message?.role === "user" && j.message?.origin?.kind === "user" && typeof j.time === "number") {
          flushAssistant();
          out.push({ role: "user", time: j.time });
        }
      } catch {
      }
    } else if (s.includes("step.end")) {
      try {
        const j = JSON.parse(s);
        if (j.type === "context.append_loop_event" && j.event?.type === "step.end" && typeof j.time === "number") {
          pendingStepEnd = j.time;
        }
      } catch {
      }
    }
  }
  flushAssistant();
  return out;
}
function backfillEntryTimes(entries, times, fallbackTs) {
  let changed = false;
  let wi = 0;
  let turnAssistantTime = null;
  for (const e of entries) {
    if (e.kind === "user") {
      turnAssistantTime = null;
      let found = null;
      while (wi < times.length) {
        const w = times[wi++];
        if (w.role === "user") {
          found = w.time;
          break;
        }
      }
      if (found !== null) {
        if (e.ts !== found || e.tsEst) {
          e.ts = found;
          e.tsEst = false;
          changed = true;
        }
      } else {
        if (e.ts === void 0) {
          e.ts = fallbackTs;
          changed = true;
        }
        if (!e.tsEst) {
          e.tsEst = true;
          changed = true;
        }
      }
    } else if (e.kind === "assistant") {
      let t = turnAssistantTime;
      if (t === null) {
        while (wi < times.length) {
          const w = times[wi];
          if (w.role === "assistant") {
            t = w.time;
            wi++;
          }
          break;
        }
        turnAssistantTime = t;
      }
      if (t !== null && t !== void 0) {
        if (e.ts !== t || e.tsEst) {
          e.ts = t;
          e.tsEst = false;
          changed = true;
        }
      } else {
        if (e.ts === void 0) {
          e.ts = fallbackTs;
          changed = true;
        }
        if (!e.tsEst) {
          e.tsEst = true;
          changed = true;
        }
      }
    }
  }
  return changed;
}

// src/config-options.ts
function pickModelOption(opts) {
  if (!opts) return null;
  return opts.find((o) => o.id === "model" || /model|模型/i.test(o.name ?? "")) ?? null;
}
function pickThinkingOption(opts) {
  if (!opts) return null;
  return opts.find(
    (o) => o.id === "thinking" || o.id === "effort" || o.category === "thought_level"
  ) ?? null;
}
function selectViewState(params) {
  const { option, label, hasSession, fallbackText } = params;
  const options = option?.options ?? [];
  if (!option || options.length === 0 || !hasSession) {
    return fallbackText ? { kind: "placeholder", text: `${label}\uFF1A${fallbackText}` } : { kind: "hidden" };
  }
  if (options.length === 1) {
    if (label === "\u601D\u8003") return { kind: "hidden" };
    return { kind: "single", text: `${label}\uFF1A${options[0].name || options[0].value}` };
  }
  return {
    kind: "select",
    options: options.map((o) => ({ value: o.value, label: o.name || o.value })),
    current: option.currentValue ?? ""
  };
}
function normalizeModelInput(input, option, fallback) {
  const raw = (input ?? "").trim();
  if (!raw) return { value: fallback, recognized: true };
  const options = option?.options ?? [];
  if (options.length === 0) {
    return { value: raw, recognized: false };
  }
  const byValue = options.find((o) => o.value === raw);
  if (byValue) return { value: byValue.value, recognized: true };
  const lower = raw.toLowerCase();
  const byName = options.find((o) => (o.name ?? "").toLowerCase() === lower);
  if (byName) return { value: byName.value, recognized: true };
  const byTail = options.find(
    (o) => o.value.split("/").filter(Boolean).pop()?.toLowerCase() === lower
  );
  if (byTail) return { value: byTail.value, recognized: true };
  return { value: raw, recognized: false };
}

// src/permission-policy.ts
var PERMISSION_MODE_LABELS = {
  ask: "\u9010\u4E2A\u8BE2\u95EE",
  smart: "\u667A\u80FD\u653E\u884C",
  yolo: "\u5168\u90E8\u5141\u8BB8"
};
var READ_ONLY_KINDS = /* @__PURE__ */ new Set(["read", "search", "fetch", "think"]);
var WRITE_KINDS = /* @__PURE__ */ new Set(["edit", "delete", "move", "execute", "switch_mode"]);
var READ_ONLY_TITLE = /read|grep|glob|list|search|fetch|view|find|think|web/i;
var WRITE_TITLE = /write|edit|delete|remove|patch|replace|create|mkdir|move|rename|run|exec|shell|command|terminal/i;
function toolKeyOf(tc) {
  const kind = (tc.kind ?? "").toLowerCase().trim();
  const title = (tc.title ?? "").trim();
  const idMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(title);
  const name = idMatch ? idMatch[0] : title.split(/[：:\s（(]/)[0] || "unknown";
  return kind ? `${kind}:${name}` : name;
}
function isReadOnlyTool(tc) {
  const kind = (tc.kind ?? "").toLowerCase().trim();
  if (READ_ONLY_KINDS.has(kind)) return true;
  if (WRITE_KINDS.has(kind)) return false;
  const title = tc.title ?? "";
  if (WRITE_TITLE.test(title)) return false;
  return READ_ONLY_TITLE.test(title);
}
function decidePermission(mode, toolCall, grantedAlways) {
  if (mode === "yolo") return "auto-allow";
  if (grantedAlways.has(toolKeyOf(toolCall))) return "auto-allow";
  if (mode === "smart" && isReadOnlyTool(toolCall)) return "auto-allow";
  return "ask";
}
function cliModeFor(mode) {
  return mode === "yolo" ? "yolo" : "default";
}

// src/scroll-follow.ts
var NEAR_BOTTOM_PX = 60;
function isNearBottom(scrollTop, clientHeight, scrollHeight, threshold = NEAR_BOTTOM_PX) {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}
var ScrollFollow = class {
  constructor() {
    this.stuck = true;
  }
  /** 用户滚动事件后调用；返回是否处于跟随态 */
  onScroll(scrollTop, clientHeight, scrollHeight) {
    this.stuck = isNearBottom(scrollTop, clientHeight, scrollHeight);
    return this.stuck;
  }
  /** 新内容到达：是否应自动滚动（不跟随时应由调用方显示"新消息"按钮） */
  shouldAutoScroll() {
    return this.stuck;
  }
  /** 强制恢复跟随（点"新消息"按钮 / 用户自己发消息） */
  stick() {
    this.stuck = true;
  }
};

// src/usage.ts
var MODEL_CONTEXT_FALLBACK = {
  "kimi-for-coding": 262144,
  k3: 1048576
};
function modelTail(model) {
  if (!model) return null;
  const seg = model.split("/").filter(Boolean);
  return seg.length > 0 ? seg[seg.length - 1] : null;
}
function parseWireUsage(text) {
  let usage = null;
  let maxTokens = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    const isUsage = t.includes('"usage.record"');
    const isReq = !isUsage && t.includes('"llm.request"');
    if (!isUsage && !isReq) continue;
    let obj;
    try {
      obj = JSON.parse(t);
    } catch {
      continue;
    }
    if (isUsage && obj?.type === "usage.record" && obj.usage) {
      const u = obj.usage;
      usage = {
        model: typeof obj.model === "string" ? obj.model : null,
        inputOther: num(u.inputOther),
        output: num(u.output),
        inputCacheRead: num(u.inputCacheRead),
        inputCacheCreation: num(u.inputCacheCreation)
      };
    } else if (isReq && obj?.type === "llm.request") {
      const mt = num(obj.maxTokens);
      if (mt > 0) maxTokens = mt;
    }
  }
  return { usage, maxTokens };
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}
function computeContextUsage(info) {
  if (!info.usage) return null;
  const u = info.usage;
  const used = u.inputOther + u.inputCacheRead + u.inputCacheCreation + u.output;
  let total = info.maxTokens;
  let exact = true;
  if (!total) {
    total = MODEL_CONTEXT_FALLBACK[modelTail(u.model) ?? ""] ?? null;
    exact = false;
  }
  if (!total || total <= 0) return null;
  return {
    used,
    total,
    pct: Math.min(100, Math.round(used / total * 100)),
    model: u.model,
    exact,
    estimated: false
  };
}
var CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;
function collectStrings(v, out) {
  if (typeof v === "string") {
    for (const ch of v) {
      if (CJK_RE.test(ch)) out.cjk++;
      else out.other++;
    }
  } else if (Array.isArray(v)) {
    for (const x of v) collectStrings(x, out);
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) collectStrings(x, out);
  }
}
function estimateWireChars(text) {
  const out = { cjk: 0, other: 0 };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    try {
      collectStrings(JSON.parse(t), out);
    } catch {
    }
  }
  return out;
}
function estimateTokens(cjk, other) {
  return Math.ceil(cjk / 2 + other / 4);
}
function computeEstimatedUsage(params) {
  const used = estimateTokens(params.cjk, params.other);
  if (used <= 0) return null;
  let total = params.maxTokens;
  let exact = true;
  if (!total) {
    total = MODEL_CONTEXT_FALLBACK[modelTail(params.model) ?? ""] ?? null;
    exact = false;
  }
  if (!total || total <= 0) return null;
  return {
    used,
    total,
    pct: Math.min(100, Math.round(used / total * 100)),
    model: params.model,
    exact,
    estimated: true
  };
}

// src/chat-view.ts
var KIMIDIAN_VIEW_TYPE = "kimidian-view";
var MAX_ATTACH_CHARS = 2e4;
var MSG_LOG_MAX = 500;
var KimidianView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    /** 当前会话 wire.jsonl 的缓存路径（定位一次后复用） */
    this.wirePath = null;
    /** 用量刷新定时器（轮次结束后延迟读取，等 CLI 落盘 usage.record） */
    this.usageTimer = null;
    // ---- 等待模型响应指示 ----
    /** 5 秒无 chunk → 显示等待指示的计时器 */
    this.waitTimer = null;
    /** 60 秒无 chunk → 升级文案的计时器 */
    this.waitSlowTimer = null;
    this.waitEl = null;
    this.waitTextEl = null;
    /** 阈值（测试可调小） */
    this.waitDelayMs = 5e3;
    this.waitSlowMs = 6e4;
    /** 正在执行的工具数（全部完成后才重新等模型输出） */
    this.runningTools = 0;
    /** 待处理权限请求数（角标 + 动效） */
    this.pendingPermissions = 0;
    /** 滚动跟随状态：用户上翻时流式渲染不再强制拉到底部 */
    this.scrollFollow = new ScrollFollow();
    /** 「↓ 新消息」悬浮按钮（不跟随时显示） */
    this.newMsgBtn = null;
    this.historyPanelEl = null;
    this.suggestEl = null;
    this.sessionId = null;
    this.busy = false;
    /** 当前正在流式渲染的助手消息容器（含原文 buffer） */
    this.streamEl = null;
    this.streamText = "";
    /** 当前思考块 */
    this.thoughtEl = null;
    this.thoughtBodyEl = null;
    this.thoughtText = "";
    /** 工具调用块索引 */
    this.toolBlocks = /* @__PURE__ */ new Map();
    /** 消息日志（数据层）：渲染只是投影，面板切换/视图重建不丢 */
    this.msgLog = [];
    /** 当前正在写入的助手正文/思考/工具条目（流式增量更新同一个对象） */
    this.curAssistantEntry = null;
    this.curThoughtEntry = null;
    this.toolEntries = /* @__PURE__ */ new Map();
    /** @ 附件 */
    this.attachments = [];
    /** 被 × 排除自动附带的活动笔记路径（切到别的笔记自动恢复；同一路径保持排除） */
    this.activeNoteExcludedPath = null;
    /** 待发送附件（粘贴/拖拽的图片与文档；发送成功才清空，失败保留） */
    this.pending = [];
    /** 待处理的权限请求（取消时需要回 cancelled） */
    this.pendingPermissionResolve = null;
    this.lastUserText = "";
    this.modelOptions = null;
    /** 思考强度（kimi acp 的 thinking/thought_level 配置项；k3 暴露 low/high/max） */
    this.effortOptions = null;
    /** 是否正在回放历史（session/load） */
    this.replaying = false;
    /** 回放期间最后一条内容 chunk 的到达时间（drain 窗口用） */
    this.lastReplayChunkAt = 0;
    /** 渲染异常已弹过 Notice（防刷屏；console.error 每次都记） */
    this.renderErrorNoticed = false;
    /** 选区复制浮层按钮（拖选文字后浮现） */
    this.selCopyBtn = null;
    /** 浮层点击时要复制的选中文字（选区可能在点击前变化，先缓存） */
    this.selCopyText = "";
    /** 消息区有活跃选区时被推迟的流式重渲染（选区清空后补渲染） */
    this.deferredStreamRender = false;
    /** 会话引导状态：视图打开即建会话（creating=加载中 / failed=可重试），不再等首条消息 */
    this.sessionBoot = "idle";
    this.sessionBootError = null;
    /** 选区变化：消息区内有选中文字 → 浮现「复制」小按钮；消失 → 隐藏并补渲染 */
    this.onSelectionChange = () => {
      try {
        const info = selectionInfoIn(this.messagesEl, window.getSelection());
        if (!info) {
          this.hideSelCopyBtn();
          if (this.deferredStreamRender) this.flushStreamRender();
          return;
        }
        this.selCopyText = info.text;
        this.showSelCopyBtn(info.rect);
      } catch (e) {
        console.error("[kimidian] selectionchange \u5904\u7406\u5F02\u5E38:", e);
      }
    };
  }
  getViewType() {
    return KIMIDIAN_VIEW_TYPE;
  }
  getDisplayText() {
    return BRAND_NAME;
  }
  getIcon() {
    return MOON_ICON_ID;
  }
  get client() {
    return this.plugin.acpClient;
  }
  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("kimidian-root");
    const brand = root.createDiv({ cls: "kimidian-brand" });
    const logo = brand.createSpan({ cls: "kimidian-brand-logo" });
    (0, import_obsidian.setIcon)(logo, MOON_ICON_ID);
    brand.createSpan({ cls: "kimidian-brand-name", text: BRAND_NAME });
    this.toolbarEl = root.createDiv({ cls: "kimidian-toolbar" });
    const newBtn = this.toolbarEl.createEl("button", {
      cls: "kimidian-tool-btn",
      text: "\u65B0\u5BF9\u8BDD"
    });
    newBtn.onclick = () => void this.newSession();
    const histBtn = this.toolbarEl.createEl("button", {
      cls: "kimidian-tool-btn",
      text: "\u5386\u53F2"
    });
    histBtn.onclick = () => void this.toggleHistory();
    const reconnectBtn = this.toolbarEl.createEl("button", {
      cls: "kimidian-tool-btn kimidian-reconnect",
      text: "\u91CD\u8FDE"
    });
    reconnectBtn.onclick = () => void this.reconnect();
    this.messagesEl = root.createDiv({ cls: "kimidian-messages" });
    this.messagesEl.addEventListener("scroll", () => this.onMessagesScroll());
    document.addEventListener("selectionchange", this.onSelectionChange);
    if (this.msgLog.length > 0) this.restoreMsgLog();
    else this.renderWelcome();
    this.chipsEl = root.createDiv({ cls: "kimidian-chips" });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.renderChips())
    );
    this.renderChips();
    const inputWrap = root.createDiv({ cls: "kimidian-input-wrap" });
    this.inputWrapEl = inputWrap;
    this.inputEl = inputWrap.createEl("textarea", {
      cls: "kimidian-input",
      attr: { placeholder: "\u5411 Kimi \u63D0\u95EE\u2026\uFF08@ \u5F15\u7528\u7B14\u8BB0\uFF0CEnter \u53D1\u9001\uFF0CShift+Enter \u6362\u884C\uFF0C\u53EF\u7C98\u8D34/\u62D6\u62FD\u56FE\u7247\u4E0E\u6587\u6863\uFF09", rows: "3" }
    });
    this.inputEl.addEventListener("keydown", (e) => this.onInputKeydown(e));
    this.inputEl.addEventListener("input", () => this.updateSuggest());
    this.inputEl.addEventListener("paste", (e) => void this.onPaste(e));
    inputWrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      inputWrap.classList.add("is-dragover");
    });
    inputWrap.addEventListener("dragleave", () => {
      inputWrap.classList.remove("is-dragover");
    });
    inputWrap.addEventListener("drop", (e) => void this.onDrop(e));
    this.inputEl.addEventListener("blur", () => {
      window.setTimeout(() => this.closeSuggest(), 150);
    });
    this.sendBtn = inputWrap.createEl("button", {
      cls: "kimidian-send mod-cta",
      text: "\u53D1\u9001"
    });
    this.sendBtn.onclick = () => {
      if (this.busy) this.cancelTurn();
      else void this.sendMessage();
    };
    const inputFooter = root.createDiv({ cls: "kimidian-input-footer" });
    this.shieldBtn = inputFooter.createDiv({ cls: "kimidian-shield-btn" });
    const shieldIcon = this.shieldBtn.createSpan({ cls: "kimidian-shield-icon" });
    (0, import_obsidian.setIcon)(shieldIcon, "shield");
    this.shieldLabel = this.shieldBtn.createSpan({ cls: "kimidian-shield-label" });
    this.shieldBtn.createSpan({ cls: "kimidian-shield-caret", text: "\u25BE" });
    this.shieldBadge = this.shieldBtn.createSpan({ cls: "kimidian-shield-badge" });
    this.shieldBtn.title = "\u6743\u9650\u6A21\u5F0F\uFF1A\u63A7\u5236\u5DE5\u5177\u8C03\u7528\u7684\u5BA1\u6279\u65B9\u5F0F";
    this.shieldBtn.onclick = (e) => this.showPermissionMenu(e);
    this.updateShield();
    const resetBtn = inputFooter.createEl("button", {
      cls: "kimidian-reset-btn",
      text: "\u91CD\u7F6E\u4F1A\u8BDD"
    });
    resetBtn.title = "\u53D6\u6D88\u5F53\u524D\u8F6E\u6B21\u5E76\u65B0\u5EFA\u4F1A\u8BDD\uFF08\u65E7\u4F1A\u8BDD\u53EF\u4ECE\u300C\u5386\u53F2\u300D\u9762\u677F\u627E\u56DE\uFF09";
    resetBtn.onclick = () => void this.newSession();
    const status = root.createDiv({ cls: "kimidian-statusbar" });
    this.statusModelEl = status.createSpan({ cls: "kimidian-status-model" });
    this.statusEffortEl = status.createSpan({ cls: "kimidian-status-effort" });
    this.statusUsageEl = status.createSpan({ cls: "kimidian-status-usage" });
    this.statusConnEl = status.createSpan({ cls: "kimidian-status-conn" });
    this.renderStatus();
    void this.bootstrap();
    if (this.plugin.settings.uiState?.historyOpen) void this.toggleHistory();
  }
  /**
   * 会话引导：ACP 连接建立后立即拿到可用会话（不等用户发第一条消息）。
   * 优先通过 session/load 恢复插件记住的上次会话（视图被销毁重建时
   * 消息从 CLI 侧回放重建）；恢复失败或 forceNew（用户点「新对话」）时新建。
   * 期间模型控件显示「加载中…」，失败显示可点击的「重试」态。
   */
  async bootstrap(forceNew = false) {
    if (this.sessionId || this.sessionBoot === "creating") return;
    this.sessionBoot = "creating";
    this.sessionBootError = null;
    this.renderStatus();
    if (!await this.ensureConnected()) {
      this.sessionBoot = "failed";
      this.sessionBootError = "\u65E0\u6CD5\u8FDE\u63A5 Kimi CLI";
      this.renderStatus();
      return;
    }
    const last = forceNew ? null : this.plugin.lastSessionId;
    if (last && await this.restoreSession(last)) {
      this.sessionBoot = "idle";
      this.renderStatus();
      return;
    }
    if (await this.ensureSession()) {
      this.sessionBoot = "idle";
    } else {
      this.sessionBoot = "failed";
      this.sessionBootError = "\u4F1A\u8BDD\u521B\u5EFA\u5931\u8D25";
    }
    this.renderStatus();
  }
  /**
   * 从 CLI 侧恢复已有会话：session/load 的历史回放经 session/update 推送，
   * 走正常渲染路径同时重建消息日志（数据层）。
   */
  async restoreSession(sessionId) {
    const base = this.vaultBasePath();
    if (!base) return false;
    try {
      this.msgLog = [];
      this.messagesEl.empty();
      this.beginAssistantTurn();
      this.sessionId = sessionId;
      this.wirePath = null;
      this.replaying = true;
      const result = await this.client.sessionLoad(sessionId, base);
      await this.waitForReplayQuiet();
      this.replaying = false;
      if (this.sessionId !== sessionId) return true;
      this.applyConfigOptions(result?.configOptions ?? null);
      await this.applyModelPreference();
      this.plugin.lastSessionId = sessionId;
      await this.backfillReplayTimes();
      this.renderStatus();
      this.refreshUsage(0);
      this.scrollToBottom();
      return true;
    } catch (e) {
      this.replaying = false;
      this.sessionId = null;
      console.warn("[kimidian] \u6062\u590D\u4E0A\u6B21\u4F1A\u8BDD\u5931\u8D25:", e);
      return false;
    }
  }
  /**
   * 回放静默窗口：session/load 响应返回后，再等一会儿确认没有
   * 迟到的回放 chunk（实测响应在最后，但顺序没有协议保证）。
   * 收到 chunk 会重置计时；maxMs 兜底防挂死。
   */
  async waitForReplayQuiet(quietMs = 400, maxMs = 5e3) {
    const start = Date.now();
    this.lastReplayChunkAt = 0;
    while (Date.now() - start < maxMs) {
      await new Promise((r) => window.setTimeout(r, quietMs));
      if (!this.replaying) return;
      if (this.lastReplayChunkAt === 0) return;
      if (Date.now() - this.lastReplayChunkAt >= quietMs) return;
    }
  }
  async onClose() {
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
  async ensureConnected() {
    try {
      this.client.setCwd(this.vaultBasePath());
      this.client.setBashPath(this.plugin.settings.bashPath);
      await this.client.ensureStarted();
      this.renderStatus();
      return true;
    } catch (e) {
      this.renderStatus();
      new import_obsidian.Notice(`Kimi CLI \u542F\u52A8\u5931\u8D25\uFF1A${e.message}`, 8e3);
      this.renderSystemMsg(
        `\u26A0\uFE0F \u65E0\u6CD5\u542F\u52A8 Kimi CLI\u3002

${e.message}

\u8BF7\u5230\u63D2\u4EF6\u8BBE\u7F6E\u68C0\u67E5 CLI \u8DEF\u5F84\uFF0C\u7136\u540E\u70B9\u51FB\u9876\u90E8\u300C\u91CD\u8FDE\u300D\u3002`
      );
      return false;
    }
  }
  async reconnect() {
    try {
      this.client.updateCommand(
        this.plugin.settings.cliPath,
        this.splitArgs(this.plugin.settings.extraArgs)
      );
      this.client.setCwd(this.vaultBasePath());
      this.client.setBashPath(this.plugin.settings.bashPath);
      await this.client.restart();
      this.sessionId = null;
      this.wirePath = null;
      this.modelOptions = null;
      this.effortOptions = null;
      this.sessionBoot = "idle";
      this.renderStatus();
      void this.bootstrap();
      new import_obsidian.Notice("Kimi CLI \u5DF2\u91CD\u65B0\u8FDE\u63A5");
    } catch (e) {
      new import_obsidian.Notice(`\u91CD\u8FDE\u5931\u8D25\uFF1A${e.message}`, 8e3);
    }
  }
  splitArgs(s) {
    return s.split(/\s+/).filter((x) => x.length > 0);
  }
  // ================= 会话 =================
  async newSession() {
    this.cancelTurn();
    this.endAssistantTurn();
    this.setBusy(false);
    this.hideWaitIndicator();
    if (!await this.ensureConnected()) return;
    this.sessionId = null;
    this.wirePath = null;
    this.sessionBoot = "idle";
    this.plugin.lastSessionId = null;
    this.msgLog = [];
    this.messagesEl.empty();
    this.renderWelcome();
    this.modelOptions = null;
    this.effortOptions = null;
    this.renderStatus();
    this.renderUsage(null);
    void this.bootstrap(true);
    this.inputEl.focus();
  }
  async ensureSession() {
    if (this.sessionId) return true;
    const basePath = this.vaultBasePath();
    if (!basePath) {
      new import_obsidian.Notice("\u65E0\u6CD5\u83B7\u53D6 vault \u8DEF\u5F84\uFF08\u4EC5\u652F\u6301\u672C\u5730\u6587\u4EF6\u7CFB\u7EDF vault\uFF09");
      return false;
    }
    try {
      const r = await this.client.sessionNew(basePath);
      this.sessionId = r.sessionId;
      this.wirePath = null;
      this.sessionBoot = "idle";
      this.sessionBootError = null;
      this.plugin.lastSessionId = r.sessionId;
      this.renderUsage(null);
      this.applyConfigOptions(r.configOptions ?? null);
      this.syncCliMode();
      await this.applyModelPreference();
      return true;
    } catch (e) {
      this.handleSessionError(e);
      return false;
    }
  }
  vaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (typeof adapter.getBasePath === "function") return adapter.getBasePath();
    return null;
  }
  /**
   * 应用模型偏好：手动选择（settings.model）优先，否则默认模型（defaultModel，默认 K3）。
   * 归一化接受完整 ID / 显示名 / 末段短名；无法识别的值不下发（避免每会话重复失败）。
   * 所有会话建立/恢复路径（session/new、session/load、restore）都必须走这里。
   */
  async applyModelPreference() {
    const wantRaw = this.plugin.settings.model || this.plugin.settings.defaultModel;
    if (!wantRaw || !this.modelOptions || !this.sessionId) return;
    const norm = normalizeModelInput(wantRaw, this.modelOptions, "");
    if (!norm.recognized) {
      console.warn(`[kimidian] \u6A21\u578B\u503C\u65E0\u6CD5\u8BC6\u522B\uFF0C\u5DF2\u8DF3\u8FC7\u4E0B\u53D1: ${wantRaw}`);
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
      console.warn("[kimidian] \u8BBE\u7F6E\u6A21\u578B\u5931\u8D25:", e);
    }
  }
  applyConfigOptions(opts) {
    if (!opts || opts.length === 0) return;
    const m = pickModelOption(opts);
    if (m) {
      this.modelOptions = m;
      const optsJson = JSON.stringify(m.options ?? []);
      if (optsJson !== JSON.stringify(this.plugin.settings.lastModelOptions)) {
        this.plugin.settings.lastModelOptions = (m.options ?? []).map((o) => ({
          value: o.value,
          name: o.name
        }));
        void this.plugin.saveSettings();
      }
    }
    const ef = pickThinkingOption(opts);
    if (ef) this.effortOptions = ef;
    this.renderStatus();
  }
  // ================= 发送消息 =================
  async sendMessage() {
    const raw = this.inputEl.value.trim();
    if (this.busy) return;
    if (!raw && this.pending.length === 0 && this.attachments.length === 0) return;
    if (!await this.ensureConnected()) return;
    if (!await this.ensureSession()) return;
    const text = raw ? this.stripAttachmentTokens(raw) : "";
    this.lastUserText = text || raw || "\u9644\u4EF6";
    this.inputEl.value = "";
    const attachNames = [
      ...this.attachments.map((a) => a.path),
      ...this.pending.map((p) => p.name)
    ];
    this.renderUserMsg(raw || `\uFF08\u53D1\u9001\u9644\u4EF6\uFF1A${attachNames.join("\u3001")}\uFF09`);
    this.forceScrollToBottom();
    const ctx = await this.buildContextBlocks();
    const parts = [];
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
    const blocks = [
      { type: "text", text: parts.join("\n\n") || "\uFF08\u89C1\u9644\u4EF6\u56FE\u7247\uFF09" }
    ];
    for (const p of this.pending) {
      if (p.kind === "image") {
        blocks.push({ type: "image", data: p.dataBase64, mimeType: p.mimeType });
      }
    }
    this.setBusy(true);
    this.beginAssistantTurn();
    this.armWaitIndicator();
    const sid = this.sessionId;
    try {
      const result = await this.client.prompt(sid, blocks);
      this.hideWaitIndicator();
      if (this.sessionId !== sid) return;
      this.attachments = [];
      this.pending = [];
      this.renderChips();
      this.endAssistantTurn();
      this.setBusy(false);
      this.persistSessionMeta();
      this.refreshUsage(1500);
      if (result.stopReason === "cancelled") {
        this.renderSystemMsg("\u5DF2\u505C\u6B62\u3002");
      } else if (result.stopReason !== "end_turn") {
        this.renderSystemMsg(`\uFF08\u672C\u8F6E\u7ED3\u675F\u539F\u56E0\uFF1A${result.stopReason}\uFF09`);
      }
    } catch (e) {
      this.hideWaitIndicator();
      if (this.sessionId !== sid) return;
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
  stripAttachmentTokens(text) {
    return text.replace(/@\[\[[^\]]+\]\]/g, "").trim();
  }
  /** 构造上下文 XML：活动笔记 + @ 引用笔记/文件夹 */
  async buildContextBlocks() {
    const parts = [];
    if (this.plugin.settings.attachActiveNote) {
      const f = this.app.workspace.getActiveFile();
      if (f && f.extension === "md" && this.activeNoteExcludedPath !== f.path && !this.attachments.some((a) => a.path === f.path)) {
        parts.push(`<active-note path="${f.path}" />`);
      }
    }
    const base = this.vaultBasePath();
    for (const a of this.attachments) {
      const abs = base ? `${base}/${a.path}` : a.path;
      if (a.folder) {
        parts.push(
          `<folder path="${abs}">
\u8BE5\u6587\u4EF6\u5939\u4E0B\u7684 Markdown \u7B14\u8BB0\uFF08\u6309\u9700\u8BFB\u53D6\uFF09\uFF1A
${this.listFolderNotes(a.path)}
</folder>`
        );
        continue;
      }
      try {
        let content = await this.app.vault.adapter.read(a.path);
        let truncated = false;
        if (content.length > MAX_ATTACH_CHARS) {
          content = content.slice(0, MAX_ATTACH_CHARS);
          truncated = true;
        }
        parts.push(
          `<file path="${abs}">
${content}${truncated ? "\n\u2026\uFF08\u5185\u5BB9\u8FC7\u957F\uFF0C\u5DF2\u622A\u65AD\uFF09" : ""}
</file>`
        );
      } catch (e) {
        console.warn("[kimidian] \u8BFB\u53D6\u9644\u4EF6\u5931\u8D25:", a.path, e);
      }
    }
    return parts.join("\n");
  }
  /** 递归列出文件夹内的 Markdown 笔记（vault 相对路径，每行一条） */
  listFolderNotes(folderPath) {
    const root = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(root instanceof import_obsidian.TFolder)) return "\uFF08\u6587\u4EF6\u5939\u4E0D\u5B58\u5728\uFF09";
    const out = [];
    const walk = (folder) => {
      for (const c of folder.children) {
        if (c instanceof import_obsidian.TFolder) walk(c);
        else if (c instanceof import_obsidian.TFile && c.extension === "md") out.push(c.path);
      }
    };
    walk(root);
    return out.length > 0 ? out.map((p) => `- ${p}`).join("\n") : "\uFF08\u7A7A\u6587\u4EF6\u5939\uFF09";
  }
  cancelTurn() {
    if (this.sessionId) this.client.cancel(this.sessionId);
    this.resolvePendingPermission({ outcome: "cancelled" });
    this.hideWaitIndicator();
  }
  // ================= 等待模型响应指示 =================
  /** 撤掉等待指示 + 清计时器（收到 chunk / 轮次结束 / 取消 / 出错时调用） */
  hideWaitIndicator() {
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
  armWaitIndicator() {
    if (this.replaying) return;
    if (this.waitTimer !== null) window.clearTimeout(this.waitTimer);
    if (this.waitSlowTimer !== null) window.clearTimeout(this.waitSlowTimer);
    this.waitTimer = window.setTimeout(() => {
      this.waitTimer = null;
      this.showWaitIndicator("\u6B63\u5728\u7B49\u5F85\u6A21\u578B\u54CD\u5E94\u2026");
    }, this.waitDelayMs);
    this.waitSlowTimer = window.setTimeout(() => {
      this.waitSlowTimer = null;
      this.showWaitIndicator("\u6A21\u578B\u54CD\u5E94\u8F83\u6162\uFF0C\u4ECD\u5728\u7B49\u5F85\u2026\uFF08\u53EF\u70B9\u505C\u6B62\u53D6\u6D88\uFF09");
    }, this.waitSlowMs);
  }
  /** 显示/更新等待指示（低调小字 + 呼吸点，区别于思考块） */
  showWaitIndicator(text) {
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
  onToolActivityStart(tc) {
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
    const short = loc ? loc.replace(/\\/g, "/").split("/").pop() ?? "" : "";
    const name = tc.title ?? tc.kind ?? "\u5DE5\u5177";
    this.showWaitIndicator(`\u6B63\u5728\u6267\u884C\uFF1A${name}${short ? ` ${short}` : ""}`);
  }
  /** 工具终态：全部完成后撤掉执行指示，重新等模型输出（回放忽略） */
  onToolActivityEnd(tc) {
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
  selectionActiveInMessages() {
    return selectionInfoIn(this.messagesEl, window.getSelection()) !== null;
  }
  showSelCopyBtn(rect) {
    if (!this.selCopyBtn) {
      const btn = this.contentEl.createDiv({ cls: "kimidian-sel-copy" });
      (0, import_obsidian.setIcon)(btn, "copy");
      btn.createSpan({ text: " \u590D\u5236" });
      btn.onmousedown = (e) => e.preventDefault();
      btn.onclick = () => void this.copySelectedText();
      this.selCopyBtn = btn;
    }
    const pos = selCopyPos(rect, this.contentEl.getBoundingClientRect(), {
      width: 64,
      height: 26
    });
    this.selCopyBtn.style.left = `${pos.left}px`;
    this.selCopyBtn.style.top = `${pos.top}px`;
  }
  hideSelCopyBtn() {
    if (this.selCopyBtn) {
      this.selCopyBtn.remove();
      this.selCopyBtn = null;
    }
    this.selCopyText = "";
  }
  /** 点击浮层：复制选中文字（用缓存值，点击时选区可能已变化） */
  async copySelectedText() {
    const t = this.selCopyText;
    if (!t) return;
    try {
      await writeClipboardText(t);
      const btn = this.selCopyBtn;
      if (btn) {
        btn.empty();
        (0, import_obsidian.setIcon)(btn, "check");
        btn.createSpan({ text: " \u5DF2\u590D\u5236" });
      }
      window.getSelection()?.removeAllRanges();
      window.setTimeout(() => this.hideSelCopyBtn(), 900);
    } catch (e) {
      new import_obsidian.Notice(`\u590D\u5236\u5931\u8D25\uFF1A${e.message}`);
    }
  }
  /** 选区结束后补做被推迟的流式渲染（正文 + 思考） */
  flushStreamRender() {
    this.deferredStreamRender = false;
    if (this.streamEl && this.streamText) {
      const el = this.streamEl;
      const md = this.streamText;
      el.empty();
      void import_obsidian.MarkdownRenderer.render(this.app, md, el, "", this).then(
        () => this.scrollToBottom()
      );
    }
    if (this.thoughtBodyEl && this.thoughtText) {
      this.thoughtBodyEl.setText(this.thoughtText);
    }
  }
  // ================= session/update 流式渲染 =================
  handleSessionUpdate(n) {
    try {
      this.handleSessionUpdateInner(n);
    } catch (e) {
      console.error(
        `[kimidian] \u6E32\u67D3 session/update \u5931\u8D25\uFF08${n?.update?.sessionUpdate}\uFF09:`,
        e
      );
      if (!this.renderErrorNoticed) {
        this.renderErrorNoticed = true;
        new import_obsidian.Notice(
          `Kimidian \u6E32\u67D3\u51FA\u9519\uFF1A${e?.message ?? String(e)}\uFF08\u8BE6\u89C1\u63A7\u5236\u53F0\uFF09`,
          1e4
        );
      }
    }
  }
  handleSessionUpdateInner(n) {
    if (n.sessionId !== this.sessionId) return;
    const u = n.update;
    if (this.replaying && /^(user_message_chunk|agent_message_chunk|agent_thought_chunk|tool_call|tool_call_update)$/.test(
      u.sessionUpdate
    )) {
      this.lastReplayChunkAt = Date.now();
    }
    const chunkText = (x) => {
      const c = x.content;
      return c && c.type === "text" ? c.text : "";
    };
    if (/^(user_message_chunk|agent_message_chunk|agent_thought_chunk)$/.test(
      u.sessionUpdate
    )) {
      this.hideWaitIndicator();
      this.armWaitIndicator();
    }
    switch (u.sessionUpdate) {
      case "user_message_chunk": {
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
        this.renderToolCall(u);
        this.onToolActivityStart(u);
        break;
      case "tool_call_update": {
        const tu = u;
        this.updateToolCall(tu);
        this.onToolActivityEnd(tu);
        break;
      }
      case "config_option_update":
        this.applyConfigOptions(
          u.configOptions ?? null
        );
        break;
      default:
        break;
    }
  }
  /** 一轮助手输出开始（新 prompt 时调用） */
  beginAssistantTurn() {
    this.streamEl = null;
    this.streamText = "";
    this.thoughtEl = null;
    this.thoughtText = "";
    this.toolBlocks.clear();
    this.curAssistantEntry = null;
    this.curThoughtEntry = null;
    this.toolEntries.clear();
  }
  endAssistantTurn() {
    this.beginAssistantTurn();
  }
  currentMsgContainer() {
    if (!this.streamEl) {
      const wrap = this.messagesEl.createDiv({
        cls: "kimidian-msg kimidian-msg-assistant"
      });
      this.streamEl = wrap.createDiv({ cls: "kimidian-msg-body" });
      this.streamText = "";
    }
    return this.streamEl;
  }
  appendAssistantText(text) {
    if (!this.streamEl || this.streamEl.dataset.sealed === "1") {
      const wrap = this.messagesEl.createDiv({
        cls: "kimidian-msg kimidian-msg-assistant"
      });
      this.streamEl = wrap.createDiv({ cls: "kimidian-msg-body" });
      this.streamText = "";
      const entry = {
        kind: "assistant",
        text: "",
        ts: Date.now(),
        tsEst: this.replaying ? true : void 0
      };
      this.curAssistantEntry = entry;
      this.logPush(entry);
      this.addCopyBtn(wrap, () => entry.text);
      this.renderMsgTs(wrap, entry);
    }
    this.streamText += text;
    if (this.curAssistantEntry) this.curAssistantEntry.text = this.streamText;
    if (this.selectionActiveInMessages()) {
      this.deferredStreamRender = true;
      return;
    }
    const el = this.streamEl;
    const md = this.streamText;
    el.empty();
    void import_obsidian.MarkdownRenderer.render(this.app, md, el, "", this).then(() => {
      this.scrollToBottom();
    });
    this.scrollToBottom();
  }
  appendThoughtText(text) {
    if (!this.thoughtEl) {
      const d = this.messagesEl.createEl("details", {
        cls: "kimidian-thought"
      });
      d.createEl("summary", { text: "\u601D\u8003\u8FC7\u7A0B" });
      this.thoughtBodyEl = d.createDiv({ cls: "kimidian-thought-body" });
      this.thoughtEl = d;
      this.thoughtText = "";
      this.curThoughtEntry = { kind: "thought", text: "", ts: Date.now() };
      this.logPush(this.curThoughtEntry);
      if (this.streamEl) this.streamEl.dataset.sealed = "1";
    }
    this.thoughtText += text;
    if (this.curThoughtEntry) this.curThoughtEntry.text = this.thoughtText;
    if (this.selectionActiveInMessages()) {
      this.deferredStreamRender = true;
      return;
    }
    if (this.thoughtBodyEl) this.thoughtBodyEl.setText(this.thoughtText);
    this.scrollToBottom();
  }
  renderToolCall(tc) {
    if (!tc.toolCallId || this.toolBlocks.has(tc.toolCallId)) {
      if (tc.toolCallId) this.updateToolCall(tc);
      return;
    }
    if (this.streamEl) this.streamEl.dataset.sealed = "1";
    const d = this.messagesEl.createEl("details", {
      cls: "kimidian-tool"
    });
    const summary = d.createEl("summary", { cls: "kimidian-tool-summary" });
    const icon = summary.createSpan({ cls: "kimidian-tool-icon" });
    (0, import_obsidian.setIcon)(icon, "wrench");
    const title = summary.createSpan({ cls: "kimidian-tool-title" });
    title.setText(tc.title ?? tc.kind ?? "\u5DE5\u5177\u8C03\u7528");
    const status = summary.createSpan({ cls: "kimidian-tool-status" });
    const body = d.createDiv({ cls: "kimidian-tool-body" });
    const block = { el: d, titleEl: title, statusEl: status, bodyEl: body };
    this.toolBlocks.set(tc.toolCallId, block);
    const entry = {
      kind: "tool",
      tool: { ...tc }
    };
    this.toolEntries.set(tc.toolCallId, entry);
    this.logPush(entry);
    this.updateToolCall(tc);
    this.scrollToBottom();
  }
  updateToolCall(tc) {
    const entry = this.toolEntries.get(tc.toolCallId);
    if (entry) {
      for (const [k, v] of Object.entries(tc)) {
        if (v !== void 0) {
          entry.tool[k] = v;
        }
      }
    }
    const b = this.toolBlocks.get(tc.toolCallId);
    if (!b) {
      this.renderToolCall(tc);
      return;
    }
    if (tc.title) b.titleEl.setText(tc.title);
    const st = tc.status ?? "in_progress";
    const label = st === "completed" ? "\u5B8C\u6210" : st === "failed" ? "\u5931\u8D25" : st === "pending" ? "\u7B49\u5F85" : "\u6267\u884C\u4E2D";
    b.statusEl.setText(label);
    b.statusEl.dataset.status = st;
    const paths = (tc.locations ?? []).map((l) => l.path).filter(Boolean);
    if (paths.length > 0) {
      const p = b.bodyEl.createDiv({ cls: "kimidian-tool-path" });
      p.setText(paths.join("\n"));
    }
    for (const c of tc.content ?? []) {
      if (c.type === "content" && c.text) {
        b.bodyEl.createEl("pre", {
          cls: "kimidian-tool-output",
          text: c.text.slice(0, 4e3)
        });
      } else if (c.type === "diff" && c.path) {
        b.bodyEl.createEl("pre", {
          cls: "kimidian-tool-diff",
          text: `--- ${c.path}
${(c.newText ?? "").slice(0, 3e3)}`
        });
      }
    }
    this.scrollToBottom();
  }
  // ================= 权限模式（盾牌按钮 + 菜单） =================
  get permissionMode() {
    return this.plugin.settings.permissionMode;
  }
  /** 刷新盾牌按钮：模式文案、橙色高亮（非默认）、pending 角标 */
  updateShield() {
    if (!this.shieldBtn) return;
    const mode = this.permissionMode;
    this.shieldLabel.setText(PERMISSION_MODE_LABELS[mode]);
    this.shieldBtn.classList.toggle("is-active", mode !== "ask");
    this.shieldBtn.classList.toggle("has-pending", this.pendingPermissions > 0);
    this.shieldBadge.classList.toggle("is-visible", this.pendingPermissions > 0);
    if (this.pendingPermissions > 0) {
      this.shieldBadge.setText(String(this.pendingPermissions));
    }
  }
  /** 弹出权限模式菜单 */
  showPermissionMenu(e) {
    const menu = new import_obsidian.Menu();
    const modes = ["ask", "smart", "yolo"];
    const descs = {
      ask: "\u6BCF\u4E2A\u5DE5\u5177\u8C03\u7528\u90FD\u9700\u624B\u52A8\u6279\u51C6",
      smart: "\u53EA\u8BFB\u5DE5\u5177\u81EA\u52A8\u5141\u8BB8\uFF0C\u5199/\u5220/\u6267\u884C\u4ECD\u8BE2\u95EE",
      yolo: "\u4E0D\u518D\u8BE2\u95EE\uFF08\u6709\u98CE\u9669\uFF09"
    };
    for (const m of modes) {
      menu.addItem(
        (item) => item.setTitle(PERMISSION_MODE_LABELS[m]).setIcon(m === "yolo" ? "zap" : m === "smart" ? "shield-check" : "shield").setChecked(this.permissionMode === m).onClick(() => void this.setPermissionMode(m))
      );
      menu.addItem((item) => {
        item.setTitle(`    ${descs[m]}`).setDisabled(true);
      });
    }
    menu.showAtMouseEvent(e);
  }
  /** 切换权限模式：持久化 + 刷新按钮 + 同步 CLI 原生 mode（双保险） */
  async setPermissionMode(mode) {
    this.plugin.settings.permissionMode = mode;
    await this.plugin.saveSettings();
    this.updateShield();
    this.syncCliMode();
    new import_obsidian.Notice(`\u6743\u9650\u6A21\u5F0F\u5DF2\u5207\u6362\uFF1A${PERMISSION_MODE_LABELS[mode]}`);
  }
  /** 把当前模式同步给 kimi CLI（configOptions 里有 mode：default/plan/auto/yolo） */
  syncCliMode() {
    if (!this.sessionId || !this.client.ready) return;
    this.client.setConfigOption(this.sessionId, "mode", cliModeFor(this.permissionMode)).catch((e) => console.warn("[kimidian] \u540C\u6B65 CLI mode \u5931\u8D25\uFF08\u5FFD\u7565\uFF09", e));
  }
  // ================= 权限请求 =================
  async handlePermissionRequest(params) {
    const mode = this.permissionMode;
    const granted = new Set(this.plugin.settings.grantedAlwaysTools);
    const key = toolKeyOf(params.toolCall ?? {});
    const decision = decidePermission(mode, params.toolCall ?? {}, granted);
    if (decision === "auto-allow") {
      const opt = params.options.find((o) => o.kind === "allow_once") ?? KimiAcpClient.pickAllowOption(params.options);
      if (opt) {
        const reason = mode === "yolo" ? "\u5168\u90E8\u5141\u8BB8" : granted.has(key) ? "\u5DF2\u8BB0\u4F4F\u7684\u59CB\u7EC8\u5141\u8BB8" : "\u667A\u80FD\u653E\u884C\uFF08\u53EA\u8BFB\uFF09";
        this.renderSystemMsg(`\u{1F6E1} \u5DF2\u81EA\u52A8\u5141\u8BB8\uFF1A${params.toolCall?.title ?? key}\uFF08${reason}\uFF09`);
        return { outcome: "selected", optionId: opt.optionId };
      }
      return { outcome: "cancelled" };
    }
    this.pendingPermissions++;
    this.updateShield();
    return new Promise((resolve2) => {
      const done = (o) => {
        this.pendingPermissions = Math.max(0, this.pendingPermissions - 1);
        this.updateShield();
        this.pendingPermissionResolve = null;
        resolve2(o);
      };
      this.pendingPermissionResolve = done;
      const box = this.messagesEl.createDiv({ cls: "kimidian-permission" });
      const title = params.toolCall?.title ?? "\u5DE5\u5177\u8C03\u7528";
      const paths = (params.toolCall?.locations ?? []).map((l) => l.path).filter(Boolean).join("\n");
      box.createDiv({
        cls: "kimidian-permission-title",
        text: `Kimi \u8BF7\u6C42\u6267\u884C\uFF1A${title}`
      });
      if (paths) box.createEl("pre", { cls: "kimidian-permission-path", text: paths });
      const btnRow = box.createDiv({ cls: "kimidian-permission-btns" });
      const labelFor = (kind) => kind === "allow_always" ? "\u59CB\u7EC8\u5141\u8BB8" : kind === "allow_once" ? "\u5141\u8BB8\u4E00\u6B21" : kind === "reject_always" ? "\u59CB\u7EC8\u62D2\u7EDD" : "\u62D2\u7EDD";
      for (const opt of params.options) {
        const b = btnRow.createEl("button", {
          text: `${opt.name || labelFor(opt.kind)}`,
          cls: opt.kind.startsWith("allow") ? "kimidian-perm-allow" : "kimidian-perm-reject"
        });
        b.onclick = () => {
          box.remove();
          if (opt.kind === "allow_always" && !granted.has(key)) {
            this.plugin.settings.grantedAlwaysTools.push(key);
            void this.plugin.saveSettings();
            new import_obsidian.Notice(`\u5DF2\u8BB0\u4F4F\u300C\u59CB\u7EC8\u5141\u8BB8\u300D\uFF1A${key}`);
          }
          done({ outcome: "selected", optionId: opt.optionId });
        };
      }
      this.scrollToBottom();
    });
  }
  resolvePendingPermission(o) {
    const r = this.pendingPermissionResolve;
    this.pendingPermissionResolve = null;
    if (r) r(o);
  }
  // ================= 历史 =================
  /** 界面状态记忆：历史面板开合写入 data.json，重开视图时如实恢复 */
  persistUiState(historyOpen) {
    const st = this.plugin.settings;
    if (!st.uiState) st.uiState = { historyOpen };
    else st.uiState.historyOpen = historyOpen;
    void this.plugin.saveSettings();
  }
  async toggleHistory() {
    if (this.historyPanelEl) {
      this.historyPanelEl.remove();
      this.historyPanelEl = null;
      this.persistUiState(false);
      return;
    }
    if (!await this.ensureConnected()) return;
    this.persistUiState(true);
    const panel = this.contentEl.createDiv({ cls: "kimidian-history" });
    this.historyPanelEl = panel;
    panel.createDiv({ cls: "kimidian-history-loading", text: "\u52A0\u8F7D\u4F1A\u8BDD\u5217\u8868\u2026" });
    const base = this.vaultBasePath();
    try {
      const sessions = base ? await this.client.sessionList(base) : [];
      panel.empty();
      if (sessions.length === 0) {
        panel.createDiv({
          cls: "kimidian-history-empty",
          text: "\u5F53\u524D vault \u6682\u65E0\u5386\u53F2\u4F1A\u8BDD\u3002"
        });
        return;
      }
      sessions.sort(
        (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
      );
      const diagId = this.plugin.settings.diagSessionId;
      const visible = this.plugin.settings.hideDiagSession ? sessions.filter((s) => s.sessionId !== diagId) : sessions;
      if (visible.length === 0) {
        panel.createDiv({
          cls: "kimidian-history-empty",
          text: "\u5F53\u524D vault \u6682\u65E0\u5386\u53F2\u4F1A\u8BDD\uFF08\u8BCA\u65AD\u4F1A\u8BDD\u5DF2\u9690\u85CF\uFF09\u3002"
        });
        return;
      }
      for (const s of visible.slice(0, 50)) {
        const item = panel.createDiv({ cls: "kimidian-history-item" });
        const meta = this.plugin.settings.sessionMeta[s.sessionId];
        const isDiag = !!diagId && s.sessionId === diagId;
        const title = isDiag ? "\u{1F527} \u81EA\u6211\u8BCA\u65AD" : s.title ?? meta?.title ?? "\uFF08\u65E0\u6807\u9898\u4F1A\u8BDD\uFF09";
        item.createDiv({ cls: "kimidian-history-title", text: title });
        const time = s.updatedAt ? new Date(s.updatedAt).toLocaleString() : meta ? new Date(meta.updatedAt).toLocaleString() : "";
        const cwdShort = s.cwd ? s.cwd.replace(/\\/g, "/").split("/").pop() ?? "" : "";
        item.createDiv({
          cls: "kimidian-history-time",
          text: cwdShort ? `${time} \xB7 ${cwdShort}` : time
        });
        const del = item.createSpan({ cls: "kimidian-history-del", text: "\xD7" });
        del.title = "\u5220\u9664\u8BE5\u4F1A\u8BDD\u8BB0\u5F55";
        del.onclick = (ev) => {
          ev.stopPropagation();
          void this.deleteHistorySession(s, item);
        };
        item.onclick = () => void this.loadSession(s);
      }
    } catch (e) {
      panel.empty();
      if (e instanceof AuthRequiredError) {
        panel.createDiv({ text: "\u672A\u767B\u5F55\uFF0C\u8BF7\u5148\u5728\u7EC8\u7AEF\u8FD0\u884C kimi login\u3002" });
      } else {
        panel.createDiv({ text: `\u52A0\u8F7D\u5931\u8D25\uFF1A${e.message}` });
      }
    }
  }
  /**
   * 删除历史会话：移除 CLI 侧会话目录（sessions/<wd>/<sessionId>/）+ 本地元数据，
   * 并从面板移除对应条目。ACP 协议无 session/delete，只能直接删落盘文件。
   */
  async deleteHistorySession(s, itemEl) {
    const title = s.title ?? this.plugin.settings.sessionMeta?.[s.sessionId]?.title ?? "\uFF08\u65E0\u6807\u9898\u4F1A\u8BDD\uFF09";
    if (!window.confirm(`\u5220\u9664\u4F1A\u8BDD\u300C${title}\u300D\uFF1F
\u8BE5\u64CD\u4F5C\u4F1A\u5220\u9664 CLI \u4FA7\u7684\u4F1A\u8BDD\u8BB0\u5F55\uFF0C\u4E0D\u53EF\u6062\u590D\u3002`)) {
      return;
    }
    try {
      const root = this.sessionsRoot();
      for (const wd of await import_fs3.promises.readdir(root)) {
        const dir = path.join(root, wd, s.sessionId);
        try {
          if ((await import_fs3.promises.stat(dir)).isDirectory()) {
            await import_fs3.promises.rm(dir, { recursive: true, force: true });
          }
        } catch {
        }
      }
      const st = this.plugin.settings;
      if (st.sessionMeta) delete st.sessionMeta[s.sessionId];
      if (st.diagSessionId === s.sessionId) st.diagSessionId = null;
      await this.plugin.saveSettings();
      itemEl.remove();
      new import_obsidian.Notice("\u4F1A\u8BDD\u5DF2\u5220\u9664\u3002");
      if (this.historyPanelEl && !this.historyPanelEl.querySelector(".kimidian-history-item")) {
        this.historyPanelEl.createDiv({
          cls: "kimidian-history-empty",
          text: "\u5F53\u524D vault \u6682\u65E0\u5386\u53F2\u4F1A\u8BDD\u3002"
        });
      }
    } catch (e) {
      new import_obsidian.Notice(`\u5220\u9664\u4F1A\u8BDD\u5931\u8D25\uFF1A${e.message}`);
    }
  }
  async loadSession(s) {
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
      const loadingEl = this.messagesEl.createDiv({ cls: "kimidian-system" });
      loadingEl.setText("\u6B63\u5728\u6062\u590D\u4F1A\u8BDD\u2026");
      const result = await this.client.sessionLoad(s.sessionId, base);
      await this.waitForReplayQuiet();
      this.replaying = false;
      loadingEl.remove();
      if (this.sessionId !== s.sessionId) return;
      this.applyConfigOptions(result?.configOptions ?? null);
      await this.applyModelPreference();
      this.plugin.lastSessionId = s.sessionId;
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
  onInputKeydown(e) {
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
  currentAtToken() {
    const pos = this.inputEl.selectionStart ?? 0;
    const before = this.inputEl.value.slice(0, pos);
    const m = /(?:^|[\s，。])@([^\s@]*)$/.exec(before);
    if (!m) return null;
    return { start: pos - m[1].length - 1, query: m[1] };
  }
  updateSuggest() {
    const tok = this.currentAtToken();
    if (!tok) {
      this.closeSuggest();
      return;
    }
    const active = this.app.workspace.getActiveFile();
    const activeDir = active?.parent?.path ?? "";
    const rankOf = (f) => {
      if (active && f.path === active.path) return 0;
      if (activeDir && f.parent?.path === activeDir) return 1;
      return 2;
    };
    const query = tok.query.toLowerCase();
    const files = this.app.vault.getMarkdownFiles().filter((f) => this.fuzzyMatch(f.path.toLowerCase(), query)).sort((a, b) => rankOf(a) - rankOf(b) || a.path.localeCompare(b.path)).slice(0, 12);
    if (files.length === 0) {
      this.closeSuggest();
      return;
    }
    this.closeSuggest();
    const box = this.inputWrapEl.createDiv({ cls: "kimidian-suggest" });
    this.suggestEl = box;
    files.forEach((f, i) => {
      const item = box.createDiv({
        cls: "kimidian-suggest-item" + (i === 0 ? " is-active" : ""),
        text: f.path
      });
      item.dataset.path = f.path;
      item.onmousedown = (e) => {
        e.preventDefault();
        this.acceptSuggestion(f);
      };
    });
  }
  fuzzyMatch(text, query) {
    if (!query) return true;
    let ti = 0;
    for (const ch of query) {
      ti = text.indexOf(ch, ti);
      if (ti < 0) return false;
      ti++;
    }
    return true;
  }
  moveSuggest(delta) {
    if (!this.suggestEl) return;
    const items = Array.from(
      this.suggestEl.querySelectorAll(".kimidian-suggest-item")
    );
    const cur = items.findIndex((el) => el.classList.contains("is-active"));
    const next = (cur + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle("is-active", i === next));
    items[next]?.scrollIntoView({ block: "nearest" });
  }
  pickSuggest() {
    const active = this.suggestEl?.querySelector(
      ".kimidian-suggest-item.is-active"
    );
    const path2 = active?.dataset.path;
    if (!path2) return;
    const f = this.app.vault.getAbstractFileByPath(path2);
    if (f instanceof import_obsidian.TFile) this.acceptSuggestion(f);
  }
  acceptSuggestion(f) {
    const tok = this.currentAtToken();
    if (!tok) return;
    const pos = this.inputEl.selectionStart ?? 0;
    const before = this.inputEl.value.slice(0, tok.start);
    const after = this.inputEl.value.slice(pos);
    this.inputEl.value = `${before}${after}`;
    this.inputEl.selectionStart = this.inputEl.selectionEnd = before.length;
    this.addNoteRef(f.path);
    this.closeSuggest();
    this.inputEl.focus();
  }
  closeSuggest() {
    this.suggestEl?.remove();
    this.suggestEl = null;
  }
  renderChips() {
    this.chipsEl.empty();
    const af = this.app.workspace.getActiveFile();
    if (this.plugin.settings.attachActiveNote && af && af.extension === "md" && this.activeNoteExcludedPath !== af.path && !this.attachments.some((a) => a.path === af.path)) {
      const activeChip = this.chipsEl.createSpan({
        cls: "kimidian-chip kimidian-chip-active"
      });
      activeChip.createSpan({ text: `\u{1F4C4} ${af.path}` });
      activeChip.title = "\u5F53\u524D\u6253\u5F00\u7684\u7B14\u8BB0\uFF08\u81EA\u52A8\u9644\u5E26\uFF0C\u5207\u6362\u7B14\u8BB0\u81EA\u52A8\u8DDF\u968F\uFF09";
      const ax = activeChip.createSpan({ cls: "kimidian-chip-x", text: "\xD7" });
      ax.onclick = () => {
        this.activeNoteExcludedPath = af.path;
        this.renderChips();
      };
    }
    for (const a of this.attachments) {
      const chip = this.chipsEl.createSpan({ cls: "kimidian-chip" });
      chip.createSpan({ text: a.folder ? `\u{1F4C1} ${a.path}` : a.path });
      const x = chip.createSpan({ cls: "kimidian-chip-x", text: "\xD7" });
      x.onclick = () => {
        this.attachments = this.attachments.filter((t) => t !== a);
        this.renderChips();
      };
    }
    for (const p of this.pending) {
      const card = this.chipsEl.createSpan({
        cls: `kimidian-chip kimidian-attach-card kimidian-attach-${p.kind}`
      });
      if (p.kind === "image") {
        card.createEl("img", {
          cls: "kimidian-attach-thumb",
          attr: { src: `data:${p.mimeType};base64,${p.dataBase64}`, alt: p.name }
        });
      } else {
        card.createSpan({
          cls: "kimidian-attach-icon",
          text: p.kind === "text" ? "\u{1F4C4}" : "\u{1F4CE}"
        });
      }
      const label = p.kind === "binary" ? `${p.name}\uFF08\u5DF2\u5B58\u5165\u4ED3\u5E93\uFF09` : p.kind === "image" ? `${p.name} ${formatSize(p.sizeBytes)}` : p.name;
      card.createSpan({ cls: "kimidian-attach-name", text: label });
      const x = card.createSpan({ cls: "kimidian-chip-x", text: "\xD7" });
      x.onclick = () => {
        this.pending = this.pending.filter((t) => t !== p);
        this.renderChips();
      };
    }
  }
  // ================= 粘贴 / 拖拽附件 =================
  /** 粘贴：图片进待发送附件；剪贴板有文本时保留正常文本粘贴（图片优先但不冲突） */
  async onPaste(e) {
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
      const hasText = (e.clipboardData?.getData("text") ?? "").trim().length > 0;
      if (!hasText) e.preventDefault();
    }
  }
  /**
   * 拖拽落下：Obsidian 内部拖拽（文件列表/搜索等）的拖动数据不在 dataTransfer 文本里，
   * 而在 app.dragManager.draggable（未公开 API，社区插件通用做法），优先走它；
   * 再兼容 text 里的 [[链接]]/可解析路径；最后外部文件走 File 对象按扩展名分类处理。
   */
  async onDrop(e) {
    e.preventDefault();
    this.inputWrapEl.classList.remove("is-dragover");
    const dt = e.dataTransfer;
    if (!dt) return;
    let handled = false;
    for (const item of this.draggedVaultItems()) {
      if (await this.handleVaultEntry(item)) handled = true;
    }
    if (handled) return;
    const text = dt.getData("text") ?? "";
    const links = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => (m[1].split("|")[0] ?? "").trim()).filter((s) => s.length > 0);
    const candidates = links.length > 0 ? links : [text.trim()].filter((s) => s.length > 0);
    for (const c of candidates) {
      if (await this.addVaultRef(c)) handled = true;
    }
    if (handled) return;
    if (dt.files && dt.files.length > 0) {
      for (const f of Array.from(dt.files)) await this.addDroppedFile(f);
    }
  }
  /** 读取 Obsidian 拖拽管理器中正在拖动的 vault 文件/文件夹 */
  draggedVaultItems() {
    const dm = this.app.dragManager;
    const d = dm?.draggable;
    if (!d) return [];
    if (Array.isArray(d.files) && d.files.length > 0) return d.files;
    if (d.file) return [d.file];
    return [];
  }
  /**
   * vault 内部拖拽解析：按文本解析为 vault 条目后统一交给 handleVaultEntry。
   * 无法解析返回 false（交给外部文件分支）。
   */
  async addVaultRef(candidate) {
    const file = this.app.metadataCache.getFirstLinkpathDest(candidate, "") ?? this.app.vault.getAbstractFileByPath(candidate);
    if (file instanceof import_obsidian.TFolder || file instanceof import_obsidian.TFile) {
      return this.handleVaultEntry(file);
    }
    return false;
  }
  /**
   * vault 条目统一入口：笔记/文本 → @ 位置引用 chip（与 @ 补全同一机制）；
   * 文件夹 → 文件夹引用 chip；图片读字节、二进制引用原路径（保持原行为）。
   */
  async handleVaultEntry(file) {
    if (file instanceof import_obsidian.TFolder) {
      this.addNoteRef(file.path, true);
      new import_obsidian.Notice(`\u5DF2\u5F15\u7528\u6587\u4EF6\u5939\uFF1A${file.path}`);
      return true;
    }
    if (!(file instanceof import_obsidian.TFile)) return false;
    const kind = classifyFile(file.name);
    try {
      if (kind === "image") {
        const buf = await this.app.vault.adapter.readBinary(file.path);
        this.addImageBytes(file.name, imageMimeFor(file.name) ?? "image/png", new Uint8Array(buf));
      } else if (kind === "text") {
        this.addNoteRef(file.path);
      } else {
        this.pending.push({ kind: "binary", name: file.name, vaultPath: file.path });
        this.renderChips();
      }
      return true;
    } catch (e) {
      new import_obsidian.Notice(`\u8BFB\u53D6\u62D6\u5165\u6587\u4EF6\u5931\u8D25\uFF1A${e.message}`);
      return true;
    }
  }
  /** 把笔记/文件夹加入引用 chips（上下文发送时注入；输入框不放 token），拖拽与补全共用 */
  addNoteRef(refPath, folder = false) {
    if (!this.attachments.some((a) => a.path === refPath)) {
      this.attachments.push({ path: refPath, folder });
      this.renderChips();
    }
    this.inputEl.focus();
  }
  /** 外部文件（操作系统拖入）：按扩展名分类处理 */
  async addDroppedFile(f) {
    const kind = classifyFile(f.name);
    if (kind === "image") {
      const bytes = new Uint8Array(await f.arrayBuffer());
      this.addImageBytes(f.name, imageMimeFor(f.name) ?? f.type ?? "image/png", bytes);
    } else if (kind === "text") {
      this.pending.push({ kind: "text", name: f.name, content: await f.text() });
      this.renderChips();
    } else {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const vaultPath = `${BINARY_STORE_DIR}/${f.name}`;
      try {
        await this.ensureStoreDir();
        await this.app.vault.adapter.writeBinary(vaultPath, bytes.buffer);
        this.pending.push({ kind: "binary", name: f.name, vaultPath });
        this.renderChips();
      } catch (e) {
        new import_obsidian.Notice(`\u5B58\u5165\u9644\u4EF6\u5931\u8D25\uFF1A${e.message}`);
      }
    }
  }
  /** 图片字节 → 待发送附件（超 10MB 提示并拒绝） */
  addImageBytes(name, mimeType, bytes) {
    if (bytes.length > MAX_IMAGE_BYTES) {
      new import_obsidian.Notice(`\u56FE\u7247 ${name} \u8D85\u8FC7 10MB\uFF08${formatSize(bytes.length)}\uFF09\uFF0C\u5DF2\u62D2\u7EDD`);
      return;
    }
    this.pending.push({
      kind: "image",
      name,
      mimeType,
      dataBase64: bytesToBase64(bytes),
      sizeBytes: bytes.length
    });
    this.renderChips();
  }
  /** 确保二进制附件目录存在（逐级 mkdir，已存在则忽略） */
  async ensureStoreDir() {
    const adapter = this.app.vault.adapter;
    const parts = BINARY_STORE_DIR.split("/");
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      try {
        if (!await adapter.exists(cur)) await adapter.mkdir(cur);
      } catch {
      }
    }
  }
  /** 外部命令调用：把选中文本塞进输入框 */
  insertExternalText(text) {
    const cur = this.inputEl.value;
    this.inputEl.value = cur ? `${cur}
${text}` : text;
    this.inputEl.focus();
  }
  // ================= 消息日志（数据层） =================
  /** 追加消息条目（带上限）；DOM 渲染由各 render* 函数负责，日志只是状态 */
  logPush(entry) {
    this.msgLog.push(entry);
    if (this.msgLog.length > MSG_LOG_MAX) {
      this.msgLog.splice(0, this.msgLog.length - MSG_LOG_MAX);
    }
  }
  /**
   * 从消息日志重建 DOM（视图重挂载 / 面板切换后）。
   * 只渲染 DOM，不再回写日志（条目已在数组里）。
   */
  restoreMsgLog() {
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
          void import_obsidian.MarkdownRenderer.render(this.app, entry.text, body, "", this);
          break;
        }
        case "thought": {
          const d = this.messagesEl.createEl("details", { cls: "kimidian-thought" });
          d.createEl("summary", { text: "\u601D\u8003\u8FC7\u7A0B" });
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
  domRestoreTool(tool) {
    if (!tool.toolCallId) return;
    const d = this.messagesEl.createEl("details", { cls: "kimidian-tool" });
    const summary = d.createEl("summary", { cls: "kimidian-tool-summary" });
    const icon = summary.createSpan({ cls: "kimidian-tool-icon" });
    (0, import_obsidian.setIcon)(icon, "wrench");
    const title = summary.createSpan({ cls: "kimidian-tool-title" });
    const status = summary.createSpan({ cls: "kimidian-tool-status" });
    const body = d.createDiv({ cls: "kimidian-tool-body" });
    this.toolBlocks.set(tool.toolCallId, { el: d, titleEl: title, statusEl: status, bodyEl: body });
    this.updateToolCall(tool);
  }
  // ================= 渲染辅助 =================
  renderWelcome() {
    const w = this.messagesEl.createDiv({ cls: "kimidian-welcome" });
    w.createEl("div", {
      cls: "kimidian-welcome-title",
      text: "Kimi \u5DF2\u5C31\u7EEA"
    });
    w.createEl("div", {
      cls: "kimidian-welcome-sub",
      text: "\u5728\u4E0B\u65B9\u8F93\u5165\u95EE\u9898\uFF0CKimi \u53EF\u4EE5\u8BFB\u53D6\u3001\u641C\u7D22\u548C\u4FEE\u6539\u4F60\u7684\u7B14\u8BB0\u3002\u8F93\u5165 @ \u53EF\u4EE5\u5F15\u7528\u7B14\u8BB0\u3002"
    });
  }
  /** 气泡右上角复制按钮：hover 浮现，复制该消息的原始 Markdown 文本 */
  addCopyBtn(wrap, getText) {
    const btn = wrap.createSpan({ cls: "kimidian-copy-btn" });
    (0, import_obsidian.setIcon)(btn, "copy");
    btn.title = "\u590D\u5236\u539F\u6587\uFF08Markdown\uFF09";
    btn.onclick = () => {
      const t = getText();
      if (!t) {
        new import_obsidian.Notice("\u6CA1\u6709\u53EF\u590D\u5236\u7684\u5185\u5BB9");
        return;
      }
      void writeClipboardText(t).then(() => {
        btn.empty();
        (0, import_obsidian.setIcon)(btn, "check");
        window.setTimeout(() => {
          btn.empty();
          (0, import_obsidian.setIcon)(btn, "copy");
        }, 1200);
      }).catch((e) => new import_obsidian.Notice(`\u590D\u5236\u5931\u8D25\uFF1A${e.message}`));
    };
  }
  /** 气泡右下角的小号时间戳；估算时间（恢复时的时间）淡化显示 */
  renderMsgTs(wrap, entry) {
    if (!entry.ts) return;
    const el = wrap.createSpan({
      cls: "kimidian-msg-ts" + (entry.tsEst ? " kimidian-msg-ts-est" : "")
    });
    el.setText(formatMsgTime(entry.ts));
    if (entry.tsEst) el.title = "\u6062\u590D\u65F6\u7684\u65F6\u95F4\uFF08\u539F\u59CB\u65F6\u95F4\u672A\u77E5\uFF09";
  }
  renderUserMsg(raw) {
    const disp = formatUserDisplay(raw);
    if (!disp.text && disp.refs.length === 0) return;
    const entry = {
      kind: "user",
      text: disp.text,
      refs: disp.refs,
      ts: Date.now(),
      tsEst: this.replaying ? true : void 0
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
  renderRefChips(wrap, refs) {
    if (refs.length === 0) return;
    const row = wrap.createDiv({ cls: "kimidian-ref-chips" });
    for (const r of refs) {
      const prefix = r.kind === "note" ? "\u{1F4CE} \u5F53\u524D\u7B14\u8BB0\uFF1A" : r.kind === "file" ? "\u{1F4C4} \u5F15\u7528\uFF1A" : "\u{1F4CE} \u9644\u4EF6\uFF1A";
      const chip = row.createSpan({ cls: "kimidian-ref-chip" });
      chip.setText(`${prefix}${r.label}`);
      chip.title = r.path;
    }
  }
  renderSystemMsg(text) {
    this.logPush({ kind: "system", text });
    const el = this.messagesEl.createDiv({ cls: "kimidian-system" });
    el.setText(text);
    this.scrollToBottom();
  }
  /**
   * 富错误条：展示 JSON-RPC 错误码 / message / data / 最近 stderr，
   * 避免"Internal error"四个字的死胡同。提供「重试」和「重连后重试」。
   */
  renderErrorWithRetry(e) {
    const err = e;
    const message = err?.message ?? String(e);
    this.logPush({ kind: "error", text: `\u51FA\u9519\u4E86\uFF1A${message}` });
    const box = this.messagesEl.createDiv({ cls: "kimidian-error" });
    box.createDiv({ cls: "kimidian-error-title", text: `\u51FA\u9519\u4E86\uFF1A${message}` });
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
        text: "\u{1F4A1} \u672A\u627E\u5230 Git Bash\u2014\u2014Kimi CLI \u5728 Windows \u4E0A\u8FD0\u884C\u9700\u8981\u5B83\u3002\u63D2\u4EF6\u4F1A\u81EA\u52A8\u63A2\u6D4B Git for Windows \u4E0E kimi-desktop \u6346\u7ED1\u7684 Git Bash \u5E76\u6CE8\u5165\uFF1B\u5982\u679C\u4ECD\u5931\u8D25\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u7684\u300CGit Bash \u8DEF\u5F84\u300D\u4E2D\u624B\u52A8\u6307\u5B9A bash.exe\u3002"
      });
      const probe = this.client.getBashProbe();
      if (probe && probe.candidates.length > 0) {
        const d = hint.createEl("details", { cls: "kimidian-error-details" });
        d.createEl("summary", { text: "\u63A2\u6D4B\u8FC7\u7684\u8DEF\u5F84" });
        const pre = d.createEl("pre");
        pre.setText(
          probe.candidates.map((c) => `${c.exists ? "\u2705" : "\u274C"} ${c.path}\uFF08${c.source}\uFF09`).join("\n") + `
\u6700\u7EC8\u6CE8\u5165\uFF1A${probe.found ?? "<\u65E0>"}${probe.fromEnv ? "\uFF08\u6765\u81EA\u7528\u6237\u73AF\u5883\u53D8\u91CF\uFF09" : ""}`
        );
      }
    }
    if (err?.code !== void 0) {
      box.createDiv({
        cls: "kimidian-error-code",
        text: `JSON-RPC \u9519\u8BEF\u7801\uFF1A${err.code}`
      });
    }
    if (err?.data !== void 0 && err.data !== null) {
      const d = box.createEl("details", { cls: "kimidian-error-details" });
      d.createEl("summary", { text: "\u9519\u8BEF\u8BE6\u60C5\uFF08error.data\uFF09" });
      d.createEl("pre", {
        text: (() => {
          try {
            return JSON.stringify(err.data, null, 2);
          } catch {
            return String(err.data);
          }
        })()
      });
    }
    const stderrTail = this.client.getStderrTail(15);
    if (stderrTail) {
      const d = box.createEl("details", { cls: "kimidian-error-details" });
      d.createEl("summary", { text: "Kimi CLI \u65E5\u5FD7\uFF08stderr \u6700\u8FD1 15 \u884C\uFF09" });
      d.createEl("pre", { text: stderrTail });
    }
    const btnRow = box.createDiv({ cls: "kimidian-error-btns" });
    const retryBtn = btnRow.createEl("button", { text: "\u91CD\u8BD5" });
    retryBtn.onclick = () => {
      box.remove();
      if (this.lastUserText) {
        this.inputEl.value = this.lastUserText;
        void this.sendMessage();
      }
    };
    const reconnectBtn = btnRow.createEl("button", { text: "\u91CD\u8FDE\u540E\u91CD\u8BD5" });
    reconnectBtn.title = "\u6740\u6389\u5E76\u91CD\u542F kimi acp \u5B50\u8FDB\u7A0B\uFF08\u53EF\u89E3\u51B3\u767B\u5F55\u540E\u65E7\u8FDB\u7A0B\u72B6\u6001\u8FC7\u671F\u7B49\u95EE\u9898\uFF09";
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
  handleSessionError(e) {
    this.renderStatus();
    if (e instanceof AuthRequiredError) {
      const box = this.messagesEl.createDiv({ cls: "kimidian-error" });
      box.createDiv({
        text: "\u5C1A\u672A\u767B\u5F55 Kimi\u3002\u8BF7\u5728\u7EC8\u7AEF\u4E2D\u8FD0\u884C `kimi login` \u5B8C\u6210\u767B\u5F55\uFF0C\u7136\u540E\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u91CD\u8BD5\u3002"
      });
      const btn = box.createEl("button", { text: "\u6211\u5DF2\u767B\u5F55\uFF0C\u91CD\u8BD5" });
      btn.onclick = () => {
        box.remove();
        void this.reconnect().then(() => void this.newSession());
      };
    } else {
      this.renderErrorWithRetry(e);
    }
  }
  /** 供插件在连接状态变化时刷新状态栏 */
  refreshStatus() {
    this.renderStatus();
  }
  setBusy(busy) {
    this.busy = busy;
    this.sendBtn.setText(busy ? "\u505C\u6B62" : "\u53D1\u9001");
    this.sendBtn.classList.toggle("is-stop", busy);
    this.renderStatus();
  }
  renderStatus() {
    if (!this.statusModelEl) return;
    if (!this.sessionId && this.sessionBoot === "creating") {
      this.statusModelEl.empty();
      this.statusModelEl.setText("\u6A21\u578B\uFF1A\u52A0\u8F7D\u4E2D\u2026");
    } else if (!this.sessionId && this.sessionBoot === "failed") {
      this.statusModelEl.empty();
      this.statusModelEl.createSpan({
        cls: "kimidian-status-label",
        text: `\u6A21\u578B\uFF1A${this.sessionBootError ?? "\u521B\u5EFA\u5931\u8D25"}`
      });
      const retry = this.statusModelEl.createEl("a", {
        cls: "kimidian-status-retry",
        text: "\u91CD\u8BD5"
      });
      retry.title = "\u91CD\u65B0\u521B\u5EFA\u4F1A\u8BDD";
      retry.onclick = () => void this.bootstrap();
    } else {
      const wantId = this.plugin.settings.model || this.plugin.settings.defaultModel;
      const wantName = this.plugin.settings.lastModelOptions.find((o) => o.value === wantId)?.name ?? "\u9ED8\u8BA4\u6A21\u578B";
      this.renderConfigSelect(
        this.statusModelEl,
        this.modelOptions,
        "model",
        "\u6A21\u578B",
        wantName
      );
    }
    this.renderConfigSelect(
      this.statusEffortEl,
      this.effortOptions,
      this.effortOptions?.id ?? "thinking",
      "\u601D\u8003",
      null
    );
    const stateText = {
      disconnected: "\u672A\u8FDE\u63A5",
      starting: "\u8FDE\u63A5\u4E2D\u2026",
      connected: this.busy ? "\u5DF2\u8FDE\u63A5 \xB7 \u751F\u6210\u4E2D" : "\u5DF2\u8FDE\u63A5",
      auth_required: "\u672A\u767B\u5F55",
      error: "\u8FDE\u63A5\u9519\u8BEF"
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
  refreshUsage(delayMs) {
    if (this.usageTimer !== null) window.clearTimeout(this.usageTimer);
    this.usageTimer = window.setTimeout(() => {
      this.usageTimer = null;
      void this.loadUsage();
    }, delayMs);
  }
  /** CLI 会话日志根目录：优先从 cliPath 推导（…/.kimi-code/bin/kimi.exe → …/.kimi-code/sessions） */
  sessionsRoot() {
    const cli = this.plugin.settings.cliPath;
    if (cli) {
      const cand = path.join(path.dirname(path.dirname(cli)), "sessions");
      return cand;
    }
    return path.join(os.homedir(), ".kimi-code", "sessions");
  }
  /** 按 sessionId 在 sessions 根下定位 wire.jsonl（目录名含工作区哈希，只能扫描匹配） */
  async locateWirePath(sessionId) {
    if (this.wirePath) return this.wirePath;
    try {
      const root = this.sessionsRoot();
      for (const wd of await import_fs3.promises.readdir(root)) {
        const p = path.join(root, wd, sessionId, "agents", "main", "wire.jsonl");
        try {
          await import_fs3.promises.access(p);
          this.wirePath = p;
          return p;
        } catch {
        }
      }
    } catch {
    }
    return null;
  }
  /**
   * 回放时间回填：session/load 恢复的消息在渲染时只有"恢复当时"的估算时间，
   * 这里从 wire.jsonl 读取每轮消息的落盘时间按序对位回填，有改动则重渲染。
   * wire 读不到/对不上位的条目保留估算标记（淡化显示）。
   */
  async backfillReplayTimes() {
    if (!this.sessionId) return;
    const p = await this.locateWirePath(this.sessionId);
    if (!p) return;
    try {
      const raw = await import_fs3.promises.readFile(p, "utf8");
      const times = parseWireMsgTimes(raw);
      if (backfillEntryTimes(this.msgLog, times, Date.now())) {
        this.restoreMsgLog();
      }
    } catch {
    }
  }
  async loadUsage() {
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
      const fh = await import_fs3.promises.open(p, "r");
      let tailText;
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
      const full = await import_fs3.promises.readFile(p, "utf8");
      const chars = estimateWireChars(full);
      const fullParsed = parseWireUsage(full);
      this.renderUsage(
        computeEstimatedUsage({
          ...chars,
          maxTokens: parsed.maxTokens ?? fullParsed.maxTokens,
          model: fullParsed.usage?.model ?? null
        })
      );
    } catch {
      this.renderUsage(null);
    }
  }
  /** 渲染用量：无数据时显示「Ctx —」；估算值带「约」字；50%/80% 两档变色提醒 */
  renderUsage(u) {
    if (!this.statusUsageEl) return;
    const el = this.statusUsageEl;
    el.classList.remove("is-warn", "is-danger");
    if (!u) {
      el.setText(this.sessionId ? "Ctx \u2014" : "");
      el.title = this.sessionId ? "\u4E0A\u4E0B\u6587\u7528\u91CF\uFF1A\u672C\u8F6E\u7ED3\u675F\u540E\u7EDF\u8BA1\uFF08\u6570\u636E\u6765\u6E90\uFF1ACLI \u4F1A\u8BDD\u65E5\u5FD7\uFF09" : "";
      return;
    }
    el.setText(u.estimated ? `Ctx \u7EA6${u.pct}%` : `Ctx ${u.pct}%`);
    if (u.pct >= 80) el.classList.add("is-danger");
    else if (u.pct >= 50) el.classList.add("is-warn");
    el.title = `\u4E0A\u4E0B\u6587\u5DF2\u7528 ${u.estimated ? "\u7EA6 " : ""}${u.used.toLocaleString()} / ${u.total.toLocaleString()} tokens\uFF08${u.pct}%\uFF09${u.exact ? "" : " \xB7 \u7A97\u53E3\u5927\u5C0F\u4E3A\u5185\u7F6E\u4F30\u503C"}${u.estimated ? "\n\u4F30\u7B97\u65B9\u5F0F\uFF1A\u6309\u4F1A\u8BDD\u5185\u5BB9\u5B57\u7B26\u542F\u53D1\u5F0F\u6362\u7B97\uFF08\u4E2D\u6587 \xF72\u3001\u82F1\u6587 \xF74\uFF09\uFF0C\u7CBE\u786E\u7528\u91CF\u843D\u76D8\u540E\u81EA\u52A8\u66FF\u6362" : ""}
\u6A21\u578B\uFF1A${u.model ?? "\u672A\u77E5"}
\u6570\u636E\u6765\u6E90\uFF1ACLI \u4F1A\u8BDD\u65E5\u5FD7\uFF08\u6BCF\u8F6E\u7ED3\u675F\u540E\u66F4\u65B0\uFF09`;
  }
  /** 渲染一个 ACP config option 下拉（模型 / 思考强度共用；状态机由 config-options 纯模块给出） */
  renderConfigSelect(container, option, configId, label, fallbackText) {
    container.empty();
    const state = selectViewState({
      option,
      label,
      hasSession: !!this.sessionId,
      fallbackText
    });
    if (state.kind === "hidden") return;
    if (state.kind === "placeholder" || state.kind === "single") {
      container.setText(state.text);
      return;
    }
    container.createSpan({ cls: "kimidian-status-label", text: `${label}\uFF1A` });
    const sel = container.createEl("select", { cls: "kimidian-model-select" });
    for (const o of state.options) {
      const opt = sel.createEl("option", { text: o.label, value: o.value });
      if (o.value === state.current) opt.selected = true;
    }
    sel.onchange = () => {
      if (!this.sessionId) return;
      void this.client.setConfigOption(this.sessionId, configId, sel.value).then((opts) => {
        this.applyConfigOptions(opts);
        if (configId === "model" && this.plugin.settings.model !== sel.value) {
          this.plugin.settings.model = sel.value;
          void this.plugin.saveSettings();
        }
        new import_obsidian.Notice(`${label}\u5DF2\u5207\u6362\uFF1A${sel.options[sel.selectedIndex]?.text ?? sel.value}`);
      }).catch((e) => {
        console.warn(`[kimidian] \u5207\u6362${label}\u5931\u8D25`, e);
        new import_obsidian.Notice(`\u5207\u6362${label}\u5931\u8D25\uFF1A${e.message}`);
      });
    };
  }
  // ================= 滚动跟随 =================
  /** 用户滚动：更新跟随态；回到底部附近时恢复跟随即隐藏「新消息」按钮 */
  onMessagesScroll() {
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
  scrollToBottom() {
    if (this.scrollFollow.shouldAutoScroll()) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    } else {
      this.showNewMsgBtn();
    }
  }
  /** 强制滚到底部并恢复跟随（点按钮 / 用户自己发消息时） */
  forceScrollToBottom() {
    this.scrollFollow.stick();
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    this.hideNewMsgBtn();
  }
  showNewMsgBtn() {
    if (this.newMsgBtn) return;
    const btn = this.contentEl.createDiv({ cls: "kimidian-new-msg-btn" });
    btn.createSpan({ text: "\u2193 \u65B0\u6D88\u606F" });
    btn.onclick = () => this.forceScrollToBottom();
    this.newMsgBtn = btn;
  }
  hideNewMsgBtn() {
    this.newMsgBtn?.remove();
    this.newMsgBtn = null;
  }
  persistSessionMeta() {
    if (!this.sessionId) return;
    const base = this.vaultBasePath() ?? "";
    const meta = this.plugin.settings.sessionMeta;
    const title = meta[this.sessionId]?.title ?? (this.lastUserText.length > 40 ? this.lastUserText.slice(0, 40) + "\u2026" : this.lastUserText) ?? "\u4F1A\u8BDD";
    meta[this.sessionId] = {
      title,
      updatedAt: Date.now(),
      cwd: base
    };
    const keys = Object.keys(meta);
    if (keys.length > 200) {
      const sorted = keys.sort(
        (a, b) => (meta[a].updatedAt ?? 0) - (meta[b].updatedAt ?? 0)
      );
      for (const k of sorted.slice(0, keys.length - 200)) delete meta[k];
    }
    void this.plugin.saveSettings();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KIMIDIAN_VIEW_TYPE,
  KimidianView
});
