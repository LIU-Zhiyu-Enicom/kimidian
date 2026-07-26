/**
 * 自我诊断：在 Obsidian 真实环境里逐步验证 kimi acp 链路，
 * 结果追加写入 插件目录/debug.log，父代理可直接读取，无需麻烦用户。
 *
 * 步骤（每步计时）：
 *   1. kimi.exe --version（二进制可执行性）
 *   2. spawn kimi.exe acp（独立一次性进程，用完即杀，不碰聊天长连接）
 *   3. initialize 握手
 *   4. session/new
 *   5. session/prompt "只回复ok"（60s 超时）
 * 任一步失败：记录完整错误对象（code/message/data/stack）、进程 exit code/signal、
 * 该进程 stderr 全文。
 */
import { ChildProcess, spawn } from "child_process";
import { promises as fsp } from "fs";
import { join } from "path";
import { FileSystemAdapter, Notice } from "obsidian";
import { ConfigOption, summarizeConfigOptions } from "./config-options";
import type KimidianPlugin from "./main";
import { probeGitBash } from "./shell-path";

/** debug.log 滚动上限 */
const LOG_MAX_BYTES = 200 * 1024;
/** 截断后保留的尾部大小 */
const LOG_KEEP_BYTES = 150 * 1024;

interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface DiagnosticsResult {
  ok: boolean;
  summary: string;
  logPath: string | null;
}

