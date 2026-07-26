/**
 * Git Bash 探测：Kimi CLI 在 Windows 建会话时必须找到 bash.exe。
 * Obsidian 环境通常没有 KIMI_SHELL_PATH，且用户可能没装 Git for Windows，
 * 因此插件在 spawn 前按优先级探测并注入 KIMI_SHELL_PATH。
 *
 * 优先级：
 *   0. 用户环境已设置 KIMI_SHELL_PATH（不注入，尊重原值）
 *   1. 设置页手动配置的 bash 路径
 *   2. Git for Windows 标准安装路径（6 个候选）
 *   3. kimi-desktop 捆绑的 Git Bash
 */
import { existsSync } from "fs";
import { join } from "path";

export interface BashCandidate {
  path: string;
  exists: boolean;
  source: string;
}

export interface BashProbeResult {
  /** 最终选中路径（null = 没找到） */
  found: string | null;
  /** 来源说明 */
  source: string | null;
  /** 是否来自用户环境（此时无需注入） */
  fromEnv: boolean;
  /** 全部候选及命中情况（诊断/错误展示用） */
  candidates: BashCandidate[];
}

/** Git for Windows 标准候选路径 */
function standardGitPaths(): string[] {
  const out = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
  ];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    out.push(join(local, "Programs", "Git", "bin", "bash.exe"));
    out.push(join(local, "Programs", "Git", "usr", "bin", "bash.exe"));
  }
  return out;
}

/** kimi-desktop 捆绑 Git Bash 候选路径（基于 APPDATA，不硬编码用户名） */
function kimiDesktopPaths(): string[] {
  const out: string[] = [];
  const appdata = process.env.APPDATA;
  if (appdata) {
    out.push(
      join(appdata, "kimi-desktop", "daimon-bundle", "runtime", "git", "bin", "bash.exe")
    );
    out.push(
      join(appdata, "kimi-desktop", "daimon-bundle", "runtime", "git", "usr", "bin", "bash.exe")
    );
  }
  return out;
}

/**
 * 探测可用的 bash.exe。
 * @param manualPath 设置页手动配置的路径（空串/undefined = 自动）
 */
export function probeGitBash(manualPath?: string): BashProbeResult {
  // 0. 用户环境已设置：尊重原值，无需注入
  const envVal = process.env.KIMI_SHELL_PATH;
  if (envVal) {
    return {
      found: envVal,
      source: "用户环境变量 KIMI_SHELL_PATH",
      fromEnv: true,
      candidates: [{ path: envVal, exists: existsSync(envVal), source: "环境变量" }],
    };
  }

  const candidates: BashCandidate[] = [];
  const check = (path: string, source: string): boolean => {
    const exists = existsSync(path);
    candidates.push({ path, exists, source });
    return exists;
  };

  // 1. 设置页手动配置
  if (manualPath && manualPath.trim()) {
    if (check(manualPath.trim(), "设置页手动配置")) {
      return { found: manualPath.trim(), source: "设置页手动配置", fromEnv: false, candidates };
    }
  }
  // 2. Git for Windows 标准路径
  for (const p of standardGitPaths()) {
    if (check(p, "Git for Windows 标准路径")) {
      return { found: p, source: "Git for Windows 标准路径", fromEnv: false, candidates };
    }
  }
  // 3. kimi-desktop 捆绑
  for (const p of kimiDesktopPaths()) {
    if (check(p, "kimi-desktop 捆绑")) {
      return { found: p, source: "kimi-desktop 捆绑", fromEnv: false, candidates };
    }
  }
  return { found: null, source: null, fromEnv: false, candidates };
}
