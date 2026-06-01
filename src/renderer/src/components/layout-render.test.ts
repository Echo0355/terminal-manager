/**
 * 布局工具函数测试
 *
 * 测试 layout-utils.ts 中的 normalizeSizes 函数。
 * 覆盖正常路径、边界条件和浮点误差修正。
 */

import { describe, it, expect } from 'vitest'
import { normalizeSizes } from '../utils/layout-utils'
import type { ContainerNode } from '../types/renderer.types'

/** 创建测试用的容器节点 */
function makeContainer(sizes: number[]): ContainerNode {
  return {
    type: 'container',
    direction: 'horizontal',
    sizes,
    children: []
  }
}

// ── normalizeSizes ──

describe('normalizeSizes', () => {
  it('已规范化的 sizes 保持不变', () => {
    const container = makeContainer([50, 50])
    normalizeSizes(container)
    expect(container.sizes[0]).toBeCloseTo(50)
    expect(container.sizes[1]).toBeCloseTo(50)
  })

  it('三个等分面板规范化为 100', () => {
    const container = makeContainer([33.33, 33.33, 33.34])
    normalizeSizes(container)
    const total = container.sizes.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(100, 1)
  })

  it('不等分面板规范化后总和为 100', () => {
    const container = makeContainer([25, 35, 40])
    normalizeSizes(container)
    const total = container.sizes.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(100, 1)
    // 比例应保持不变
    expect(container.sizes[0]).toBeCloseTo(25)
    expect(container.sizes[1]).toBeCloseTo(35)
    expect(container.sizes[2]).toBeCloseTo(40)
  })

  it('总和不为 100 时自动修正', () => {
    const container = makeContainer([20, 30, 40]) // 总和 90
    normalizeSizes(container)
    const total = container.sizes.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(100, 1)
    // 比例应保持不变
    expect(container.sizes[0]).toBeCloseTo(200 / 9)
    expect(container.sizes[1]).toBeCloseTo(100 / 3)
    expect(container.sizes[2]).toBeCloseTo(400 / 9)
  })

  it('总和大于 100 时自动缩小', () => {
    const container = makeContainer([40, 60, 40]) // 总和 140
    normalizeSizes(container)
    const total = container.sizes.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(100, 1)
  })

  it('浮点误差修正：确保最后一个元素补齐差值', () => {
    // 模拟浮点运算产生的微小误差
    const container = makeContainer([33.33, 33.33, 33.33]) // 总和 99.99
    normalizeSizes(container)
    const total = container.sizes.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.02)
  })

  it('空 sizes 数组不报错', () => {
    const container = makeContainer([])
    expect(() => normalizeSizes(container)).not.toThrow()
  })

  it('单个面板规范化为 100', () => {
    const container = makeContainer([50])
    normalizeSizes(container)
    expect(container.sizes[0]).toBeCloseTo(100)
  })

  it('总和为 0 时不修改', () => {
    const container = makeContainer([0, 0])
    normalizeSizes(container)
    expect(container.sizes[0]).toBe(0)
    expect(container.sizes[1]).toBe(0)
  })
})
