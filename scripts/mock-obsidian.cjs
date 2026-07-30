// Obsidian + DOM 最小 mock：让 chat-view.ts 能在 Node 里实例化并做 DOM 级断言。
// 通过 esbuild --alias:obsidian=此文件 注入。
"use strict";

// ---------- 最小 DOM ----------
class FakeClassList {
  constructor() { this._s = new Set(); }
  add(...cs) { cs.forEach((c) => this._s.add(c)); }
  remove(...cs) { cs.forEach((c) => this._s.delete(c)); }
  toggle(c, force) {
    const want = force === undefined ? !this._s.has(c) : !!force;
    if (want) this._s.add(c); else this._s.delete(c);
    return want;
  }
  contains(c) { return this._s.has(c); }
}

let idSeq = 0;
class FakeEl {
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
  createDiv(o = {}) { return this.createEl("div", o); }
  createSpan(o = {}) { return this.createEl("span", o); }
  createEl(tag, o = {}) {
    const el = new FakeEl(tag);
    if (o.cls) o.cls.split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    if (o.text !== undefined) el.setText(o.text);
    if (o.attr) Object.assign(el.attrs, o.attr);
    if (o.value !== undefined) el.value = o.value;
    if (o.type !== undefined) el.attrs.type = o.type;
    this.appendChild(el);
    return el;
  }
  setText(t) { this._text = String(t ?? ""); this.children = []; }
  empty() { this.children = []; this._text = ""; }
  addClass(c) { this.classList.add(c); }
  remove() { if (this.parentEl) this.parentEl.children = this.parentEl.children.filter((c) => c !== this); }
  appendChild(c) { c.parentEl = this; this.children.push(c); return c; }
  addEventListener(t, f) { (this._listeners[t] ??= []).push(f); }
  removeEventListener(t, f) {
    this._listeners[t] = (this._listeners[t] ?? []).filter((g) => g !== f);
  }
  dispatch(t, ev = {}) { (this._listeners[t] ?? []).forEach((f) => f(ev)); }
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
  find(pred) { return this.findAll(pred)[0] ?? null; }
  // 标准 DOM 选择器：仅支持 ".class"（测试断言够用；querySelectorAll 返回数组即可，调用方会 Array.from）
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const cls = String(sel).replace(/^\./, "");
    return this.findAll((e) => e.classList.contains(cls));
  }
  // select 语义
  get options() { return this.children.filter((c) => c.tagName === "OPTION"); }
  get selectedIndex() { return this.options.findIndex((o) => o.selected); }
  // textarea/select 的值
  get value() { return this._value ?? ""; }
  set value(v) { this._value = v; }
  focus() {}
  scrollTo() {}
  get scrollTop() { return 0; }
  get clientHeight() { return 500; }
  get scrollHeight() { return 500; }
  set scrollTop(v) {}
}

// ---------- obsidian 模块 mock ----------
class FakeItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf?.app;
    this.contentEl = new FakeEl("div");
  }
  getViewType() { return "mock"; }
  getDisplayText() { return "mock"; }
  getIcon() { return "mock"; }
  async onOpen() {}
  async onClose() {}
}

class FakeNotice {
  constructor(msg) { FakeNotice.log.push(String(msg)); }
}
FakeNotice.log = [];

class FakeMenuItem {
  constructor() { this._title = ""; this._checked = false; this._disabled = false; this._onClick = null; }
  setTitle(t) { this._title = t; return this; }
  setIcon() { return this; }
  setChecked(c) { this._checked = c; return this; }
  setDisabled(d) { this._disabled = d; return this; }
  onClick(f) { this._onClick = f; return this; }
}
class FakeMenu {
  constructor() { this.items = []; }
  addItem(f) { const it = new FakeMenuItem(); f(it); this.items.push(it); return this; }
  showAtMouseEvent() {}
}

class FakeFileSystemAdapter {
  constructor(base) {
    this._base = base;
    this.__files = new Map(); // path -> { text?: string, bin?: ArrayBuffer }
    this.__dirs = new Set([""]);
  }
  getBasePath() { return this._base; }
  async read(path) {
    const f = this.__files.get(path);
    if (f && typeof f.text === "string") return f.text;
    throw new Error("ENOENT: " + path);
  }
  async readBinary(path) {
    const f = this.__files.get(path);
    if (f && f.bin) return f.bin;
    throw new Error("ENOENT: " + path);
  }
  async write(path, text) { this.__files.set(path, { text }); }
  async writeBinary(path, bin) { this.__files.set(path, { bin }); }
  async exists(path) { return this.__files.has(path) || this.__dirs.has(path); }
  async mkdir(path) { this.__dirs.add(path); }
}

const FakeMarkdownRenderer = {
  render(app, md, el) { if (el && el.setText) el.setText(String(md ?? "")); return Promise.resolve(); },
  renderMarkdown() { return Promise.resolve(); },
};

// chat-view 用 window.setTimeout/clearTimeout（Obsidian 环境有；Node 测试补全局）
if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
}
// window.getSelection：测试通过 globalThis.__mockSelection 注入选区状态
const __collapsedSel = () => ({
  isCollapsed: true, rangeCount: 0, anchorNode: null,
  toString: () => "", removeAllRanges() {},
});
globalThis.window.getSelection = () => globalThis.__mockSelection ?? __collapsedSel();
globalThis.__collapsedSel = __collapsedSel;
// window.confirm：删除确认对话框；测试用 globalThis.__mockConfirm 注入应答（默认确认）
globalThis.window.confirm = (msg) => (globalThis.__mockConfirm ?? (() => true))(msg);

// document：selectionchange 监听目标（与 FakeEl 相同的监听器模式）
if (typeof globalThis.document === "undefined") {
  const listeners = {};
  globalThis.document = {
    addEventListener(t, f) { (listeners[t] ??= []).push(f); },
    removeEventListener(t, f) { listeners[t] = (listeners[t] ?? []).filter((g) => g !== f); },
    dispatch(t, ev = {}) { (listeners[t] ?? []).forEach((f) => f(ev)); },
  };
}

function setIcon(el, id) {
  // 真实 Obsidian 会把注册图标渲染成内联 SVG（fill/stroke 用 currentColor）
  if (el) el.innerHTML = `<svg data-icon="${String(id)}" stroke="currentColor"></svg>`;
}

module.exports = {
  App: class FakeApp {},
  FileSystemAdapter: FakeFileSystemAdapter,
  ItemView: FakeItemView,
  MarkdownRenderer: FakeMarkdownRenderer,
  Menu: FakeMenu,
  Notice: FakeNotice,
  // TFile/TFolder：bundle 内联的是另一份 mock 类，instanceof 会跨类失效，
  // 用 __mockTFile/__mockTFolder 标记 + Symbol.hasInstance 让两份类互相承认
  TFile: class FakeTFile {
    constructor() { this.__mockTFile = true; }
    static [Symbol.hasInstance](x) { return !!x && x.__mockTFile === true; }
  },
  TFolder: class FakeTFolder {
    constructor() { this.__mockTFolder = true; }
    static [Symbol.hasInstance](x) { return !!x && x.__mockTFolder === true; }
  },
  WorkspaceLeaf: class FakeWorkspaceLeaf {},
  setIcon,
  // 测试工具出口
  __fake: { FakeEl, FakeNotice, FakeMenu },
};
