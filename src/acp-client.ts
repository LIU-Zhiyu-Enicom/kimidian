/**
 * KimiAcpClient —— 管理 `kimi.exe acp` 子进程与 ACP(JSON-RPC over stdio) 通信。
 *
 * 职责：
 * - 启动 / 停止 / 崩溃感知子进程
 * - NDJSON 收发、请求-响应配对
 * - initialize 握手
 * - 分发 session/update 通知、session/request_permission 与 fs/* 反向请求
 */
import { ChildProcess, spawn } from "child_process";
import { promises as fsp } from "fs";
import { resolve } from "path";
import { probeGitBash, BashProbeResult } from "./shell-path";
import {
  ACP_ERR_AUTH_REQUIRED,
  AgentCapabilities,
  AuthMethod,
  InitializeResult,
  JsonRpcResponse,
  ListSessionsResult,
  NewSessionResult,
  PermissionOption,
  PromptResult,
  RequestPermissionOutcome,
  RequestPermissionParams,
  ContentBlock,
  SessionConfigOption,
  SessionInfo,
  SessionNotification,
} from "./acp-types";

export interface AcpClientEvents {
  /** session/update 流式通知 */
  onSessionUpdate: (n: SessionNotification) => void;
  /** 权限请求（autoApprove 关闭时由 UI 弹按钮，resolve 用户选择） */
  onPermissionRequest: (
    params: RequestPermissionParams
  ) => Promise<RequestPermissionOutcome>;
  /** 连接状态变化（已连接 / 断开 / 未登录） */
  onStateChange: (state: AcpConnectionState, detail?: string) => void;
}

