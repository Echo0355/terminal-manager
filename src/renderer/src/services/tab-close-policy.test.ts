/**
 * 标签关闭策略测试
 *
 * 覆盖关闭标签前的确认判断，尤其是仅剩一个终端时仍应弹出确认框的场景。
 */

import { describe, expect, it } from 'vitest'
import { shouldConfirmCloseTab } from './tab-close-policy'

/** 创建仅包含 panes 的标签测试替身 */
function makeTabWithPaneCount(count: number): Parameters<typeof shouldConfirmCloseTab>[0] {
  return {
    panes: new Map(Array.from({ length: count }, (_, index) => [`pane_${index}`, {} as never]))
  }
}

describe('shouldConfirmCloseTab', () => {
  it('单个终端面板也需要确认', () => {
    expect(shouldConfirmCloseTab(makeTabWithPaneCount(1))).toBe(true)
  })

  it('多个终端面板需要确认', () => {
    expect(shouldConfirmCloseTab(makeTabWithPaneCount(2))).toBe(true)
  })

  it('没有终端面板时不需要确认', () => {
    expect(shouldConfirmCloseTab(makeTabWithPaneCount(0))).toBe(false)
  })
})
