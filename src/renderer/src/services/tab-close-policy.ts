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
