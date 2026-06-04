/**
 * 标签关闭策略
 *
 * 提供关闭标签前的确认判断，避免不同入口对单终端场景产生不一致行为。
 */

import type { Tab } from '../types/renderer.types'

/**
 * 判断关闭标签前是否需要用户确认。
 *
 * @param tab - 待关闭的标签页。
 * @returns 标签中存在终端面板时返回 true。
 */
export function shouldConfirmCloseTab(tab: Pick<Tab, 'panes'>): boolean {
  return tab.panes.size > 0
}

/**
 * 判断关闭其他标签前是否需要用户确认。
 *
 * @param tabs - 待批量关闭的标签页。
 * @returns 任一标签中存在终端面板时返回 true。
 */
export function shouldConfirmCloseOtherTabs(tabs: Array<Pick<Tab, 'panes'>>): boolean {
  return tabs.some((tab) => tab.panes.size > 0)
}

/**
 * 创建关闭其他标签的确认提示文案。
 *
 * @param tabs - 待批量关闭的标签页。
 * @returns 用户确认对话框文案。
 */
export function createCloseOtherTabsConfirmMessage(tabs: Array<Pick<Tab, 'panes'>>): string {
  const paneCount = tabs.reduce((count, tab) => count + tab.panes.size, 0)
  return `确定要关闭其他 ${tabs.length} 个标签吗？其中包含 ${paneCount} 个终端面板，关闭后将全部销毁。`
}
