/**
 * 插件设置与设置页。
 */
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import {
  BUILTIN_MODEL_OPTIONS,
  ConfigOptionValue,
  DEFAULT_MODEL,
} from "./config-options";
import type KimidianPlugin from "./main";

export interface SessionMeta {
  /** 会话标题（首条用户消息摘要） */
  title: string;
  updatedAt: number;
  cwd: string;
}

export interface KimidianSettings {
  /** kimi CLI 可执行文件路径 */
  cliPath: string;
  /** Git Bash 路径（KIMI_SHELL_PATH），留空 = 自动探测 */
  bashPath: string;
  /** 追加给 `kimi acp` 的额外参数（空格分隔） */
  extraArgs: string;
  /** 权限模式：ask 逐个询问 / smart 智能放行 / yolo 全部允许 */
  permissionMode: "ask" | "smart" | "yolo";
  /** "始终允许"记忆（稳定工具 key 列表），跨会话保留直至用户清除 */
  grantedAlwaysTools: string[];
  /** 发送时附带当前活动笔记路径 */
  attachActiveNote: boolean;
  /** 默认模型：从未手动选择过模型时使用（默认 K3） */
  defaultModel: string;
  /** 用户在聊天状态栏手动选择的模型（非空时优先于 defaultModel，跨会话沿用） */
  model: string;
  /** 最近一次会话的模型选项表（设置页下拉数据源；applyConfigOptions 时更新） */
  lastModelOptions: ConfigOptionValue[];
  /** 会话元数据缓存（sessionId → 标题等），用于历史列表快速展示 */
  sessionMeta: Record<string, SessionMeta>;
  /** 上次活动会话（跨 Obsidian 重启持久化；重开时经 session/load 自动恢复） */
  lastSessionId: string | null;
  /** 界面状态记忆（历史面板开合等），重开视图时如实恢复 */
  uiState: { historyOpen: boolean };
  /** 自我诊断复用的固定会话（避免每次启动 session/new 刷屏历史列表） */
  diagSessionId: string | null;
  /** 历史面板里隐藏诊断会话 */
  hideDiagSession: boolean;
  /** 标签栏（每个标签一个独立会话），重开 Obsidian 恢复 */
  tabs: { sessionId: string | null; title: string }[];
  /** 上次活动标签的 sessionId */
  activeTabSessionId: string | null;
}

export const DEFAULT_SETTINGS: KimidianSettings = {
  cliPath: "C:\\Users\\rh\\.kimi-code\\bin\\kimi.exe",
  bashPath: "",
  extraArgs: "",
  permissionMode: "ask",
  grantedAlwaysTools: [],
  attachActiveNote: true,
  defaultModel: DEFAULT_MODEL,
  model: "",
  lastModelOptions: [],
  sessionMeta: {},
  lastSessionId: null,
  uiState: { historyOpen: false },
  diagSessionId: null,
  hideDiagSession: false,
  tabs: [],
  activeTabSessionId: null,
};

