/**
 * 选区复制浮层的纯逻辑（可 Node 单测）：
 * - selectionInfoIn：判断当前选区是否落在指定容器内，提取选中文字与位置
 * - selCopyPos：浮层按钮定位（选区上方居右，越界夹回容器内）
 */

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width?: number;
  height?: number;
}

/** Selection 的最小鸭子类型（真实 Selection / 测试 mock 均可） */
export interface SelectionLike {
  isCollapsed: boolean;
  rangeCount: number;
  anchorNode: unknown | null;
  toString(): string;
  getRangeAt?(i: number): { getBoundingClientRect(): RectLike };
}

export interface RootLike {
  contains(node: unknown): boolean;
}

export interface SelectionInfo {
  text: string;
  rect: RectLike | null;
}

/**
 * 选区信息：仅当选中非折叠、有实际文字、且锚点在 root 内时返回。
 * rect 取首个 range 的包围盒；取不到（异常/无 range）时为 null（调用方用兜底位置）。
 */
export function selectionInfoIn(
  root: RootLike,
  sel: SelectionLike | null | undefined
): SelectionInfo | null {
  if (!sel || sel.isCollapsed) return null;
  const text = sel.toString();
  if (!text || !text.trim()) return null;
  const node = sel.anchorNode;
  if (!node || !root.contains(node)) return null;
  let rect: RectLike | null = null;
  try {
    if (sel.rangeCount > 0 && sel.getRangeAt) {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    }
  } catch {
    rect = null;
  }
  return { text, rect };
}

/**
 * 浮层定位：选区上方、水平对齐选区右端；四周越界时夹回容器内。
 * rect 为 null 时放容器右上角兜底。返回相对容器的 px 坐标。
 */
export function selCopyPos(
  rect: RectLike | null,
  rootRect: RectLike,
  btn: { width: number; height: number },
  gap = 6
): { left: number; top: number } {
  const rw = rootRect.width ?? rootRect.right - rootRect.left;
  const rh = rootRect.height ?? rootRect.bottom - rootRect.top;
  let left: number;
  let top: number;
  if (rect) {
    left = rect.right - rootRect.left - btn.width;
    top = rect.top - rootRect.top - btn.height - gap;
  } else {
    left = rw - btn.width - 8;
    top = 8;
  }
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), Math.max(lo, hi));
  return {
    left: clamp(left, 4, rw - btn.width - 4),
    top: clamp(top, 4, rh - btn.height - 4),
  };
}
