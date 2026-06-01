/**
 * 输入校验工具函数测试
 *
 * 测试 validation.ts 中的纯函数：isValidString、isValidNumber、validateCwd。
 * 覆盖正常路径、边界条件和异常输入。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidString, isValidNumber, validateCwd } from './validation'

// mock fs 模块
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { R_OK: 4, X_OK: 1 }
}))

import { existsSync, statSync, accessSync } from 'fs'

// ── isValidString ──

describe('isValidString', () => {
  it('有效字符串返回 true', () => {
    expect(isValidString('hello')).toBe(true)
    expect(isValidString('a')).toBe(true)
  })

  it('空字符串返回 false', () => {
    expect(isValidString('')).toBe(false)
  })

  it('非字符串类型返回 false', () => {
    expect(isValidString(123)).toBe(false)
    expect(isValidString(null)).toBe(false)
    expect(isValidString(undefined)).toBe(false)
    expect(isValidString({})).toBe(false)
    expect(isValidString([])).toBe(false)
    expect(isValidString(true)).toBe(false)
  })

  it('超过最大长度返回 false', () => {
    expect(isValidString('a'.repeat(1001))).toBe(false)
    expect(isValidString('a'.repeat(1000))).toBe(true)
  })

  it('自定义最大长度', () => {
    expect(isValidString('abc', 2)).toBe(false)
    expect(isValidString('ab', 2)).toBe(true)
    expect(isValidString('a', 2)).toBe(true)
  })

  it('maxLength 为 0 时任何非空字符串都超限', () => {
    expect(isValidString('a', 0)).toBe(false)
  })
})

// ── isValidNumber ──

describe('isValidNumber', () => {
  it('范围内的有效数字返回 true', () => {
    expect(isValidNumber(5, 1, 10)).toBe(true)
    expect(isValidNumber(1, 1, 10)).toBe(true)
    expect(isValidNumber(10, 1, 10)).toBe(true)
  })

  it('范围外的数字返回 false', () => {
    expect(isValidNumber(0, 1, 10)).toBe(false)
    expect(isValidNumber(11, 1, 10)).toBe(false)
    expect(isValidNumber(-1, 1, 10)).toBe(false)
  })

  it('非数字类型返回 false', () => {
    expect(isValidNumber('5', 1, 10)).toBe(false)
    expect(isValidNumber(null, 1, 10)).toBe(false)
    expect(isValidNumber(undefined, 1, 10)).toBe(false)
    expect(isValidNumber({}, 1, 10)).toBe(false)
    expect(isValidNumber([], 1, 10)).toBe(false)
    expect(isValidNumber(true, 1, 10)).toBe(false)
  })

  it('NaN 返回 false', () => {
    expect(isValidNumber(NaN, 1, 10)).toBe(false)
  })

  it('Infinity 返回 false', () => {
    expect(isValidNumber(Infinity, 1, 10)).toBe(false)
    expect(isValidNumber(-Infinity, 1, 10)).toBe(false)
  })

  it('浮点数在范围内返回 true', () => {
    expect(isValidNumber(5.5, 1, 10)).toBe(true)
  })
})

// ── validateCwd ──

describe('validateCwd', () => {
  const getDefaultCwd = () => '/default/cwd'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有效目录直接返回', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any)
    vi.mocked(accessSync).mockImplementation(() => {})

    expect(validateCwd('/valid/path', getDefaultCwd)).toBe('/valid/path')
  })

  it('未提供路径时使用默认目录', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any)
    vi.mocked(accessSync).mockImplementation(() => {})

    expect(validateCwd(undefined, getDefaultCwd)).toBe('/default/cwd')
  })

  it('目录不存在时回退到默认目录', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    expect(validateCwd('/nonexistent', getDefaultCwd)).toBe('/default/cwd')
  })

  it('路径是文件而非目录时回退', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as any)

    expect(validateCwd('/file/path', getDefaultCwd)).toBe('/default/cwd')
  })

  it('目录无权限时回退', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any)
    vi.mocked(accessSync).mockImplementation(() => { throw new Error('EACCES') })

    expect(validateCwd('/noaccess', getDefaultCwd)).toBe('/default/cwd')
  })

  it('回退时输出警告日志', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(existsSync).mockReturnValue(false)

    validateCwd('/bad/path', getDefaultCwd)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('/bad/path')
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('/default/cwd')
    )
    warnSpy.mockRestore()
  })
})
