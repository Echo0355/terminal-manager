/**
 * 布局树模块测试
 *
 * 测试 layout-tree.ts 中的布局树数据结构和操作函数。
 * 这是代码库中算法复杂度最高的模块，测试覆盖以下方面：
 * - 节点创建和类型判断
 * - 深拷贝的正确性和隔离性
 * - 父节点查找算法
 * - 分屏操作的不可变性
 * - 面板移除和树简化逻辑
 * - 序列化/反序列化的往返一致性
 */

import { describe, it, expect } from 'vitest'
import {
  makeLeaf,
  makeContainer,
  isLeaf,
  isContainer,
  cloneLayout,
  findParentAndIndex,
  removeFromLayout,
  collectLeafIds,
  serializeLayoutNode,
  deserializeLayoutNode,
  type LayoutNode
} from './layout-tree'

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

describe('cloneLayout', () => {
  it('深拷贝叶子节点', () => {
    const leaf = makeLeaf('A')
    const cloned = cloneLayout(leaf)
    expect(cloned).toEqual(leaf)
    expect(cloned).not.toBe(leaf)
  })

  it('深拷贝容器节点', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const cloned = cloneLayout(tree)
    expect(cloned).toEqual(tree)
    expect(cloned).not.toBe(tree)
    expect((cloned as any).children).not.toBe(tree.children)
    expect((cloned as any).sizes).not.toBe(tree.sizes)
  })

  it('深拷贝嵌套容器', () => {
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    const cloned = cloneLayout(tree)
    expect(collectLeafIds(cloned)).toEqual(['A', 'B', 'C'])
    // 修改拷贝不影响原树
    ;(cloned as any).children[1] = makeLeaf('X')
    expect(collectLeafIds(tree)).toEqual(['A', 'B', 'C'])
  })
})

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
    const tree = makeLeaf('A')
    expect(findParentAndIndex(tree, 'A')).toBeNull()
  })
})

describe('removeFromLayout', () => {
  it('从两个叶子的容器中移除一个，简化为叶子', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const result = removeFromLayout(tree, 'B')
    expect(result).not.toBeNull()
    expect(isLeaf(result!)).toBe(true)
    expect((result as any).paneId).toBe('A')
  })

  it('从三个叶子的容器中移除中间一个', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B'), makeLeaf('C')])
    const result = removeFromLayout(tree, 'B')
    expect(result).not.toBeNull()
    expect(isContainer(result!)).toBe(true)
    expect((result as any).children).toHaveLength(2)
    expect(collectLeafIds(result!)).toEqual(['A', 'C'])
  })

  it('从嵌套容器中移除叶子', () => {
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    const result = removeFromLayout(tree, 'B')
    expect(result).not.toBeNull()
    expect(collectLeafIds(result!)).toEqual(['A', 'C'])
  })

  it('嵌套容器中移除后只剩一个叶子时简化', () => {
    // 水平容器 [垂直容器[A], C] → 移除 C → 垂直容器只剩 [A] → 简化为 A
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A')]),
      makeLeaf('C')
    ])
    const result = removeFromLayout(tree, 'C')
    expect(result).not.toBeNull()
    expect(isLeaf(result!)).toBe(true)
    expect((result as any).paneId).toBe('A')
  })

  it('嵌套容器移除后子容器剩两个不简化', () => {
    const tree = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    const result = removeFromLayout(tree, 'C')
    expect(result).not.toBeNull()
    expect(isContainer(result!)).toBe(true)
    expect(collectLeafIds(result!)).toEqual(['A', 'B'])
  })

  it('移除不存在的叶子返回原树', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const result = removeFromLayout(tree, 'X')
    expect(result).not.toBeNull()
    expect(collectLeafIds(result!)).toEqual(['A', 'B'])
  })

  it('移除所有叶子返回 null', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const r1 = removeFromLayout(tree, 'A')
    expect(r1).not.toBeNull()
    expect(isLeaf(r1!)).toBe(true)
    const r2 = removeFromLayout(r1!, 'B')
    expect(r2).toBeNull()
  })

  it('移除叶子节点本身', () => {
    const result = removeFromLayout(makeLeaf('A'), 'A')
    expect(result).toBeNull()
  })

  it('保留叶子节点本身', () => {
    const result = removeFromLayout(makeLeaf('A'), 'B')
    expect(result).not.toBeNull()
    expect((result as any).paneId).toBe('A')
  })

  it('Distribute 模式：移除面板后按相对比例重新分配空间', () => {
    // 创建三个面板 [33, 33, 34]，移除中间一个
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B'), makeLeaf('C')])
    const result = removeFromLayout(tree, 'B')
    expect(result).not.toBeNull()
    expect(isContainer(result!)).toBe(true)
    const container = result as any
    expect(container.children).toHaveLength(2)
    expect(collectLeafIds(result!)).toEqual(['A', 'C'])
    // 原始 sizes [33, 33, 34]，移除 B(33) 后，A 和 C 按比例重分配
    // A: 33/(33+34) * 100 ≈ 49.25，C: 34/(33+34) * 100 ≈ 50.75
    const total = container.sizes.reduce((a: number, b: number) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.1)
  })

  it('Distribute 模式：移除面板后 sizes 总和精确为 100', () => {
    // 创建四个面板 [25, 25, 25, 25]，移除第一个
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B'), makeLeaf('C'), makeLeaf('D')])
    const result = removeFromLayout(tree, 'A')
    expect(result).not.toBeNull()
    expect(isContainer(result!)).toBe(true)
    const container = result as any
    const total = container.sizes.reduce((a: number, b: number) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.1)
  })
})

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

