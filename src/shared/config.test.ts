/**
 * 配置模块测试
 *
 * 测试 config.ts 中的工具函数和配置校验逻辑。
 * 使用 Vitest 测试框架，node 环境运行。
 */

import { describe, it, expect } from 'vitest'
import {
  clamp, getDefaultConfig, getDefaultShellForPlatform, validateConfig, type Config
} from './config'

describe('clamp', () => {
  it('值在范围内返回原值', () => {
    expect(clamp(10, 0, 20)).toBe(10)
  })

  it('值小于最小值返回最小值', () => {
    expect(clamp(-5, 0, 20)).toBe(0)
  })

  it('值大于最大值返回最大值', () => {
    expect(clamp(25, 0, 20)).toBe(20)
  })

  it('边界值', () => {
    expect(clamp(0, 0, 20)).toBe(0)
    expect(clamp(20, 0, 20)).toBe(20)
  })
})

describe('getDefaultConfig', () => {
  it('Windows 默认 shell 为 powershell.exe', () => {
    const config = getDefaultConfig('win32')
    expect(config.general.defaultShell).toBe('powershell.exe')
  })

  it('macOS 默认 shell 为 /bin/zsh', () => {
    const config = getDefaultConfig('darwin')
    expect(config.general.defaultShell).toBe('/bin/zsh')
  })

  it('Linux 默认 shell 为 /bin/sh', () => {
    const config = getDefaultConfig('linux')
    expect(config.general.defaultShell).toBe('/bin/sh')
  })

  it('默认字体大小为 14', () => {
    const config = getDefaultConfig()
    expect(config.general.fontSize).toBe(14)
  })

  it('默认主题为 dark', () => {
    const config = getDefaultConfig()
    expect(config.general.theme).toBe('dark')
  })

  it('默认滚动缓冲为 10000', () => {
    const config = getDefaultConfig()
    expect(config.general.scrollback).toBe(10000)
  })
})

describe('validateConfig', () => {
  it('null 输入返回默认配置', () => {
    const config = validateConfig(null)
    expect(config).toEqual(getDefaultConfig())
  })

  it('空对象返回默认配置', () => {
    const config = validateConfig({})
    expect(config).toEqual(getDefaultConfig())
  })

  it('无效类型返回默认配置', () => {
    expect(validateConfig('string')).toEqual(getDefaultConfig())
    expect(validateConfig(123)).toEqual(getDefaultConfig())
    expect(validateConfig(undefined)).toEqual(getDefaultConfig())
  })

  it('有效配置保留值', () => {
    const input: Config = {
      general: {
        defaultShell: 'cmd.exe',
        defaultCwd: 'C:\\Users',
        fontSize: 16,
        theme: 'light',
        scrollback: 5000
      }
    }
    const config = validateConfig(input)
    expect(config.general.defaultShell).toBe('cmd.exe')
    expect(config.general.defaultCwd).toBe('C:\\Users')
    expect(config.general.fontSize).toBe(16)
    expect(config.general.theme).toBe('light')
    expect(config.general.scrollback).toBe(5000)
  })

  it('字体大小超出范围被限制', () => {
    const input = { general: { fontSize: 3 } }
    expect(validateConfig(input).general.fontSize).toBe(8)

    const input2 = { general: { fontSize: 50 } }
    expect(validateConfig(input2).general.fontSize).toBe(32)
  })

  it('滚动缓冲超出范围被限制', () => {
    const input = { general: { scrollback: 10 } }
    expect(validateConfig(input).general.scrollback).toBe(100)

    const input2 = { general: { scrollback: 200000 } }
    expect(validateConfig(input2).general.scrollback).toBe(100000)
  })

  it('无效主题回退到 dark', () => {
    const input = { general: { theme: 'blue' } }
    expect(validateConfig(input).general.theme).toBe('dark')
  })

  it('非字符串 shell 使用默认值', () => {
    const input = { general: { defaultShell: 123 } }
    expect(validateConfig(input, 'win32').general.defaultShell).toBe('powershell.exe')
  })

  it('空字符串 shell 使用默认值', () => {
    const input = { general: { defaultShell: '' } }
    expect(validateConfig(input, 'win32').general.defaultShell).toBe('powershell.exe')
  })

  it('非数字 fontSize 使用默认值', () => {
    const input = { general: { fontSize: 'big' } }
    expect(validateConfig(input).general.fontSize).toBe(14)
  })

  it('NaN fontSize 使用默认值', () => {
    const input = { general: { fontSize: NaN } }
    expect(validateConfig(input).general.fontSize).toBe(14)
  })

  it('部分字段缺失使用默认值填充', () => {
    const input = { general: { fontSize: 20 } }
    const config = validateConfig(input, 'win32')
    expect(config.general.fontSize).toBe(20)
    expect(config.general.defaultShell).toBe('powershell.exe')
    expect(config.general.theme).toBe('dark')
    expect(config.general.scrollback).toBe(10000)
  })
})

describe('getDefaultShellForPlatform', () => {
  it('未知类 Unix 平台回退到 /bin/sh', () => {
    expect(getDefaultShellForPlatform('freebsd')).toBe('/bin/sh')
  })
})
