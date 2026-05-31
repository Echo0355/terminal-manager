/**
 * 布局树操作（可变版本）测试
 *
 * 测试 layout-ops.ts 中的可变布局树操作函数。
 * 与 src/shared/layout-tree.test.ts 的不可变版本测试互补。
 * 覆盖以下方面：
 * - 节点创建和类型判断
 * - Distribute 模式的空间分配算法
 * - 可变移除操作和树简化
 * - 方向导航算法
 * - 可变插入操作
 */

import { describe, it, expect } from 'vitest'
import {
  makeLeaf,
  makeContainer,
  distributeOnInsert,
  distributeOnRemove,
  isLeaf,
  isContainer,
  collectLeafIds,
  findParentAndIndex,
  removeFromLayout,
  simplifyLayout,
  findAdjacentPane,
  insertAtPosition,
  type ContainerNode,
  type LeafNode
} from './layout-ops'

// ── 节点创建和类型判断 ──

describe('布局树基础', () => {
  it('makeLeaf 创建叶子节点', () => {
    const leaf = makeLeaf('pane_1')
    expect(leaf.type).toBe('leaf')
    expect(leaf.paneId).toBe('pane_1')
  })

  it('makeContainer 创建容器节点并平均分配 sizes', () => {
    const container = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(container.type).toBe('container')
    expect(container.direction).toBe('horizontal')
    expect(container.children).toHaveLength(2)
    expect(container.sizes).toEqual([50, 50])
  })

  it('makeContainer 三个子节点分配 sizes', () => {
    const container = makeContainer('vertical', [makeLeaf('A'), makeLeaf('B'), makeLeaf('C')])
    expect(container.sizes).toEqual([33, 33, 34])
  })

  it('makeContainer sizes 总和为 100', () => {
    const container = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B'), makeLeaf('C'), makeLeaf('D')])
    const sum = container.sizes.reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })

  it('isLeaf 正确判断叶子节点', () => {
    expect(isLeaf(makeLeaf('A'))).toBe(true)
    expect(isLeaf(makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')]))).toBe(false)
  })

  it('isContainer 正确判断容器节点', () => {
    expect(isContainer(makeLeaf('A'))).toBe(false)
    expect(isContainer(makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')]))).toBe(true)
  })
})

// ── Distribute 模式：插入空间分配 ──

describe('distributeOnInsert', () => {
  it('在两个面板中间插入，三个面板 sizes 总和为 100', () => {
    const result = distributeOnInsert([50, 50], 1)
    expect(result).toHaveLength(3)
    const total = result.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })

  it('在头部插入（insertIndex=0）', () => {
    const result = distributeOnInsert([50, 50], 0)
    expect(result).toHaveLength(3)
    // 新面板在最前面
    const total = result.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })

  it('在尾部插入（insertIndex >= length）', () => {
    const result = distributeOnInsert([50, 50], 2)
    expect(result).toHaveLength(3)
    const total = result.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })

  it('从单面板插入第二个面板', () => {
    const result = distributeOnInsert([100], 0)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(50)
    expect(result[1]).toBe(50)
  })

  it('不等比面板插入后相对比例保持不变', () => {
    // 原始 [70, 30]，插入后每个现有面板缩小为 原尺寸 × 2/3
    const result = distributeOnInsert([70, 30], 1)
    expect(result).toHaveLength(3)
    // 验证现有面板的相对比例：result[0]/result[2] ≈ 70/30
    const ratio = result[0] / result[2]
    expect(Math.abs(ratio - 70 / 30)).toBeLessThan(0.1)
  })

  it('四个面板插入第五个，sizes 总和精确 100', () => {
    const result = distributeOnInsert([25, 25, 25, 25], 2)
    expect(result).toHaveLength(5)
    const total = result.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })
})

// ── Distribute 模式：移除空间分配 ──

describe('distributeOnRemove', () => {
  it('移除后剩余面板按比例重分配', () => {
    const result = distributeOnRemove([33, 33, 34], 1)
    expect(result).toHaveLength(2)
    const total = result.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })

  it('移除后只剩一个面板返回 [100]', () => {
    expect(distributeOnRemove([50, 50], 1)).toEqual([100])
    expect(distributeOnRemove([50, 50], 0)).toEqual([100])
  })

  it('移除所有面板返回空数组', () => {
    expect(distributeOnRemove([100], 0)).toEqual([])
  })

  it('移除不等比面板后比例正确', () => {
    // 原始 [70, 20, 10]，移除中间的 20
    const result = distributeOnRemove([70, 20, 10], 1)
    expect(result).toHaveLength(2)
    // 70 和 10 按比例重分配：70/(70+10)*100=87.5, 10/(70+10)*100=12.5
    expect(Math.abs(result[0] - 87.5)).toBeLessThan(0.5)
    expect(Math.abs(result[1] - 12.5)).toBeLessThan(0.5)
    const total = result.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })

  it('从四个均等面板移除一个', () => {
    const result = distributeOnRemove([25, 25, 25, 25], 2)
    expect(result).toHaveLength(3)
    // 剩余三个均等分配：每个 ≈ 33.33
    const total = result.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })
})

// ── collectLeafIds ──

describe('collectLeafIds', () => {
  it('单个叶子', () => {
    expect(collectLeafIds(makeLeaf('A'))).toEqual(['A'])
  })

  it('简单容器', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(collectLeafIds(tree)).toEqual(['A', 'B'])
  })

  it('嵌套容器', () => {
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    expect(collectLeafIds(tree)).toEqual(['A', 'B', 'C'])
  })
})

// ── findParentAndIndex ──

describe('findParentAndIndex', () => {
  it('在简单容器中找到叶子', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const result = findParentAndIndex(tree, 'B')
    expect(result).not.toBeNull()
    expect(result!.index).toBe(1)
    expect(result!.parent.direction).toBe('horizontal')
  })

  it('在嵌套容器中找到叶子', () => {
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    const result = findParentAndIndex(tree, 'B')
    expect(result).not.toBeNull()
    expect(result!.index).toBe(1)
    expect(result!.parent.direction).toBe('vertical')
  })

  it('找不到不存在的叶子返回 null', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(findParentAndIndex(tree, 'X')).toBeNull()
  })

  it('在单个叶子节点中找不到父容器', () => {
    expect(findParentAndIndex(makeLeaf('A'), 'A')).toBeNull()
  })
})

// ── removeFromLayout（可变版本） ──

describe('removeFromLayout', () => {
  it('从容器中直接移除子叶子', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const removed = removeFromLayout(tree, 'B')
    expect(removed).toBe(true)
    expect(tree.children).toHaveLength(1)
    expect(collectLeafIds(tree)).toEqual(['A'])
  })

  it('移除后 sizes 被重分配', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B'), makeLeaf('C')])
    removeFromLayout(tree, 'B')
    expect(tree.children).toHaveLength(2)
    expect(tree.sizes).toHaveLength(2)
    const total = tree.sizes.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })

  it('从嵌套容器中移除叶子', () => {
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    const removed = removeFromLayout(tree, 'B')
    expect(removed).toBe(true)
    expect(collectLeafIds(tree)).toEqual(['A', 'C'])
  })

  it('移除后根容器不自动简化（由 simplifyLayout 负责）', () => {
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A')]),
      makeLeaf('C')
    ])
    removeFromLayout(tree, 'C')
    // C 被直接移除，根容器剩一个子节点（垂直容器），但不会自动简化
    expect(tree.children).toHaveLength(1)
    expect(isContainer(tree.children[0])).toBe(true)
    expect(collectLeafIds(tree)).toEqual(['A'])
  })

  it('移除不存在的叶子返回 false', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(removeFromLayout(tree, 'X')).toBe(false)
    expect(collectLeafIds(tree)).toEqual(['A', 'B'])
  })

  it('对叶子节点调用返回 false', () => {
    expect(removeFromLayout(makeLeaf('A'), 'A')).toBe(false)
  })

  it('移除所有子节点后 sizes 为空', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    removeFromLayout(tree, 'A')
    removeFromLayout(tree, 'B')
    expect(tree.children).toHaveLength(0)
    expect(tree.sizes).toEqual([])
  })
})