/** 运行完整诊断并写日志；通过 Notice 给一句话摘要 */
export async function runDiagnostics(
  plugin: KimidianPlugin
): Promise<DiagnosticsResult> {
  const lines: string[] = [];
  const say = (s: string) => lines.push(s);
  const startedAt = new Date();

  say(`\n================ Kimidian 诊断 ${startedAt.toLocaleString()} ================`);

  // ---------- 环境快照 ----------
  say("[环境]");
  say(`  node: ${process.version}  platform: ${process.platform}/${process.arch}`);
  say(`  electron: ${process.versions.electron ?? "n/a"}`);
  const interesting = [
    "PATH",
    "USERPROFILE",
    "SystemRoot",
    "TEMP",
    "TMP",
    "COMSPEC",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "PWD",
  ];
  for (const name of interesting) {
    const v = process.env[name];
    if (v === undefined) {
      say(`  env.${name}: <未设置>`);
    } else {
      const truncated = v.length > 300 ? v.slice(0, 300) + `…(共${v.length}字符)` : v;
      say(`  env.${name}: ${truncated}`);
    }
  }
  // 其余变量：含 KEY/TOKEN/SECRET/PASSWORD 的只记存在性，其它记名字
  const sensitive: string[] = [];
  const others: string[] = [];
  for (const name of Object.keys(process.env)) {
    if (interesting.includes(name)) continue;
    if (/key|token|secret|password|credential/i.test(name)) sensitive.push(name);
    else others.push(name);
  }
  say(`  敏感变量（仅列名，不记值）: ${sensitive.join(", ") || "无"}`);
  say(`  其它变量: ${others.join(", ") || "无"}`);

  // ---------- 路径 ----------
  const adapter = plugin.app.vault.adapter;
  const vaultRoot =
    adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
  const cliPath = plugin.settings.cliPath;
  say("[路径]");
  say(`  vault 根: ${vaultRoot ?? "<无法获取>"}`);
  say(`  spawn cwd: ${vaultRoot ?? "<继承 Obsidian 进程 cwd>"}`);
  say(`  CLI 路径: ${cliPath}`);
  say(`  插件目录: ${plugin.manifest.dir ?? "n/a"}`);

  // ---------- Git Bash 探测（Windows 建会话必需）----------
  const bashProbe = probeGitBash(plugin.settings.bashPath || undefined);
  const bashInject = bashProbe.fromEnv ? null : bashProbe.found;
  say("[Git Bash 探测]");
  say(
    `  环境变量 KIMI_SHELL_PATH: ${process.env.KIMI_SHELL_PATH ? `已设置（尊重原值，不注入）→ ${process.env.KIMI_SHELL_PATH}` : "未设置"}`
  );
  say(`  设置页手动配置: ${plugin.settings.bashPath || "<空，自动探测>"}`);
  for (const c of bashProbe.candidates) {
    say(`  ${c.exists ? "✅" : "❌"} ${c.path}（${c.source}）`);
  }
  say(
    `  最终注入值: ${bashInject ?? "<无>"}${bashProbe.fromEnv ? "（来自用户环境）" : bashProbe.source ? `（来源：${bashProbe.source}）` : ""}`
  );
  if (!bashProbe.found) {
    say("  ⚠️ 未找到任何可用 bash.exe，session/new 大概率报 -32603 Git Bash 错误");
  }

  const steps: StepResult[] = [];
  const run = async (name: string, fn: () => Promise<string>): Promise<boolean> => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      steps.push({ name, ok: true, ms: Date.now() - t0, detail });
      return true;
    } catch (e) {
      const err = e as Error & { code?: number | string; data?: unknown };
      let detail = `message: ${err?.message ?? String(e)}\n`;
      if (err?.code !== undefined) detail += `code: ${err.code}\n`;
      if (err?.data !== undefined) {
        detail += `data: ${safeJson(err.data)}\n`;
      }
      if (err?.stack) detail += `stack: ${err.stack}\n`;
      steps.push({ name, ok: false, ms: Date.now() - t0, detail });
      return false;
    }
  };

  // ---------- 步骤 1: kimi --version ----------
  const v1 = await run("kimi.exe --version", () => probeVersion(cliPath));
  if (v1) {
    // ---------- 步骤 2-5: acp 全链路（独立一次性进程，注入与插件相同的 KIMI_SHELL_PATH） ----------
    // 复用固定诊断会话（data.json 的 diagSessionId），避免每次启动新建会话刷屏历史
    const t0 = Date.now();
    try {
      const r = await probeAcpChain(
        cliPath,
        vaultRoot ?? undefined,
        bashInject,
        plugin.settings.diagSessionId
      );
      steps.push({
        name: "acp 全链路 (spawn→initialize→session→prompt)",
        ok: true,
        ms: Date.now() - t0,
        detail: r.detail,
      });
      if (r.sessionId && r.sessionId !== plugin.settings.diagSessionId) {
        plugin.settings.diagSessionId = r.sessionId;
        await plugin.saveSettings();
      }
    } catch (e) {
      const err = e as Error & { code?: number | string; data?: unknown };
      let detail = `message: ${err?.message ?? String(e)}\n`;
      if (err?.code !== undefined) detail += `code: ${err.code}\n`;
      if (err?.data !== undefined) detail += `data: ${safeJson(err.data)}\n`;
      if (err?.stack) detail += `stack: ${err.stack}\n`;
      steps.push({
        name: "acp 全链路 (spawn→initialize→session→prompt)",
        ok: false,
        ms: Date.now() - t0,
        detail,
      });
    }
  }

  // ---------- 汇总 ----------
  say("[步骤]");
  let allOk = true;
  for (const s of steps) {
    say(`  ${s.ok ? "✅" : "❌"} ${s.name}  (${s.ms}ms)`);
    const indented = s.detail
      .split("\n")
      .map((l) => `      ${l}`)
      .join("\n");
    say(indented);
    if (!s.ok) allOk = false;
  }
  const summary = allOk
    ? `诊断通过（${steps.length} 步全绿）`
    : `诊断失败：${steps.find((s) => !s.ok)?.name ?? "未知步骤"}`;
  say(`[结论] ${summary}`);

  // ---------- 写 debug.log ----------
  let logPath: string | null = null;
  if (vaultRoot && plugin.manifest.dir) {
    logPath = join(vaultRoot, plugin.manifest.dir, "debug.log");
    try {
      await appendRolling(logPath, lines.join("\n") + "\n");
    } catch (e) {
      console.error("[kimidian] 写 debug.log 失败", e);
      logPath = null;
    }
  }

  new Notice(
    allOk
      ? `Kimidian ${summary}`
      : `Kimidian ${summary}，详情见插件目录 debug.log`,
    8000
  );
  console.log(`[kimidian] 诊断完成: ${summary}`);
  return { ok: allOk, summary, logPath };
}

