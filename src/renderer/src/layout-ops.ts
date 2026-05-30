/**
 * 布局树操作（可变版本）
 *
 * 与 src/shared/layout-tree.ts 的不可变版本不同，
 * 此模块直接修改布局树节点，用于渲染进程的实时操作。
 */

import type { LayoutNode, ContainerNode, LeafNode, Tab } from './types'

export function makeLeaf(paneId: string): LeafNode {
  return { type: 'leaf', paneId }
}

export function makeContainer(direction: 'horizontal' | 'vertical', children: LayoutNode[]): ContainerNode {
  const size = Math.floor(100 / children.length)
  const sizes = children.map((_, i) =>
    i === children.length - 1 ? 100 - size * (children.length - 1) : size
  )
  return { type: 'container', direction, children, sizes }
}

/**
 * 在现有 sizes 数组中插入新子节点的空间分配（Distribute 模式）
 *
 * 对标 VS Code 的 Sizing.Distribute：
 * 新面板加入时，现有面板按相对比例缩小，新面板获得平均大小的空间。
 *
 * 算法：
 * - 每个现有面板的新尺寸 = 原尺寸 × (N-1)/N
 * - 新面板获得 100/N（即总空间的 1/N）
 * - 这确保现有面板的相对比例保持不变
 *
 * @param existingSizes - 现有子节点的百分比尺寸数组
 * @param insertIndex - 新子节点的插入位置
 * @returns 包含新子节点的完整 sizes 数组
 */
export function distributeOnInsert(existingSizes: number[], insertIndex: number): number[] {
  const n = existingSizes.length + 1
  const scaleFactor = (n - 1) / n

  // 计算缩小后的现有面板尺寸
  const scaledExisting = existingSizes.map((s) => Math.round(s * scaleFactor * 100) / 100)

  // 新面板获得 100/N 的空间
  const newSize = Math.round((100 / n) * 100) / 100

  // 组装最终数组
  const result: number[] = []
  for (let i = 0; i < scaledExisting.length; i++) {
    if (i === insertIndex) {
      result.push(newSize)
    }
    result.push(scaledExisting[i])
  }
  if (insertIndex >= scaledExisting.length) {
    result.push(newSize)
  }

  // 修正浮点误差：确保总和精确为 100
  const total = result.reduce((a, b) => a + b, 0)
  if (Math.abs(total - 100) > 0.01 && result.length > 0) {
    // 将误差分配到最后一个元素
    result[result.length - 1] = Math.round((100 - total + result[result.length - 1]) * 100) / 100
  }

  return result
}

/**
 * 从 sizes 数组中移除子节点后的空间重分配（Distribute 模式）
 *
 * 对标 VS Code 的 distributeEmptySpace()：
 * 被移除面板的空间按相对比例分配给剩余面板。
 *
 * @param existingSizes - 现有子节点的百分比尺寸数组
 * @param removeIndex - 要移除的子节点索引
 * @returns 移除后的 sizes 数组
 */
export function distributeOnRemove(existingSizes: number[], removeIndex: number): number[] {
  const remaining = existingSizes.filter((_, i) => i !== removeIndex)

  if (remaining.length === 0) return []
  if (remaining.length === 1) return [100]

  // 按相对比例重新分配被移除的空间
  const currentTotal = remaining.reduce((a, b) => a + b, 0)
  const scaleFactor = 100 / currentTotal

  const newSizes = remaining.map((s) => Math.round(s * scaleFactor * 100) / 100)

  // 修正浮点误差
  const total = newSizes.reduce((a, b) => a + b, 0)
  if (Math.abs(total - 100) > 0.01) {
    newSizes[newSizes.length - 1] = Math.round((100 - total + newSizes[newSizes.length - 1]) * 100) / 100
  }

  return newSizes
}

export function isLeaf(node: LayoutNode): node is LeafNode {
  return node.type === 'leaf'
}

export function isContainer(node: LayoutNode): node is ContainerNode {
  return node.type === 'container'
}

/**
 * 收集布局树中所有叶子节点的面板 ID
 */
export function collectLeafIds(node: LayoutNode): string[] {
  if (isLeaf(node)) return [node.paneId]
  return node.children.flatMap(collectLeafIds)
}

export function findParentAndIndex(
  root: LayoutNode,
  paneId: string
): { parent: ContainerNode; index: number } | null {
  if (isContainer(root)) {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i]
      if (isLeaf(child) && child.paneId === paneId) {
        return { parent: root, index: i }
      }
      const found = findParentAndIndex(child, paneId)
      if (found) return found
    }
  }
  return null
}

