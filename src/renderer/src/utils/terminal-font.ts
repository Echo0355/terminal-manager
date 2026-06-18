/**
 * xterm 终端字体配置
 *
 * 集中维护终端字体栈，避免 Windows 10 上中文 fallback 到非等宽 UI 字体后，
 * 在 xterm 的双列 CJK 网格中出现视觉字距过宽。
 */

/**
 * 终端字体 fallback 列表。
 *
 * 英文优先使用现代等宽字体；中文优先使用等宽 CJK 字体，最后才回退到
 * Microsoft YaHei，避免 Win10 上微软雅黑中文字形没有填满双列单元格。
 */
export const TERMINAL_FONT_FAMILIES = [
  "'Cascadia Mono'",
  "'Cascadia Code'",
  "Consolas",
  "'Courier New'",
  "'Sarasa Mono SC'",
  "'Noto Sans Mono CJK SC'",
  "'Source Han Mono SC'",
  "'Microsoft YaHei Mono'",
  "NSimSun",
  "'Microsoft YaHei'",
  "monospace"
] as const

/**
 * xterm.js 使用的 CSS font-family 字符串。
 */
export const TERMINAL_FONT_FAMILY = TERMINAL_FONT_FAMILIES.join(', ')