export class KimidianSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: KimidianPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Kimidian 设置" });

    new Setting(containerEl)
      .setName("Kimi CLI 路径")
      .setDesc("kimi 可执行文件的完整路径（kimi.exe）。")
      .addText((t) =>
        t
          .setPlaceholder("C:\\Users\\rh\\.kimi-code\\bin\\kimi.exe")
          .setValue(this.plugin.settings.cliPath)
          .onChange(async (v) => {
            this.plugin.settings.cliPath = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Git Bash 路径")
      .setDesc(
        "Kimi CLI 在 Windows 上运行需要 Git Bash。留空则自动探测：Git for Windows 标准路径 → kimi-desktop 捆绑 Git Bash。修改后下次连接自动生效。"
      )
      .addText((t) =>
        t
          .setPlaceholder("例如 C:\\Program Files\\Git\\bin\\bash.exe")
          .setValue(this.plugin.settings.bashPath)
          .onChange(async (v) => {
            this.plugin.settings.bashPath = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // 模型下拉：选项来自最近一次会话的 configOptions，空则用内置兜底表
    const modelOpts =
      this.plugin.settings.lastModelOptions.length > 0
        ? this.plugin.settings.lastModelOptions
        : BUILTIN_MODEL_OPTIONS;
    const manual = this.plugin.settings.model;
    const manualName =
      modelOpts.find((o) => o.value === manual)?.name ?? manual;
    const modelSetting = new Setting(containerEl)
      .setName("默认模型")
      .setDesc(
        manual
          ? `当前沿用聊天中手动选择的「${manualName}」，改动此处将清除手动选择并恢复默认。`
          : "新会话使用的模型。聊天状态栏手动切换后会记住并沿用；在此处改动则回到默认。"
      );
    modelSetting.addDropdown((d) => {
      for (const o of modelOpts) d.addOption(o.value, o.name || o.value);
      // 兜底：当前默认不在选项表里也能显示
      if (!modelOpts.some((o) => o.value === this.plugin.settings.defaultModel)) {
        d.addOption(this.plugin.settings.defaultModel, this.plugin.settings.defaultModel);
      }
      d.setValue(this.plugin.settings.defaultModel).onChange(async (v) => {
        this.plugin.settings.defaultModel = v;
        // 显式修改默认 → 清除手动选择记录，让默认值生效
        this.plugin.settings.model = "";
        await this.plugin.saveSettings();
        new Notice("默认模型已更新，新会话生效");
        this.display();
      });
    });

    new Setting(containerEl)
      .setName("权限模式")
      .setDesc(
        "逐个询问：所有工具调用都需手动批准；智能放行：只读类工具（读文件/搜索/抓取）自动允许，写/删/执行仍询问；全部允许：不再询问（有风险）。"
      )
      .addDropdown((d) =>
        d
          .addOption("ask", "逐个询问（默认，最安全）")
          .addOption("smart", "智能放行（只读自动允许）")
          .addOption("yolo", "全部允许（YOLO）")
          .setValue(this.plugin.settings.permissionMode)
          .onChange(async (v) => {
            this.plugin.settings.permissionMode = v as "ask" | "smart" | "yolo";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("清除「始终允许」记录")
      .setDesc(
        `当前已记住 ${this.plugin.settings.grantedAlwaysTools.length} 个工具的始终允许授权。清除后这些工具将重新逐个询问。`
      )
      .addButton((b) =>
        b
          .setButtonText("清除")
          .setWarning()
          .onClick(async () => {
            const n = this.plugin.settings.grantedAlwaysTools.length;
            this.plugin.settings.grantedAlwaysTools = [];
            await this.plugin.saveSettings();
            new Notice(`已清除 ${n} 条授权记录`);
            this.display(); // 刷新计数
          })
      );

    new Setting(containerEl)
      .setName("附带当前活动笔记")
      .setDesc("发送消息时自动附上当前打开笔记的路径，帮助 Kimi 理解上下文。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.attachActiveNote).onChange(async (v) => {
          this.plugin.settings.attachActiveNote = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("历史列表隐藏诊断会话")
      .setDesc(
        "插件自我诊断复用一条固定会话（历史里显示为「🔧 自我诊断」）。开启后该会话不在历史列表中显示。"
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.hideDiagSession).onChange(async (v) => {
          this.plugin.settings.hideDiagSession = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("额外启动参数")
      .setDesc("追加给 `kimi acp` 的命令行参数，空格分隔。一般留空。")
      .addText((t) =>
        t
          .setPlaceholder("")
          .setValue(this.plugin.settings.extraArgs)
          .onChange(async (v) => {
            this.plugin.settings.extraArgs = v.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("p", {
      text: "提示：修改 CLI 路径或参数后，请在聊天界面点击「重连」使改动生效。",
      cls: "setting-item-description",
    });
  }
}
