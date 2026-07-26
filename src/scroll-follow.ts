/**
 * 滚动跟随判定（纯函数，可 Node 侧单测）：
 * 用户上翻历史时，流式渲染不得强制拉回底部。
 */

/** 距底小于该像素视为"停留在底部" */
export const NEAR_BOTTOM_PX = 60;

/** 当前滚动位置是否贴近底部 */
export function isNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = NEAR_BOTTOM_PX
): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

/**
 * 滚动跟随状态机：
 * - stuck = true 时新内容自动滚到底
 * - 用户上翻（不再贴底）→ stuck = false，新内容只显示「↓ 新消息」按钮
 * - 用户滚回底部附近 / 点击按钮 / 自己发消息 → 恢复 stuck
 */
export class ScrollFollow {
  stuck = true;

  /** 用户滚动事件后调用；返回是否处于跟随态 */
  onScroll(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
    this.stuck = isNearBottom(scrollTop, clientHeight, scrollHeight);
    return this.stuck;
  }

  /** 新内容到达：是否应自动滚动（不跟随时应由调用方显示"新消息"按钮） */
  shouldAutoScroll(): boolean {
    return this.stuck;
  }

  /** 强制恢复跟随（点"新消息"按钮 / 用户自己发消息） */
  stick(): void {
    this.stuck = true;
  }
}
