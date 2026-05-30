/**
 * 项目模块测试
 *
 * 测试 project.ts 中的项目数据校验逻辑。
 * 覆盖有效输入、无效输入、边界条件等场景。
 */

import { describe, it, expect } from 'vitest'
import { validateProject, validateProjectList, type Project } from './project'

describe('validateProject', () => {
  it('有效项目返回项目对象', () => {
    const input = { id: 'proj_1', name: 'My App', path: 'C:\\Projects\\my-app' }
    const result = validateProject(input)
    expect(result).toEqual(input)
  })

  it('null 输入返回 null', () => {
    expect(validateProject(null)).toBeNull()
  })

  it('非对象输入返回 null', () => {
    expect(validateProject('string')).toBeNull()
    expect(validateProject(123)).toBeNull()
    expect(validateProject(undefined)).toBeNull()
  })

  it('缺少 id 返回 null', () => {
    expect(validateProject({ name: 'App', path: '/path' })).toBeNull()
  })

  it('缺少 name 返回 null', () => {
    expect(validateProject({ id: '1', path: '/path' })).toBeNull()
  })

  it('缺少 path 返回 null', () => {
    expect(validateProject({ id: '1', name: 'App' })).toBeNull()
  })

  it('空字符串 id 返回 null', () => {
    expect(validateProject({ id: '', name: 'App', path: '/path' })).toBeNull()
  })

  it('空字符串 name 返回 null', () => {
    expect(validateProject({ id: '1', name: '', path: '/path' })).toBeNull()
  })

  it('空字符串 path 返回 null', () => {
    expect(validateProject({ id: '1', name: 'App', path: '' })).toBeNull()
  })

  it('非字符串字段返回 null', () => {
    expect(validateProject({ id: 123, name: 'App', path: '/path' })).toBeNull()
    expect(validateProject({ id: '1', name: 123, path: '/path' })).toBeNull()
    expect(validateProject({ id: '1', name: 'App', path: 123 })).toBeNull()
  })

  it('超长 id 返回 null', () => {
    expect(validateProject({ id: 'x'.repeat(101), name: 'App', path: '/path' })).toBeNull()
  })

  it('超长 name 返回 null', () => {
    expect(validateProject({ id: '1', name: 'x'.repeat(201), path: '/path' })).toBeNull()
  })

  it('超长 path 返回 null', () => {
    expect(validateProject({ id: '1', name: 'App', path: 'x'.repeat(2001) })).toBeNull()
  })

  it('额外字段被忽略', () => {
    const input = { id: '1', name: 'App', path: '/path', extra: 'data' }
    const result = validateProject(input)
    expect(result).toEqual({ id: '1', name: 'App', path: '/path' })
  })
})

describe('validateProjectList', () => {
  it('空数组返回空数组', () => {
    expect(validateProjectList([])).toEqual([])
  })

  it('非数组返回空数组', () => {
    expect(validateProjectList(null)).toEqual([])
    expect(validateProjectList('string')).toEqual([])
    expect(validateProjectList(123)).toEqual([])
  })

  it('有效项目列表', () => {
    const input = [
      { id: '1', name: 'App1', path: '/path1' },
      { id: '2', name: 'App2', path: '/path2' }
    ]
    const result = validateProjectList(input)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('1')
    expect(result[1].id).toBe('2')
  })

  it('过滤无效项目', () => {
    const input = [
      { id: '1', name: 'App1', path: '/path1' },
      { id: '', name: 'Bad', path: '/path' },  // 无效
      { id: '3', name: 'App3', path: '/path3' },
      null,  // 无效
      { id: '4' }  // 无效
    ]
    const result = validateProjectList(input)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('1')
    expect(result[1].id).toBe('3')
  })

  it('全部无效返回空数组', () => {
    const input = [null, undefined, '', 123, { id: '' }]
    expect(validateProjectList(input)).toEqual([])
  })
})