// ================= 步骤实现 =================

/** 步骤 1：kimi.exe --version */
function probeVersion(cliPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn(cliPath, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (e) {
      reject(e);
      return;
    }
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d) => (out += d));
    proc.stderr?.on("data", (d) => (err += d));
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("--version 15s 超时"));
    }, 15000);
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(`stdout: ${out.trim() || "<空>"}  stderr: ${err.trim() || "<空>"}`);
      } else {
        const e = new Error(
          `--version 退出码异常 code=${code} signal=${signal ?? "无"}`
        ) as Error & { data?: unknown };
        e.data = { exitCode: code, signal, stdout: out.trim(), stderr: err.trim() };
        reject(e);
      }
    });
  });
}

/** 步骤 2-5：独立 acp 进程跑完整链路（注入与插件一致的 KIMI_SHELL_PATH） */
function probeAcpChain(
  cliPath: string,
  cwd?: string,
  shellPath?: string | null,
  reuseSessionId?: string | null
): Promise<{ detail: string; sessionId: string }> {
  return new Promise((resolve, reject) => {
    const log: string[] = [];
    let proc: ChildProcess;
    try {
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (shellPath) env.KIMI_SHELL_PATH = shellPath;
      proc = spawn(cliPath, ["acp"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        cwd,
        env,
      });
    } catch (e) {
      reject(e);
      return;
    }
    let buf = "";
    let stderrAll = "";
    let exitInfo: { code: number | null; signal: string | null } | null = null;
    let nextId = 1;
    let sessionId = "";
    const pending = new Map<
      number,
      { resolve: (r: unknown) => void; reject: (e: Error) => void }
    >();

    const fail = (e: Error & { data?: unknown }) => {
      e.data = {
        ...(typeof e.data === "object" && e.data !== null ? e.data : {}),
        exitInfo,
        stderr全文: stderrAll.trim() || "<空>",
      };
      cleanup();
      reject(e);
    };
    const cleanup = () => {
      clearTimeout(timer);
      try {
        proc.kill();
      } catch {
        /* 忽略 */
      }
    };
    const timer = setTimeout(() => {
      fail(new Error("acp 链路 90s 总超时"));
    }, 90000);

    const sendReq = (method: string, params: unknown): Promise<unknown> => {
      const id = nextId++;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        proc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    };

    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (d) => (stderrAll += d));
    proc.on("error", (e) => {
      const err = e as Error & { data?: unknown };
      fail(err);
    });
    proc.on("exit", (code, signal) => {
      exitInfo = { code, signal: signal ?? null };
      // 进程中途死掉：reject 所有挂起请求
      const e = new Error(
        `acp 进程中途退出 code=${code ?? "null"} signal=${signal ?? "无"}`
      ) as Error & { data?: unknown };
      for (const p of pending.values()) p.reject(e);
      pending.clear();
      // 若已经走到 resolve 阶段（kill 自己），忽略
    });
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (m.method && m.id != null) {
          // agent 反向请求：诊断极简处理——权限自动允许，fs 读按 Node 读，其它 -32601
          if (m.method === "session/request_permission") {
            const opts =
              (m.params as { options?: { optionId: string; kind: string }[] })
                ?.options ?? [];
            const opt =
              opts.find((o) => o.kind === "allow_always") ??
              opts.find((o) => o.kind === "allow_once");
            proc.stdin!.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: m.id,
                result: {
                  outcome: opt
                    ? { outcome: "selected", optionId: opt.optionId }
                    : { outcome: "cancelled" },
                },
              }) + "\n"
            );
          } else if (m.method === "fs/read_text_file") {
            const p = m.params as { path: string };
            fsp.readFile(p.path, "utf8").then(
              (content) =>
                proc.stdin!.write(
                  JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { content } }) + "\n"
                ),
              (e) =>
                proc.stdin!.write(
                  JSON.stringify({
                    jsonrpc: "2.0",
                    id: m.id,
                    error: { code: -32603, message: String(e) },
                  }) + "\n"
                )
            );
          } else {
            proc.stdin!.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: m.id,
                error: { code: -32601, message: "diagnostics: not implemented" },
              }) + "\n"
            );
          }
          continue;
        }
        if (m.method) continue; // 通知忽略
        const id = m.id as number;
        const p = pending.get(id);
        if (!p) continue;
        pending.delete(id);
        if (m.error) {
          const errObj = m.error as { code: number; message: string; data?: unknown };
          const e = new Error(errObj.message) as Error & {
            code?: number;
            data?: unknown;
          };
          e.code = errObj.code;
          e.data = errObj.data;
          p.reject(e);
        } else {
          p.resolve(m.result);
        }
      }
    });

    // 顺序执行链路
    void (async () => {
      try {
        const t0 = Date.now();
        const init = (await sendReq("initialize", {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: false,
          },
          clientInfo: { name: "kimidian-diagnostics", version: "0.1.0" },
        })) as { agentInfo?: { version?: string } };
        log.push(`initialize OK (${Date.now() - t0}ms), agent v${init?.agentInfo?.version ?? "?"}`);

        const t1 = Date.now();
        // 复用固定诊断会话：存在则 session/load（历史里最多一条诊断会话），
        // 复用失败（会话被清理/跨设备）回退 session/new
        if (reuseSessionId) {
          try {
            await sendReq("session/load", {
              sessionId: reuseSessionId,
              cwd: cwd ?? process.cwd(),
              mcpServers: [],
            });
            sessionId = reuseSessionId;
            log.push(
              `session/load OK (${Date.now() - t1}ms)，复用诊断会话 ${sessionId}`
            );
          } catch (e) {
            log.push(
              `session/load 复用失败（${(e as Error).message}），回退 session/new`
            );
          }
        }
        if (!sessionId) {
          const ns = (await sendReq("session/new", {
            cwd: cwd ?? process.cwd(),
            mcpServers: [],
          })) as { sessionId: string; configOptions?: ConfigOption[] };
          sessionId = ns.sessionId;
          log.push(`session/new OK (${Date.now() - t1}ms), sessionId=${sessionId}`);
          // configOptions 摘要：模型/思考/模式下拉的数据源，格式变化一眼可查
          log.push(summarizeConfigOptions(ns.configOptions));
        }

        const t2 = Date.now();
        const pr = (await sendReq("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: "只回复ok" }],
        })) as { stopReason: string };
        log.push(`session/prompt OK (${Date.now() - t2}ms), stopReason=${pr.stopReason}`);

        cleanup();
        resolve({ detail: log.join("\n"), sessionId });
      } catch (e) {
        fail(e as Error & { data?: unknown });
      }
    })();
  });
}

// ================= 日志滚动写 =================

async function appendRolling(logPath: string, block: string): Promise<void> {
  let existing = "";
  try {
    existing = await fsp.readFile(logPath, "utf8");
  } catch {
    // 文件不存在，从头写
  }
  let combined = existing + block;
  if (combined.length > LOG_MAX_BYTES) {
    combined =
      `……（日志过长，已截断，仅保留尾部）……\n` +
      combined.slice(combined.length - LOG_KEEP_BYTES);
  }
  await fsp.writeFile(logPath, combined, "utf8");
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
