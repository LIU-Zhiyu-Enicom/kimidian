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

// src/config-options.ts
var config_options_exports = {};
__export(config_options_exports, {
  BUILTIN_MODEL_OPTIONS: () => BUILTIN_MODEL_OPTIONS,
  DEFAULT_MODEL: () => DEFAULT_MODEL,
  normalizeModelInput: () => normalizeModelInput,
  pickModelOption: () => pickModelOption,
  pickThinkingOption: () => pickThinkingOption,
  selectViewState: () => selectViewState,
  summarizeConfigOptions: () => summarizeConfigOptions
});
module.exports = __toCommonJS(config_options_exports);
var DEFAULT_MODEL = "kimi-code/k3";
var BUILTIN_MODEL_OPTIONS = [
  { value: "kimi-code/kimi-for-coding", name: "K2.7 Coding" },
  { value: "kimi-code/kimi-for-coding-highspeed", name: "K2.7 Coding Highspeed" },
  { value: "kimi-code/k3", name: "K3" }
];
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
function summarizeConfigOptions(opts) {
  if (!opts || opts.length === 0) return "configOptions: <\u7A7A>";
  const parts = opts.map(
    (o) => `${o.id}=${o.currentValue ?? "?"}(${o.options?.length ?? 0} \u9009\u9879)`
  );
  return `configOptions: ${opts.length} \u9879 [${parts.join(", ")}]`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BUILTIN_MODEL_OPTIONS,
  DEFAULT_MODEL,
  normalizeModelInput,
  pickModelOption,
  pickThinkingOption,
  selectViewState,
  summarizeConfigOptions
});
