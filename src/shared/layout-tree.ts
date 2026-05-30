/**
 * 布局树模块
 *
 * 实现终端分屏的二叉树布局数据结构。
 * 这是代码库中算法复杂度最高的模块。
 *
 * 布局树采用不可变（immutable）设计模式：
 * - 所有操作函数返回新树，不修改原树
 * - 使用深拷贝确保原树不被意外修改
 * - 这种设计使得撤销/重做操作变得简单
 *
 * 树结构说明：
 * - 叶子节点（LeafNode）：代表一个终端面板
 * - 容器节点（ContainerNode）：定义分割方向和子节点尺寸
 * - 水平分割（horizontal）：子节点从左到右排列
 * - 垂直分割（vertical）：子节点从上到下排列
 * - sizes 数组：存储每个子节点的百分比尺寸，总和为 100
 */

// ── 布局树类型 ──

/** 布局节点类型，可以是容器节点或叶子节点 */
export type LayoutNode = ContainerNode | LeafNode

/**
 * 容器节点
 *
 * 用于定义分屏布局，包含两个或多个子节点。
 * 子节点可以是叶子节点（终端面板）或其他容器节点（嵌套分屏）。
 */
export interface ContainerNode {
  /** 节点类型标识 */
  type: 'container'
  /** 分割方向：'horizontal' 为左右分割，'vertical' 为上下分割 */
  direction: 'horizontal' | 'vertical'
  /** 子节点数组，按顺序排列 */
  children: LayoutNode[]
  /** 每个子节点的百分比尺寸，总和为 100 */
  sizes: number[]
}

/**
 * 叶子节点
 *
 * 代表一个终端面板，是布局树的终端节点。
 * 通过 paneId 关联到具体的终端实例。
 */
export interface LeafNode {
  /** 节点类型标识 */
  type: 'leaf'
  /** 关联的终端面板 ID */
  paneId: string
}

// ── 序列化类型 ──

/**
 * 布局状态节点（序列化格式）
 *
 * 用于 JSON 序列化/反序列化。
 * 所有字段都是可选的，以支持部分更新和向后兼容。
 */
export interface LayoutStateNode {
  /** 节点类型：'container' 或 'leaf' */
  type: 'container' | 'leaf'
  /** 分割方向（仅容器节点） */
  direction?: 'horizontal' | 'vertical'
  /** 子节点数组（仅容器节点） */
  children?: LayoutStateNode[]
  /** 子节点尺寸数组（仅容器节点） */
  sizes?: number[]
  /** 面板 ID（仅叶子节点） */
  paneId?: string
}

// ── 工具函数 ──

/**
 * 创建叶子节点
 *
 * @param paneId - 终端面板 ID
 * @returns 新的叶子节点
 */
export function makeLeaf(paneId: string): LeafNode {
  return { type: 'leaf', paneId }
}

/**
 * 创建容器节点
 *
 * 自动计算子节点尺寸，平均分配 100% 的空间。
 * 最后一个子节点会获得余数，确保总和精确为 100。
 *
 * @param direction - 分割方向
 * @param children - 子节点数组
 * @returns 新的容器节点
 */
export function makeContainer(direction: 'horizontal' | 'vertical', children: LayoutNode[]): ContainerNode {
  const size = Math.floor(100 / children.length)
  const sizes = children.map((_, i) =>
    i === children.length - 1 ? 100 - size * (children.length - 1) : size
  )
  return { type: 'container', direction, children, sizes }
}

/**
 * 判断节点是否为叶子节点
 *
 * 使用 TypeScript 类型守卫，使后续代码可以安全访问 paneId。
 *
 * @param node - 要判断的节点
 * @returns 如果是叶子节点返回 true
 */
export function isLeaf(node: LayoutNode): node is LeafNode {
  return node.type === 'leaf'
}

/**
 * 判断节点是否为容器节点
 *
 * 使用 TypeScript 类型守卫，使后续代码可以安全访问 children 和 sizes。
 *
 * @param node - 要判断的节点
 * @returns 如果是容器节点返回 true
 */
export function isContainer(node: LayoutNode): node is ContainerNode {
  return node.type === 'container'
}

// ── 深拷贝（避免 mutation）──

/**
 * 深拷贝布局树
 *
 * 创建布局树的完整副本，确保修改副本不会影响原树。
 * 这是实现不可变操作的基础函数。
 *
 * @param node - 要拷贝的节点
 * @returns 深拷贝后的新节点
 */
export function cloneLayout(node: LayoutNode): LayoutNode {
  if (isLeaf(node)) return { ...node }
  return {
    ...node,
    sizes: [...node.sizes],
    children: node.children.map(cloneLayout)
  }
}

// ── 查找父容器 ──

/**
 * 查找指定面板的父容器和在父容器中的索引
 *
 * 在布局树中搜索指定 paneId 的叶子节点，返回其父容器和位置信息。
 * 用于在分屏和关闭面板时定位目标节点。
 *
 * @param root - 搜索的根节点
 * @param paneId - 要查找的面板 ID
 * @returns 父容器和索引，如果未找到返回 null
 */