// ── simplifyLayout ──

describe('simplifyLayout', () => {
  it('根容器只有一个子节点时提升为叶子', () => {
    const tab = {
      layout: makeContainer('horizontal', [makeLeaf('A')])
    }
    simplifyLayout(tab as any)
    expect(isLeaf(tab.layout)).toBe(true)
    expect((tab.layout as unknown as LeafNode).paneId).toBe('A')
  })

  it('根容器有多个子节点时不变', () => {
    const original = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const tab = { layout: original }
    simplifyLayout(tab as any)
    expect(tab.layout).toBe(original)
    expect(isContainer(tab.layout)).toBe(true)
  })

  it('根节点是叶子时不变', () => {
    const tab = { layout: makeLeaf('A') }
    simplifyLayout(tab as any)
    expect(isLeaf(tab.layout)).toBe(true)
  })
})

// ── findAdjacentPane ──

describe('findAdjacentPane', () => {
  it('水平分割中向右查找', () => {
    // [A | B]，从 A 向右找 → B
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(findAdjacentPane(tree, 'A', 'right')).toBe('B')
  })

  it('水平分割中向左查找', () => {
    // [A | B]，从 B 向左找 → A
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(findAdjacentPane(tree, 'B', 'left')).toBe('A')
  })

  it('垂直分割中向下查找', () => {
    // [A / B]（垂直），从 A 向下找 → B
    const tree = makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')])
    expect(findAdjacentPane(tree, 'A', 'down')).toBe('B')
  })

  it('垂直分割中向上查找', () => {
    // [A / B]（垂直），从 B 向上找 → A
    const tree = makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')])
    expect(findAdjacentPane(tree, 'B', 'up')).toBe('A')
  })

  it('边界处找不到相邻面板返回 null', () => {
    // [A | B]，从 A 向左找 → null
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(findAdjacentPane(tree, 'A', 'left')).toBeNull()
  })

  it('最右端找不到返回 null', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(findAdjacentPane(tree, 'B', 'right')).toBeNull()
  })

  it('方向不匹配时返回 null', () => {
    // 水平分割 [A | B]，从 A 向上找 → 方向不匹配，返回 null
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(findAdjacentPane(tree, 'A', 'up')).toBeNull()
  })

  it('嵌套容器中跨层查找', () => {
    // 水平 [ 垂直[A, B] | C ]
    // 从 B 向右找 → 方向：right 是水平方向，匹配外层水平容器
    // B 在垂直容器中的 index=1，垂直容器在水平容器中的 index=0
    // 向右 → targetIndex = 0+1 = 1 → C
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    expect(findAdjacentPane(tree, 'B', 'right')).toBe('C')
  })

  it('嵌套容器中向左跨层查找', () => {
    // 水平 [ 垂直[A, B] | C ]
    // 从 C 向左找 → 匹配外层水平容器，targetIndex = 1-1 = 0 → 垂直容器
    // findDeepestLeaf(left) → 取最后一个子节点 → B
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    expect(findAdjacentPane(tree, 'C', 'left')).toBe('B')
  })

  it('查找不存在的面板返回 null', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    expect(findAdjacentPane(tree, 'X', 'right')).toBeNull()
  })
})