/**
 * 从布局树中移除指定面板（直接修改节点）
 * @returns 是否找到并移除了面板
 */
export function removeFromLayout(node: LayoutNode, paneId: string): boolean {
  if (isContainer(node)) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      if (isLeaf(child) && child.paneId === paneId) {
        node.children.splice(i, 1)
        if (node.children.length > 0) {
          // Distribute 模式：按相对比例重新分配被移除面板的空间
          node.sizes = distributeOnRemove(node.sizes, i)
        } else {
          node.sizes = []
        }
        return true
      }
      if (isContainer(child)) {
        if (removeFromLayout(child, paneId)) {
          if (child.children.length === 1) {
            node.children[i] = child.children[0]
          }
          return true
        }
      }
    }
  }
  return false
}

/**
 * 简化布局树：根容器只有一个子节点时提升该子节点
 */
export function simplifyLayout(tab: Tab): void {
  if (isContainer(tab.layout) && tab.layout.children.length === 1) {
    tab.layout = tab.layout.children[0]
  }
}

/**
 * 查找相邻面板
 */
export function findAdjacentPane(
  root: LayoutNode,
  currentPaneId: string,
  direction: 'left' | 'right' | 'up' | 'down'
): string | null {
  const path: { node: LayoutNode; parent?: ContainerNode; indexInParent?: number }[] = []

  function find(node: LayoutNode, parent?: ContainerNode, idx?: number): boolean {
    if (isLeaf(node)) {
      if (node.paneId === currentPaneId) {
        path.push({ node, parent, indexInParent: idx })
        return true
      }
      return false
    }
    path.push({ node, parent, indexInParent: idx })
    for (let i = 0; i < node.children.length; i++) {
      if (find(node.children[i], node, i)) return true
    }
    path.pop()
    return false
  }

  find(root)

  for (let i = path.length - 1; i >= 0; i--) {
    const entry = path[i]
    if (!entry.parent || entry.indexInParent === undefined) continue

    const container = entry.parent
    const childIndex = entry.indexInParent

    const isHorizontalDir = direction === 'left' || direction === 'right'
    const isHorizontalSplit = container.direction === 'horizontal'

    if (isHorizontalDir === isHorizontalSplit) {
      const targetIndex = (direction === 'left' || direction === 'up')
        ? childIndex - 1
        : childIndex + 1

      if (targetIndex >= 0 && targetIndex < container.children.length) {
        return findDeepestLeaf(container.children[targetIndex], direction)
      }
    }
  }

  return null
}

function findDeepestLeaf(node: LayoutNode, direction: string): string {
  if (isLeaf(node)) return node.paneId
  const idx = (direction === 'left' || direction === 'up')
    ? node.children.length - 1
    : 0
  return findDeepestLeaf(node.children[idx], direction)
}

/**
 * 将新节点插入到目标面板的指定方向
 *
 * 注意：如果目标面板是根节点（叶子），调用方需要自行处理，
 * 因为此函数无法替换根节点引用。
 *
 * @param root - 布局树根节点（可变，直接修改）
 * @param targetPaneId - 目标面板 ID
 * @param sourceNode - 要插入的节点（叶子或容器）
 * @param position - 插入位置
 */
export function insertAtPosition(
  root: LayoutNode,
  targetPaneId: string,
  sourceNode: LayoutNode,
  position: 'left' | 'right' | 'top' | 'bottom'
): void {
  const direction = (position === 'left' || position === 'right') ? 'horizontal' : 'vertical'
  const found = findParentAndIndex(root, targetPaneId)

  if (!found) return

  const { parent, index } = found

  if (parent.direction === direction) {
    // 方向匹配：直接在父容器中插入（Distribute 模式）
    const insertIndex = (position === 'left' || position === 'top') ? index : index + 1
    parent.children.splice(insertIndex, 0, sourceNode)
    parent.sizes = distributeOnInsert(parent.sizes, insertIndex)
  } else {
    // 方向不匹配：将目标叶子替换为嵌套容器
    const newContainer = makeContainer(direction, [
      (position === 'left' || position === 'top') ? sourceNode : makeLeaf(targetPaneId),
      (position === 'left' || position === 'top') ? makeLeaf(targetPaneId) : sourceNode,
    ])
    parent.children[index] = newContainer
  }
}
