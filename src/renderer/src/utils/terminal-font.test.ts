/**
 * xterm 终端字体配置测试
 */

import { describe, expect, it } from 'vitest'
import { TERMINAL_FONT_FAMILIES, TERMINAL_FONT_FAMILY } from './terminal-font'

function indexOfFont(font: string): number {
  return TERMINAL_FONT_FAMILIES.indexOf(font as (typeof TERMINAL_FONT_FAMILIES)[number])
}

describe('TERMINAL_FONT_FAMILY', () => {
  it('优先使用英文等宽字体，避免 Win10 缺少 Cascadia 时落到微软雅黑', () => {
    expect(indexOfFont('Consolas')).toBeGreaterThan(indexOfFont("'Cascadia Code'"))
    expect(indexOfFont('Consolas')).toBeLessThan(indexOfFont("'Microsoft YaHei'"))
  })

  it('中文等宽字体优先于微软雅黑，降低 CJK 双列网格的视觉空隙', () => {
    expect(indexOfFont('NSimSun')).toBeLessThan(indexOfFont("'Microsoft YaHei'"))
    expect(indexOfFont("'Noto Sans Mono CJK SC'")).toBeLessThan(indexOfFont("'Microsoft YaHei'"))
    expect(indexOfFont("'Microsoft YaHei'")).toBeLessThan(indexOfFont('monospace'))
  })

  it('生成 xterm 可直接使用的 font-family 字符串', () => {
    expect(TERMINAL_FONT_FAMILY).toContain("'Cascadia Code', Consolas")
    expect(TERMINAL_FONT_FAMILY).toContain("NSimSun, 'Microsoft YaHei', monospace")
  })
})
