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

// src/selection-pop.ts
var selection_pop_exports = {};
__export(selection_pop_exports, {
  selCopyPos: () => selCopyPos,
  selectionInfoIn: () => selectionInfoIn
});
module.exports = __toCommonJS(selection_pop_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  selCopyPos,
  selectionInfoIn
});