// ── insertAtPosition ──

describe('insertAtPosition', () => {
  it('方向匹配时在右侧插入', () => {
    // 水平 [A | B]，在 B 右侧插入 C → [A | B | C]
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const result = insertAtPosition(tree, 'B', makeLeaf('C'), 'right')
    expect(result).toBe(true)
    expect(tree.children).toHaveLength(3)
    expect(collectLeafIds(tree)).toEqual(['A', 'B', 'C'])
  })

  it('方向匹配时在左侧插入', () => {
    // 水平 [A | B]，在 A 左侧插入 C → [C | A | B]
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const result = insertAtPosition(tree, 'A', makeLeaf('C'), 'left')
    expect(result).toBe(true)
    expect(tree.children).toHaveLength(3)
    expect(collectLeafIds(tree)).toEqual(['C', 'A', 'B'])
  })

  it('方向匹配时在上方插入（垂直容器）', () => {
    // 垂直 [A / B]，在 B 上方插入 C → [A / C / B]
    const tree = makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')])
    const result = insertAtPosition(tree, 'B', makeLeaf('C'), 'top')
    expect(result).toBe(true)
    expect(tree.children).toHaveLength(3)
    expect(collectLeafIds(tree)).toEqual(['A', 'C', 'B'])
  })

  it('方向匹配时在下方插入（垂直容器）', () => {
    // 垂直 [A / B]，在 A 下方插入 C → [A / C / B]
    const tree = makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')])
    const result = insertAtPosition(tree, 'A', makeLeaf('C'), 'bottom')
    expect(result).toBe(true)
    expect(tree.children).toHaveLength(3)
    expect(collectLeafIds(tree)).toEqual(['A', 'C', 'B'])
  })

  it('方向不匹配时创建嵌套容器', () => {
    // 水平 [A | B]，在 A 下方插入 C（垂直方向不匹配水平容器）
    // → 水平 [ 垂直[C, A] | B ]
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const result = insertAtPosition(tree, 'A', makeLeaf('C'), 'bottom')
    expect(result).toBe(true)
    expect(tree.children).toHaveLength(2)
    // A 的位置被替换为嵌套容器
    expect(isContainer(tree.children[0])).toBe(true)
    const nested = tree.children[0] as ContainerNode
    expect(nested.direction).toBe('vertical')
    expect(collectLeafIds(nested)).toEqual(['A', 'C'])
  })

  it('方向不匹配时右侧插入', () => {
    // 垂直 [A / B]，在 A 右侧插入 C（水平方向不匹配垂直容器）
    // → 垂直 [ 水平[A, C] / B ]
    const tree = makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')])
    const result = insertAtPosition(tree, 'A', makeLeaf('C'), 'right')
    expect(result).toBe(true)
    expect(isContainer(tree.children[0])).toBe(true)
    const nested = tree.children[0] as ContainerNode
    expect(nested.direction).toBe('horizontal')
    expect(collectLeafIds(nested)).toEqual(['A', 'C'])
  })

  it('插入后 sizes 总和精确为 100', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    insertAtPosition(tree, 'A', makeLeaf('C'), 'right')
    const total = tree.sizes.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })

  it('目标不存在时返回 false 且不修改树', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const originalChildren = tree.children.length
    const result = insertAtPosition(tree, 'X', makeLeaf('C'), 'right')
    expect(result).toBe(false)
    expect(tree.children).toHaveLength(originalChildren)
  })

  it('在嵌套容器中插入', () => {
    // 水平 [ 垂直[A, B] | C ]，在 B 右侧插入 D
    // B 的父容器是垂直方向，right 是水平方向 → 不匹配 → 嵌套容器替换
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    const result = insertAtPosition(tree, 'B', makeLeaf('D'), 'right')
    expect(result).toBe(true)
    // B 在垂直容器中，right 方向是水平，与垂直不匹配
    // 所以 B 的位置被替换为 水平[B, D]
    const verticalContainer = tree.children[0] as ContainerNode
    expect(isContainer(verticalContainer.children[1])).toBe(true)
    const nested = verticalContainer.children[1] as ContainerNode
    expect(nested.direction).toBe('horizontal')
    expect(collectLeafIds(nested)).toEqual(['B', 'D'])
  })
})
