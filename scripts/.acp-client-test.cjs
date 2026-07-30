var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/acp-client.ts
var acp_client_exports = {};
__export(acp_client_exports, {
  AuthRequiredError: () => AuthRequiredError,
  KimiAcpClient: () => KimiAcpClient
});
module.exports = __toCommonJS(acp_client_exports);
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
  const check = (path, source) => {
    const exists = (0, import_fs.existsSync)(path);
    candidates.push({ path, exists, source });
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuthRequiredError,
  KimiAcpClient
});
