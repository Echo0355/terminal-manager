/**
 * Shell 检测和白名单验证测试
 *
 * 测试 shell-detector.ts 中的 Shell 检测逻辑和白名单验证器。
 * 覆盖以下方面：
 * - createShellValidator 的 isAllowed 和 resolve 方法
 * - detectShells 在不同平台和文件系统状态下的行为
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createShellValidator, type ShellInfo } from './shell-detector.service'

// mock fs 模块
vi.mock('fs', () => ({
  existsSync: vi.fn()
}))

import { existsSync } from 'fs'

// ── createShellValidator ──

describe('createShellValidator', () => {
  const detectedShells: ShellInfo[] = [
    { name: 'PowerShell', path: 'powershell.exe' },
    { name: 'CMD', path: 'cmd.exe' },
    { name: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['--login', '-i'] }
  ]
  const getDefaultShell = () => 'powershell.exe'

  describe('isAllowed', () => {
    it('已检测的 shell 路径返回 true', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)
      expect(validator.isAllowed('powershell.exe')).toBe(true)
      expect(validator.isAllowed('cmd.exe')).toBe(true)
      expect(validator.isAllowed('C:\\Program Files\\Git\\bin\\bash.exe')).toBe(true)
    })

    it('默认 shell 路径返回 true（即使不在检测列表中）', () => {
      const validator = createShellValidator([], () => '/usr/bin/zsh')
      expect(validator.isAllowed('/usr/bin/zsh')).toBe(true)
    })

    it('未知路径返回 false', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)
      expect(validator.isAllowed('/usr/bin/evil')).toBe(false)
      expect(validator.isAllowed('unknown.exe')).toBe(false)
    })

    it('空检测列表且非默认 shell 返回 false', () => {
      const validator = createShellValidator([], () => 'default.exe')
      expect(validator.isAllowed('anything.exe')).toBe(false)
    })
  })

  describe('resolve', () => {
    it('优先使用 requestedShell', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)
      expect(validator.resolve('cmd.exe')).toBe('cmd.exe')
    })

    it('requestedShell 为空时使用 configShell', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)
      expect(validator.resolve(undefined, 'cmd.exe')).toBe('cmd.exe')
    })

    it('两者都为空时使用默认 shell', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)
      expect(validator.resolve()).toBe('powershell.exe')
    })

    it('不允许的 requestedShell 回退到默认 shell', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)
      expect(validator.resolve('/usr/bin/evil')).toBe('powershell.exe')
    })

    it('不允许的 configShell 回退到默认 shell', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)
      expect(validator.resolve(undefined, '/usr/bin/evil')).toBe('powershell.exe')
    })

    it('requestedShell 优先于 configShell', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)
      expect(validator.resolve('cmd.exe', 'powershell.exe')).toBe('cmd.exe')
    })

    it('默认 shell 是空字符串时的行为', () => {
      const validator = createShellValidator(detectedShells, () => '')
      // 空字符串不在检测列表中，isAllowed 返回 false，回退到默认（空字符串）
      expect(validator.resolve('/usr/bin/evil')).toBe('')
    })
  })

  describe('resolveInfo', () => {
    it('返回检测到的 Git Bash 启动参数', () => {
      const validator = createShellValidator(detectedShells, getDefaultShell)

      expect(validator.resolveInfo('C:\\Program Files\\Git\\bin\\bash.exe')).toEqual({
        name: 'Git Bash',
        path: 'C:\\Program Files\\Git\\bin\\bash.exe',
        args: ['--login', '-i']
      })
    })

    it('自定义默认 shell 使用空启动参数', () => {
      const validator = createShellValidator([], () => 'C:\\Tools\\custom.exe')

      expect(validator.resolveInfo()).toEqual({
        name: 'C:\\Tools\\custom.exe',
        path: 'C:\\Tools\\custom.exe'
      })
    })
  })
})

// ── detectShells ──

describe('detectShells', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('win32 平台始终包含 PowerShell 和 CMD', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    vi.mocked(existsSync).mockReturnValue(false)

    const { detectShells } = await import('./shell-detector.service')
    const shells = detectShells()

    expect(shells.some(s => s.name === 'PowerShell')).toBe(true)
    expect(shells.some(s => s.name === 'CMD')).toBe(true)
  })

  it('win32 平台检测到 Git Bash 时包含它', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    vi.mocked(existsSync).mockImplementation((p) => {
      return p === 'C:\\Program Files\\Git\\bin\\bash.exe'
    })

    const { detectShells } = await import('./shell-detector.service')
    const shells = detectShells()

    const gitBash = shells.find(s => s.name === 'Git Bash')
    expect(gitBash).toBeDefined()
    expect(gitBash!.args).toEqual(['--login', '-i'])
  })

  it('win32 平台检测到 WSL 时包含它', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    vi.mocked(existsSync).mockImplementation((p) => {
      return p === 'C:\\Windows\\System32\\wsl.exe'
    })

    const { detectShells } = await import('./shell-detector.service')
    const shells = detectShells()

    expect(shells.some(s => s.name === 'WSL')).toBe(true)
  })

  it('win32 平台 COMSPEC 环境变量决定 CMD 路径', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const originalComspec = process.env.COMSPEC
    process.env.COMSPEC = 'C:\\Windows\\System32\\cmd.exe'
    vi.mocked(existsSync).mockReturnValue(false)

    try {
      const { detectShells } = await import('./shell-detector.service')
      const shells = detectShells()

      const cmd = shells.find(s => s.name === 'CMD')
      expect(cmd!.path).toBe('C:\\Windows\\System32\\cmd.exe')
    } finally {
      process.env.COMSPEC = originalComspec
    }
  })

  it('非 win32 平台检测存在的 shell', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' })
    vi.mocked(existsSync).mockImplementation((p) => {
      return p === '/bin/bash' || p === '/bin/sh'
    })

    const { detectShells } = await import('./shell-detector.service')
    const shells = detectShells()

    expect(shells.some(s => s.name === 'bash')).toBe(true)
    expect(shells.some(s => s.name === 'sh')).toBe(true)
    expect(shells.some(s => s.name === 'zsh')).toBe(false)
  })

  it('非 win32 平台不存在任何 shell 时返回空数组', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' })
    vi.mocked(existsSync).mockReturnValue(false)

    const { detectShells } = await import('./shell-detector.service')
    const shells = detectShells()

    expect(shells).toEqual([])
  })
})
