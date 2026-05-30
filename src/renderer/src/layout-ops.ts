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

export function isLeaf(node: LayoutNode): node is LeafNode {
  return node.type === 'leaf'
}

export function isContainer(node: LayoutNode): node is ContainerNode {
  return node.type === 'container'
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
        node.sizes.splice(i, 1)
        if (node.children.length > 0) {
          const count = node.children.length
          const size = Math.floor(100 / count)
          node.sizes = node.children.map((_, j) =>
            j === count - 1 ? 100 - size * (count - 1) : size
          )
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
