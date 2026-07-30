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

// src/scroll-follow.ts
var scroll_follow_exports = {};
__export(scroll_follow_exports, {
  NEAR_BOTTOM_PX: () => NEAR_BOTTOM_PX,
  ScrollFollow: () => ScrollFollow,
  isNearBottom: () => isNearBottom
});
module.exports = __toCommonJS(scroll_follow_exports);
var NEAR_BOTTOM_PX = 60;
function isNearBottom(scrollTop, clientHeight, scrollHeight, threshold = NEAR_BOTTOM_PX) {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}
var ScrollFollow = class {
  constructor() {
    this.stuck = true;
  }
  /** 用户滚动事件后调用；返回是否处于跟随态 */
  onScroll(scrollTop, clientHeight, scrollHeight) {
    this.stuck = isNearBottom(scrollTop, clientHeight, scrollHeight);
    return this.stuck;
  }
  /** 新内容到达：是否应自动滚动（不跟随时应由调用方显示"新消息"按钮） */
  shouldAutoScroll() {
    return this.stuck;
  }
  /** 强制恢复跟随（点"新消息"按钮 / 用户自己发消息） */
  stick() {
    this.stuck = true;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NEAR_BOTTOM_PX,
  ScrollFollow,
  isNearBottom
});