export function findParentAndIndex(
  root: LayoutNode,
  paneId: string
): { parent: ContainerNode; index: number } | null {
  if (isContainer(root)) {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i]
      // 直接子节点匹配
      if (isLeaf(child) && child.paneId === paneId) {
        return { parent: root, index: i }
      }
      // 递归搜索子树
      const found = findParentAndIndex(child, paneId)
      if (found) return found
    }
  }
  return null
}

// ── 分屏操作（返回新树，不修改原树）──

/**
 * 执行分屏操作
 *
 * 在指定面板的位置进行分屏，创建新的终端面板。
 * 支持两种分屏模式：
 * 1. 同方向分屏：在父容器中插入新面板
 * 2. 不同方向分屏：将当前面板替换为新的嵌套容器
 *
 * 操作是不可变的，返回新的布局树。
 *
 * @param layout - 当前布局树
 * @param paneId - 要分屏的面板 ID
 * @param direction - 分屏方向
 * @returns 新的布局树和新面板的 ID
 */
export function splitPane(
  layout: LayoutNode,
  paneId: string,
  direction: 'horizontal' | 'vertical'
): { layout: LayoutNode; newPaneId: string } {
  const newPaneId = `pane_${Date.now()}`

  // 单叶子分屏：直接创建新的水平/垂直容器
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
    // 同方向分屏：在父容器中插入新面板
    parent.children.splice(index + 1, 0, makeLeaf(newPaneId))
    // 重新计算所有子节点的尺寸
    const count = parent.children.length
    const size = Math.floor(100 / count)
    parent.sizes = parent.children.map((_, i) =>
      i === count - 1 ? 100 - size * (count - 1) : size
    )
  } else {
    // 不同方向分屏：将当前面板替换为新的嵌套容器
    const newContainer = makeContainer(direction, [
      makeLeaf(paneId),
      makeLeaf(newPaneId)
    ])
    parent.children[index] = newContainer
  }

  return { layout: cloned, newPaneId }
}

// ── 关闭面板（返回新树，可能为 null）──

/**
 * 从布局树中移除指定面板
 *
 * 递归移除指定 paneId 的叶子节点，并自动简化树结构：
 * - 如果容器只剩一个子节点，将子节点提升代替容器
 * - 如果所有面板都被移除，返回 null
 *
 * 操作是不可变的，返回新的布局树。
 *
 * @param node - 当前节点
 * @param paneId - 要移除的面板 ID
 * @returns 新的节点，如果树为空返回 null
 */
export function removeFromLayout(node: LayoutNode, paneId: string): LayoutNode | null {
  // 叶子节点：如果是目标则移除，否则保留
  if (isLeaf(node)) {
    return node.paneId === paneId ? null : node
  }

  // 容器节点：递归处理子节点
  const newChildren: LayoutNode[] = []
  for (const child of node.children) {
    if (isLeaf(child)) {
      // 叶子子节点：非目标则保留
      if (child.paneId !== paneId) {
        newChildren.push(child)
      }
    } else {
      // 容器子节点：递归处理
      const updated = removeFromLayout(child, paneId)
      if (updated) {
        newChildren.push(updated)
      }
    }
  }

  // 简化规则：
  // - 无子节点：整个容器被移除
  // - 一个子节点：子节点替代容器（简化嵌套）
  // - 多个子节点：保留容器，重新计算尺寸
  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0]

  const size = Math.floor(100 / newChildren.length)
  const sizes = newChildren.map((_, i) =>
    i === newChildren.length - 1 ? 100 - size * (newChildren.length - 1) : size
  )

  return { ...node, children: newChildren, sizes }
}

// ── 收集叶子 ID ──

/**
 * 收集布局树中所有叶子节点的面板 ID
 *
 * 递归遍历树，返回所有 paneId 的数组。
 * 用于批量操作（如关闭标签时销毁所有终端）。
 *
 * @param node - 要遍历的节点
 * @returns 所有面板 ID 的数组
 */
export function collectLeafIds(node: LayoutNode): string[] {
  if (isLeaf(node)) return [node.paneId]
  return node.children.flatMap(collectLeafIds)
}

// ── 序列化 ──

/**
 * 将布局节点序列化为可存储格式
 *
 * 将运行时的布局树转换为可 JSON 序列化的格式。
 * 所有数据都被深拷贝，确保不影响原树。
 *
 * @param node - 要序列化的节点
 * @returns 序列化后的节点
 */
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

/**
 * 将序列化数据反序列化为布局节点
 *
 * 将存储的 JSON 数据转换回运行时的布局树。
 * 会自动校验数据完整性，过滤无效节点。
 *
 * @param node - 序列化的节点数据
 * @returns 反序列化后的节点，如果数据无效返回 null
 */
export function deserializeLayoutNode(node: LayoutStateNode): LayoutNode | null {
  // 叶子节点：必须有 paneId
  if (node.type === 'leaf' && node.paneId) {
    return makeLeaf(node.paneId)
  }

  // 容器节点：必须有 direction、children 和 sizes
  if (node.type === 'container' && node.direction && node.children && node.sizes) {
    const children = node.children
      .map(deserializeLayoutNode)
      .filter((n): n is LayoutNode => n !== null)

    // 过滤无效子节点后的简化规则
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
