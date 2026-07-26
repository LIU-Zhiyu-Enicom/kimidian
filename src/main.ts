/**
 * Kimidian 插件入口：注册视图、命令、丝带图标、设置页。
 */
import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  WorkspaceLeaf,
  addIcon,
} from "obsidian";
import { KimiAcpClient } from "./acp-client";
import { BRAND_NAME, MOON_ICON_ID, MOON_SVG } from "./brand";
import {
  KimidianView,
  KIMIDIAN_VIEW_TYPE,
} from "./chat-view";
import { runDiagnostics } from "./diagnostics";
import { decidePermission, migratePermissionMode } from "./permission-policy";
import {
  DEFAULT_SETTINGS,
  KimidianSettings,
  KimidianSettingTab,
} from "./settings";

export default class KimidianPlugin extends Plugin {
  settings!: KimidianSettings;
  acpClient!: KimiAcpClient;
  /** 当前活动会话（持久化到 data.json，跨 Obsidian 重启；
   *  视图打开时经 session/load 回放恢复） */
  get lastSessionId(): string | null {
    return this.settings?.lastSessionId ?? null;
  }
  set lastSessionId(v: string | null) {
    if (!this.settings || this.settings.lastSessionId === v) return;
    this.settings.lastSessionId = v;
    void this.saveSettings();
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    // 品牌图标：月亮 logo（ribbon / 视图标签共用，currentColor 适配主题）
    addIcon(MOON_ICON_ID, MOON_SVG);

    this.acpClient = new KimiAcpClient(
      this.settings.cliPath,
      this.splitArgs(this.settings.extraArgs),
      {
        onSessionUpdate: (n) => {
          for (const v of this.views()) v.handleSessionUpdate(n);
        },
        onPermissionRequest: (params) => {
          const v = this.views()[0];
          if (!v) {
            // 没有打开的视图时按策略兜底（记忆 + 模式判定，与视图内一致）
            const decision = decidePermission(
              this.settings.permissionMode,
              params.toolCall,
              new Set(this.settings.grantedAlwaysTools)
            );
            if (decision === "auto-allow") {
              const opt = KimiAcpClient.pickAllowOption(params.options);
              return Promise.resolve(
                opt
                  ? { outcome: "selected" as const, optionId: opt.optionId }
                  : { outcome: "cancelled" as const }
              );
            }
            return Promise.resolve({ outcome: "cancelled" as const });
          }
          return v.handlePermissionRequest(params);
        },
        onStateChange: () => {
          for (const v of this.views()) v.refreshStatus();
        },
      }
    );

    this.registerView(
      KIMIDIAN_VIEW_TYPE,
      (leaf) => new KimidianView(leaf, this)
    );

    // 左侧丝带图标（月亮 logo）
    this.addRibbonIcon(MOON_ICON_ID, `打开 ${BRAND_NAME} 聊天`, () => {
      void this.activateView();
    });

    // 命令：打开聊天
    this.addCommand({
      id: "open-chat",
      name: "打开 Kimi 聊天侧边栏",
      callback: () => void this.activateView(),
    });

    // 命令：运行自我诊断（结果写插件目录 debug.log）
    this.addCommand({
      id: "run-diagnostics",
      name: "运行自我诊断",
      callback: () => void this.runDiagnosticsSafely(),
    });

    // 命令：发送选中文本到聊天
    this.addCommand({
      id: "send-selection-to-chat",
      name: "发送选中文本到 Kimi 聊天",
      editorCallback: (editor: Editor) => {
        const sel = editor.getSelection();
        if (!sel) {
          new Notice("请先在编辑器中选中文本");
          return;
        }
        void this.sendSelectionToChat(editor, sel);
      },
    });

    // 编辑器右键菜单
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const sel = editor.getSelection();
        if (!sel) return;
        menu.addItem((item) =>
          item
            .setTitle("发送到 Kimi 聊天")
            .setIcon("message-square")
            .onClick(() => void this.sendSelectionToChat(editor, sel))
        );
      })
    );

    this.addSettingTab(new KimidianSettingTab(this.app, this));

    // 插件加载后自动跑一次自我诊断（延迟 3s，不阻塞启动；
    // 父代理可直接读 插件目录/debug.log 自验证，无需麻烦用户）
    window.setTimeout(() => void this.runDiagnosticsSafely(), 3000);
  }

  /** 诊断并发保护：同时只允许一个诊断在跑 */
  private diagnosticsRunning = false;

  private async runDiagnosticsSafely(): Promise<void> {
    if (this.diagnosticsRunning) {
      new Notice("Kimidian 诊断正在运行中，请稍候…");
      return;
    }
    this.diagnosticsRunning = true;
    try {
      await runDiagnostics(this);
    } catch (e) {
      console.error("[kimidian] 诊断异常", e);
      new Notice(`Kimidian 诊断异常：${(e as Error).message}`);
    } finally {
      this.diagnosticsRunning = false;
    }
  }

  onunload(): void {
    this.acpClient?.stop();
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as Record<string, unknown> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
    // 旧设置迁移：autoApprove 布尔 → permissionMode（true → 全部允许）
    if (raw && raw.permissionMode === undefined) {
      this.settings.permissionMode = migratePermissionMode(raw);
    }
    // 清掉旧字段，避免残留
    delete (this.settings as unknown as Record<string, unknown>).autoApprove;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 所有打开的聊天视图实例 */
  private views(): KimidianView[] {
    const out: KimidianView[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === KIMIDIAN_VIEW_TYPE) {
        out.push(leaf.view as KimidianView);
      }
    });
    return out;
  }

  /** 打开（或聚焦）右侧边栏的聊天视图 */
  async activateView(): Promise<KimiidianOrNull> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const existing = workspace.getLeavesOfType(KIMIDIAN_VIEW_TYPE);
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: KIMIDIAN_VIEW_TYPE, active: true });
      }
    }
    if (leaf) workspace.revealLeaf(leaf);
    return (leaf?.view as KimidianView) ?? null;
  }

  private async sendSelectionToChat(editor: Editor, selection: string): Promise<void> {
    const view = await this.activateView();
    if (!view) return;
    const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    const quote = file
      ? `> 选自 [[${file.path}]]：\n\n${selection}`
      : selection;
    view.insertExternalText(quote);
  }

  private splitArgs(s: string): string[] {
    return s.split(/\s+/).filter((x) => x.length > 0);
  }
}

type KimiidianOrNull = KimidianView | null;