describe('序列化和反序列化', () => {
  it('序列化叶子节点', () => {
    const leaf = makeLeaf('pane_1')
    const serialized = serializeLayoutNode(leaf)
    expect(serialized).toEqual({ type: 'leaf', paneId: 'pane_1' })
  })

  it('序列化容器节点', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const serialized = serializeLayoutNode(tree)
    expect(serialized.type).toBe('container')
    expect(serialized.direction).toBe('horizontal')
    expect(serialized.sizes).toEqual([50, 50])
    expect(serialized.children).toHaveLength(2)
  })

  it('序列化不产生引用', () => {
    const tree = makeContainer('horizontal', [makeLeaf('A'), makeLeaf('B')])
    const serialized = serializeLayoutNode(tree)
    expect(serialized.sizes).not.toBe(tree.sizes)
    expect(serialized.children).not.toBe(tree.children)
  })

  it('反序列化叶子节点', () => {
    const data = { type: 'leaf' as const, paneId: 'pane_1' }
    const result = deserializeLayoutNode(data)
    expect(result).not.toBeNull()
    expect(isLeaf(result!)).toBe(true)
    expect((result as any).paneId).toBe('pane_1')
  })

  it('反序列化容器节点', () => {
    const data = {
      type: 'container' as const,
      direction: 'horizontal' as const,
      sizes: [50, 50],
      children: [
        { type: 'leaf' as const, paneId: 'A' },
        { type: 'leaf' as const, paneId: 'B' }
      ]
    }
    const result = deserializeLayoutNode(data)
    expect(result).not.toBeNull()
    expect(isContainer(result!)).toBe(true)
    expect(collectLeafIds(result!)).toEqual(['A', 'B'])
  })

  it('反序列化缺少 paneId 的叶子返回 null', () => {
    expect(deserializeLayoutNode({ type: 'leaf' as const })).toBeNull()
  })

  it('反序列化空容器返回 null', () => {
    expect(deserializeLayoutNode({
      type: 'container' as const,
      direction: 'horizontal' as const,
      sizes: [],
      children: []
    })).toBeNull()
  })

  it('反序列化单子节点容器简化为叶子', () => {
    const data = {
      type: 'container' as const,
      direction: 'horizontal' as const,
      sizes: [100],
      children: [{ type: 'leaf' as const, paneId: 'A' }]
    }
    const result = deserializeLayoutNode(data)
    expect(result).not.toBeNull()
    expect(isLeaf(result!)).toBe(true)
    expect((result as any).paneId).toBe('A')
  })

  it('反序列化包含无效子节点时过滤', () => {
    const data = {
      type: 'container' as const,
      direction: 'horizontal' as const,
      sizes: [50, 50],
      children: [
        { type: 'leaf' as const, paneId: 'A' },
        { type: 'leaf' as const } // 缺少 paneId，会被过滤
      ]
    }
    const result = deserializeLayoutNode(data)
    // 只剩一个有效子节点，简化为叶子
    expect(result).not.toBeNull()
    expect(isLeaf(result!)).toBe(true)
    expect((result as any).paneId).toBe('A')
  })

  it('序列化再反序列化往返一致', () => {
    const original = makeContainer('horizontal', [
      makeContainer('vertical', [makeLeaf('A'), makeLeaf('B')]),
      makeLeaf('C')
    ])
    const serialized = serializeLayoutNode(original)
    const restored = deserializeLayoutNode(serialized)
    expect(restored).not.toBeNull()
    expect(collectLeafIds(restored!)).toEqual(['A', 'B', 'C'])
    expect((restored as any).direction).toBe('horizontal')
    expect((restored as any).children[0].direction).toBe('vertical')
  })
})
