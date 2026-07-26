/**
 * 品牌资源：月亮主题 logo（月之暗面 Moonshot 意象）+ 名称。
 * 内联 SVG，不引外部图片（插件只发三件套）；
 * fill=currentColor 自动适配 Obsidian 明暗主题。
 */

/** 新月 logo（lucide moon 经典弧线），viewBox 24，填充 currentColor */
export const MOON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path fill="currentColor" stroke="none" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' +
  "</svg>";

/** Obsidian 图标注册名（addIcon / ribbon / view icon 共用） */
export const MOON_ICON_ID = "kimidian-moon";

/** 品牌名（视图头部、显示名） */
export const BRAND_NAME = "Kimidian";