export type AcpConnectionState =
  | "disconnected"
  | "starting"
  | "connected"
  | "auth_required"
  | "error";

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  method: string;
}

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class KimiAcpClient {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private buffer = "";
  private stopping = false;
  /** 子进程工作目录（vault 根目录），由视图在启动前设置 */
  private cwd: string | null = null;
  /** 当前进程实际使用的 cwd（用于检测变化后重启） */
  private startedCwd: string | null = null;
  /** 进程代次：stop/restart 时递增，使旧进程的 exit/error 事件失效 */
  private generation = 0;
  /** 最近一次进程退出信息（错误展示用） */
  private lastExitInfo: { code: number | null; signal: string | null } | null =
    null;
  /** 自动重启限流：5 分钟窗口内最多 3 次 */
  private autoRestartTimes: number[] = [];
  /** 设置页手动配置的 Git Bash 路径（空 = 自动探测） */
  private bashPath = "";
  /** 最近一次 bash 探测结果（诊断/错误展示用） */
  private lastBashProbe: BashProbeResult | null = null;
  /** 当前进程实际使用的 bash 注入值（变化时触发重启） */
  private startedBash: string | null = null;
  /** stderr 环形缓冲，用于错误诊断展示 */
  private stderrLines: string[] = [];

  state: AcpConnectionState = "disconnected";
  agentCapabilities: AgentCapabilities | null = null;
  authMethods: AuthMethod[] = [];
  agentVersion = "";

  constructor(
    private cliPath: string,
    private extraArgs: string[],
    private events: AcpClientEvents
  ) {}

  /** 是否已握手且可用 */
  get ready(): boolean {
    return this.state === "connected" && !!this.proc;
  }

  /** 更新 CLI 路径 / 参数（设置变更时调用，之后需 restart） */
  updateCommand(cliPath: string, extraArgs: string[]): void {
    this.cliPath = cliPath;
    this.extraArgs = extraArgs;
  }

  /** 设置子进程工作目录；若与当前进程不同需要 restart 才会生效 */
  setCwd(cwd: string | null): void {
    this.cwd = cwd;
  }

  /** 设置手动 Git Bash 路径（空 = 自动探测）；变化后 ensureStarted 自动重启生效 */
  setBashPath(p: string): void {
    this.bashPath = p.trim();
  }

  /** 最近一次 bash 探测结果 */
  getBashProbe(): BashProbeResult | null {
    return this.lastBashProbe;
  }

  /** 当前生效的 bash 注入值（手动配置或自动探测；null = 不注入） */
  private effectiveBash(): string | null {
    const probe = probeGitBash(this.bashPath || undefined);
    this.lastBashProbe = probe;
    return probe.fromEnv ? null : probe.found;
  }

  /** 最近的 stderr 行（诊断用） */
  getStderrTail(maxLines = 20): string {
    return this.stderrLines.slice(-maxLines).join("\n");
  }

  /** 启动子进程并完成 initialize 握手；已连接时直接返回 */
  async ensureStarted(): Promise<void> {
    const bash = this.effectiveBash();
    if (this.ready && this.startedCwd === this.cwd && this.startedBash === bash)
      return;
    if (this.ready) {
      // cwd 或 bash 注入变了（比如设置刚改）：旧进程按旧环境运行，重启
      await this.stopAndWait();
    }
    if (this.state === "starting") {
      // 等已在进行中的启动（带超时，防悬挂）
      const ok = await this.waitFor((s) => s !== "starting", 15000);
      if (!ok) throw new Error("等待 Kimi CLI 启动超时");
      if (this.ready) return;
    }
    this.setState("starting");
    this.stopping = false;

    // 关键：必须把会话工作目录（vault 根）作为子进程 cwd。
    // 不传 cwd 时 kimi.exe 会继承 Obsidian 的进程 cwd（通常在 C 盘安装目录），
    // 导致 agent 侧按错误基准解析相对/临时路径（实测会把临时脚本写到 \tmp\...，
    // 即 C 盘根下），进而引发 session/prompt 的 -32603 Internal error。
    let proc: ChildProcess;
    try {
      proc = await this.spawnWithRetry();
    } catch (e) {
      this.setState("error", String(e));
      throw new Error(
        `无法启动 Kimi CLI：${this.cliPath}\n请在插件设置中检查 CLI 路径。(${String(e)})`
      );
    }
    const gen = ++this.generation;
    this.proc = proc;
    this.startedCwd = this.cwd;
    this.startedBash =
      this.lastBashProbe && !this.lastBashProbe.fromEnv
        ? this.lastBashProbe.found
        : null;
    this.buffer = "";
    this.stderrLines = [];

    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => this.onStdout(d));
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (d: string) => {
      // agent 日志走 stderr：保留最近若干行用于错误展示，同时打控制台
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
      // 代次守卫：旧进程的事件不得影响新进程
      if (gen !== this.generation) return;
      this.setState("error", String(e));
      this.failAllPending(new Error(`子进程错误: ${String(e)}`));
    });
    proc.on("exit", (code, signal) => {
      if (gen !== this.generation) return; // 旧进程退出，忽略
      console.warn(`[kimidian] kimi acp 退出 code=${code} signal=${signal}`);
      this.proc = null;
      this.lastExitInfo = { code, signal: signal ?? null };
      const e = new Error(
        `Kimi CLI 进程已退出 (code=${code ?? "null"}, signal=${signal ?? "无"})`
      ) as Error & { data?: unknown };
      e.data = { exitCode: code, signal: signal ?? null };
      this.failAllPending(e);
      if (!this.stopping) {
        this.setState("disconnected", `进程意外退出 (code=${code})`);
      } else {
        this.setState("disconnected");
      }
    });

    try {
      const init = (await this.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false,
        },
        clientInfo: { name: "kimidian", version: "0.1.0" },
      })) as InitializeResult;
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
  private spawnWithRetry(): Promise<ChildProcess> {
    // 计算一次注入环境（探测结果同时用于诊断/错误展示）
    const probe = probeGitBash(this.bashPath || undefined);
    this.lastBashProbe = probe;
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (!probe.fromEnv && probe.found) {
      env.KIMI_SHELL_PATH = probe.found;
      console.warn(
        `[kimidian] 注入 KIMI_SHELL_PATH=${probe.found}（来源：${probe.source}）`
      );
    } else if (!probe.found) {
      console.warn("[kimidian] 未找到可用的 Git Bash，session/new 可能失败");
    }
    return new Promise((resolvePromise, rejectPromise) => {
      let attempt = 0;
      const trySpawn = () => {
        attempt++;
        let proc: ChildProcess;
        try {
          proc = spawn(this.cliPath, ["acp", ...this.extraArgs], {
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
            cwd: this.cwd ?? undefined,
            env,
          });
        } catch (e) {
          // 同步 throw（极少见）
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
            `[kimidian] spawn 第 ${attempt} 次失败: ${String(e)}`
          );
          if (attempt < 3) {
            setTimeout(trySpawn, 500 * attempt); // 500ms / 1000ms 退避
          } else {
            rejectPromise(e);
          }
        });
      };
      trySpawn();
    });
  }

  async restart(): Promise<void> {
    await this.stopAndWait();
    await this.ensureStarted();
  }

  /** 同步快速停止（插件卸载用） */
  stop(): void {
    this.stopping = true;
    this.generation++; // 旧进程事件立即失效
    const p = this.proc;
    this.proc = null;
    this.failAllPending(new Error("客户端已停止"));
    try {
      p?.kill();
    } catch {
      /* 忽略 */
    }
    this.setState("disconnected");
  }

  /**
   * 停止并等待旧进程真正退出（Windows 上 kimi.exe 文件被将死进程占用，
   * 立即 respawn 会 EBUSY/EPERM），再留 400ms 让 OS 释放文件句柄。
   */
  async stopAndWait(): Promise<void> {
    const p = this.proc;
    this.stop();
    if (p && p.exitCode === null && !p.killed) {
      await Promise.race([
        new Promise<void>((resolve) => p.once("exit", () => resolve())),
        this.sleep(2000), // 2s 内不退出就强等超时继续
      ]);
    } else if (p) {
      // 已 kill 但 exit 事件可能还没到，稍等
      await this.sleep(300);
    }
    await this.sleep(400); // 等文件句柄释放
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- ACP 方法 ----------

  async sessionNew(cwd: string): Promise<NewSessionResult> {
    try {
      return (await this.request("session/new", {
        cwd,
        mcpServers: [],
      })) as NewSessionResult;
    } catch (e) {
      const err = e as Error & { code?: number };
      // -32603 Internal error 常见于进程状态过期（如登录前启动的旧进程）。
      // session/new 是幂等的，自动重启子进程并重试一次。
      // 自动重启限流：5 分钟窗口内最多 3 次，防止循环重启把进程搞没。
      if (err?.code === -32603 && this.canAutoRestart()) {
        console.warn("[kimidian] session/new 返回 -32603，自动重启 acp 进程重试");
        try {
          await this.restart();
          return (await this.request("session/new", {
            cwd,
            mcpServers: [],
          })) as NewSessionResult;
        } catch (e2) {
          throw this.wrapAuth(e2);
        }
      }
      throw this.wrapAuth(e);
    }
  }

  /** 自动重启限流：5 分钟最多 3 次 */
  private canAutoRestart(): boolean {
    const now = Date.now();
    this.autoRestartTimes = this.autoRestartTimes.filter(
      (t) => now - t < 5 * 60 * 1000
    );
    if (this.autoRestartTimes.length >= 3) {
      console.warn("[kimidian] 自动重启次数超限（5 分钟内 3 次），不再自动重启");
      return false;
    }
    this.autoRestartTimes.push(now);
    return true;
  }

  async sessionLoad(sessionId: string, cwd: string): Promise<unknown> {
    try {
      return await this.request("session/load", {
        sessionId,
        cwd,
        mcpServers: [],
      });
    } catch (e) {
      throw this.wrapAuth(e);
    }
  }

  async sessionList(cwd: string): Promise<SessionInfo[]> {
    const all: SessionInfo[] = [];
    let cursor: string | null = null;
    // 翻页拉全（通常一页就够，防御性循环）
    for (let i = 0; i < 20; i++) {
      const r = (await this.request("session/list", {
        cwd,
        cursor,
      })) as ListSessionsResult;
      all.push(...(r.sessions ?? []));
      cursor = r.nextCursor ?? null;
      if (!cursor) break;
    }
    return all;
  }

  /** 发送 prompt；流式内容通过 onSessionUpdate 回调，这里只等最终结果 */
  async prompt(
    sessionId: string,
    blocks: ContentBlock[]
  ): Promise<PromptResult> {
    try {
      return (await this.request("session/prompt", {
        sessionId,
        prompt: blocks,
      })) as PromptResult;
    } catch (e) {
      throw this.wrapAuth(e);
    }
  }

  cancel(sessionId: string): void {
    this.notify("session/cancel", { sessionId });
  }

  async setConfigOption(
    sessionId: string,
    configId: string,
    value: string
  ): Promise<SessionConfigOption[]> {
    const r = (await this.request("session/set_config_option", {
      sessionId,
      configId,
      value,
    })) as { configOptions?: SessionConfigOption[] };
    return r.configOptions ?? [];
  }

  // ---------- JSON-RPC 收发 ----------

  private request(method: string, params?: unknown): Promise<unknown> {
    if (!this.proc?.stdin?.writable) {
      return Promise.reject(new Error("Kimi CLI 未连接"));
    }
    const id = this.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      try {
        this.proc!.stdin!.write(JSON.stringify(msg) + "\n");
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  private notify(method: string, params?: unknown): void {
    if (!this.proc?.stdin?.writable) return;
    try {
      this.proc.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"
      );
    } catch {
      /* 忽略 */
    }
  }

  private respond(
    id: number | string,
    result?: unknown,
    error?: { code: number; message: string }
  ): void {
    if (!this.proc?.stdin?.writable) return;
    const msg: JsonRpcResponse = { jsonrpc: "2.0", id };
    if (error) msg.error = error;
    else msg.result = result ?? null;
    try {
      this.proc.stdin.write(JSON.stringify(msg) + "\n");
    } catch {
      /* 忽略 */
    }
  }

  private onStdout(data: string): void {
    this.buffer += data;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        console.warn("[kimidian] 非 JSON 行:", line.slice(0, 200));
        continue;
      }
      this.dispatch(msg);
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    const hasMethod = typeof msg.method === "string";
    const hasId = msg.id !== undefined && msg.id !== null;

    if (hasMethod && hasId) {
      // agent → client 请求（权限 / 文件读写）
      void this.handleAgentRequest(
        msg.id as number | string,
        msg.method as string,
        msg.params
      );
    } else if (hasMethod) {
      // 通知
      if (msg.method === "session/update") {
        try {
          this.events.onSessionUpdate(msg.params as SessionNotification);
        } catch (e) {
          // 监听器（视图渲染）异常不能拖垮 stdout 读循环：丢这条通知，保连接
          console.error("[kimidian] session/update 监听器异常:", e);
        }
      }
    } else if (hasId) {
      // 响应
      const p = this.pending.get(msg.id as number | string);
      if (!p) return;
      this.pending.delete(msg.id as number | string);
      const err = msg.error as
        | { code: number; message: string; data?: unknown }
        | undefined;
      if (err) {
        const e = new Error(err.message) as Error & {
          code?: number;
          data?: unknown;
        };
        e.code = err.code;
        e.data = err.data;
        p.reject(e);
      } else {
        p.resolve(msg.result);
      }
    }
  }

  /** 处理 agent 反向请求：权限审批 + 文件读写 */
  private async handleAgentRequest(
    id: number | string,
    method: string,
    params: unknown
  ): Promise<void> {
    try {
      if (method === "session/request_permission") {
        const outcome = await this.events.onPermissionRequest(
          params as RequestPermissionParams
        );
        this.respond(id, { outcome });
        return;
      }
      if (method === "fs/read_text_file") {
        const p = params as { path: string; line?: number | null; limit?: number | null };
        let content = await fsp.readFile(this.resolveFsPath(p.path), "utf8");
        if (p.line != null || p.limit != null) {
          const lines = content.split("\n");
          const start = Math.max(0, (p.line ?? 1) - 1);
          const end = p.limit != null ? start + p.limit : undefined;
          content = lines.slice(start, end).join("\n");
        }
        this.respond(id, { content });
        return;
      }
      if (method === "fs/write_text_file") {
        const p = params as { path: string; content: string };
        await fsp.writeFile(this.resolveFsPath(p.path), p.content, "utf8");
        this.respond(id, {});
        return;
      }
      this.respond(id, undefined, { code: -32601, message: `Method not found: ${method}` });
    } catch (e) {
      // 把路径等上下文带进错误消息，避免 agent 侧只拿到 "ENOENT" 之类无头错误
      const detail = e instanceof Error ? e.message : String(e);
      this.respond(id, undefined, {
        code: -32603,
        message: `[kimidian] ${method} 失败: ${detail}`,
      });
    }
  }

  /**
   * 防御性路径解析：agent 理论上应发绝对路径，但若发来相对/盘符相对路径
   * （如 \tmp\x.py），按会话工作目录（vault 根）解析，而不是 Obsidian 进程 cwd。
   */
  private resolveFsPath(p: string): string {
    const isDriveAbsolute = /^[a-zA-Z]:[\\/]/.test(p);
    const isUnc = p.startsWith("\\\\");
    if (isDriveAbsolute || isUnc || !this.cwd) return p;
    return resolve(this.cwd, p);
  }

  /** 默认权限决策（autoApprove 开启时使用）：优先 allow_always，其次 allow_once */
  static pickAllowOption(options: PermissionOption[]): PermissionOption | null {
    return (
      options.find((o) => o.kind === "allow_always") ??
      options.find((o) => o.kind === "allow_once") ??
      null
    );
  }

  // ---------- 工具 ----------

  private wrapAuth(e: unknown): Error {
    const err = e as Error & { code?: number };
    if (err?.code === ACP_ERR_AUTH_REQUIRED) {
      this.setState("auth_required");
      return new AuthRequiredError(err.message);
    }
    return err instanceof Error ? err : new Error(String(e));
  }

  private setState(s: AcpConnectionState, detail?: string): void {
    this.state = s;
    this.events.onStateChange(s, detail);
  }

  /** 最近一次进程退出信息（诊断/错误展示用） */
  getLastExitInfo(): { code: number | null; signal: string | null } | null {
    return this.lastExitInfo;
  }

  private failAllPending(e: Error): void {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
  }

  /** 等待状态满足条件；超时返回 false（不再无限悬挂） */
  private waitFor(
    pred: (s: AcpConnectionState) => boolean,
    timeoutMs = 15000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        if (pred(this.state)) resolve(true);
        else if (Date.now() > deadline) resolve(false);
        else setTimeout(check, 50);
      };
      check();
    });
  }
}
