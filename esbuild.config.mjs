import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

// 用法: node esbuild.config.mjs [production]
// 开发模式带 watch + sourcemap；production 关闭 watch 并压缩。
const prod = process.argv[2] === "production";

const context = await esbuild.context({
  banner: {
    js: "/* Kimidian — 在 Obsidian 侧边栏嵌入 Kimi Code CLI (ACP) */",
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  await context.dispose();
  console.log("构建完成: main.js");
} else {
  await context.watch();
  console.log("watch 模式已启动…");
}
