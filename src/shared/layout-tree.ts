// ── 布局树类型 ──

export type LayoutNode = ContainerNode | LeafNode

export interface ContainerNode {
  type: 'container'
  direction: 'horizontal' | 'vertical'
  children: LayoutNode[]
  sizes: number[]
}

export interface LeafNode {
  type: 'leaf'
  paneId: string
}

// ── 序列化类型 ──

export interface LayoutStateNode {
  type: 'container' | 'leaf'
  direction?: 'horizontal' | 'vertical'
  children?: LayoutStateNode[]
  sizes?: number[]
  paneId?: string
}

// ── 工具函数 ──

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

// ── 深拷贝（避免 mutation）──

export function cloneLayout(node: LayoutNode): LayoutNode {
  if (isLeaf(node)) return { ...node }
  return {
    ...node,
    sizes: [...node.sizes],
    children: node.children.map(cloneLayout)
  }
}

// ── 查找父容器 ──

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

// ── 分屏操作（返回新树，不修改原树）──

export function splitPane(
  layout: LayoutNode,
  paneId: string,
  direction: 'horizontal' | 'vertical'
): { layout: LayoutNode; newPaneId: string } {
  const newPaneId = `pane_${Date.now()}`

  // 单叶子分屏
  if (isLeaf(layout)) {
    if (layout.paneId !== paneId) return { layout, newPaneId }
    const newLayout = makeContainer(direction, [
      makeLeaf(paneId),
      makeLeaf(newPaneId)
    ])
    return { layout: newLayout, newPaneId }
  }

  // 容器分屏：深拷贝后操作
  const cloned = cloneLayout(layout) as ContainerNode
  const found = findParentAndIndex(cloned, paneId)
  if (!found) return { layout: cloned, newPaneId }

  const { parent, index } = found

  if (parent.direction === direction) {
    parent.children.splice(index + 1, 0, makeLeaf(newPaneId))
    const count = parent.children.length
    const size = Math.floor(100 / count)
    parent.sizes = parent.children.map((_, i) =>
      i === count - 1 ? 100 - size * (count - 1) : size
    )
  } else {
    const newContainer = makeContainer(direction, [
      makeLeaf(paneId),
      makeLeaf(newPaneId)
    ])
    parent.children[index] = newContainer
  }

  return { layout: cloned, newPaneId }
}

// ── 关闭面板（返回新树，可能为 null）──

export function removeFromLayout(node: LayoutNode, paneId: string): LayoutNode | null {
  if (isLeaf(node)) {
    return node.paneId === paneId ? null : node
  }

  const newChildren: LayoutNode[] = []
  for (const child of node.children) {
    if (isLeaf(child)) {
      if (child.paneId !== paneId) {
        newChildren.push(child)
      }
    } else {
      const updated = removeFromLayout(child, paneId)
      if (updated) {
        newChildren.push(updated)
      }
    }
  }

  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0]

  const size = Math.floor(100 / newChildren.length)
  const sizes = newChildren.map((_, i) =>
    i === newChildren.length - 1 ? 100 - size * (newChildren.length - 1) : size
  )

  return { ...node, children: newChildren, sizes }
}

// ── 收集叶子 ID ──

export function collectLeafIds(node: LayoutNode): string[] {
  if (isLeaf(node)) return [node.paneId]
  return node.children.flatMap(collectLeafIds)
}

// ── 序列化 ──

export function serializeLayoutNode(node: LayoutNode): LayoutStateNode {
  if (isLeaf(node)) {
    return { type: 'leaf', paneId: node.paneId }
  }
  return {
    type: 'container',
    direction: node.direction,
    sizes: [...node.sizes],
    children: node.children.map(serializeLayoutNode)
  }
}

export function deserializeLayoutNode(node: LayoutStateNode): LayoutNode | null {
  if (node.type === 'leaf' && node.paneId) {
    return makeLeaf(node.paneId)
  }
  if (node.type === 'container' && node.direction && node.children && node.sizes) {
    const children = node.children
      .map(deserializeLayoutNode)
      .filter((n): n is LayoutNode => n !== null)
    if (children.length === 0) return null
    if (children.length === 1) return children[0]
    return {
      type: 'container',
      direction: node.direction,
      sizes: [...node.sizes],
      children
    }
  }
  return null
}
