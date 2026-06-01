/**
 * 布局工具函数
 *
 * 从 layout-render.ts 提取的纯函数，不依赖 DOM 环境，便于独立测试。
 */

import type { ContainerNode } from '../types/renderer.types'

/**
 * 规范化容器 sizes 为精确百分比（总和 = 100）
 *
 * 拖拽过程中 sizes 可能因浮点运算产生微小误差，
 * 鼠标释放时调用此函数确保数据一致性。
 *
 * @param container - 包含 sizes 数组的容器节点
 */
export function normalizeSizes(container: ContainerNode): void {
  const total = container.sizes.reduce((a, b) => a + b, 0)
  if (total <= 0) return

  for (let i = 0; i < container.sizes.length; i++) {
    container.sizes[i] = (container.sizes[i] / total) * 100
  }

  // 修正浮点误差：确保总和精确为 100
  const sum = container.sizes.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > 0.01 && container.sizes.length > 0) {
    container.sizes[container.sizes.length - 1] += 100 - sum
  }
}
