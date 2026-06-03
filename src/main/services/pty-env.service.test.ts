/**
 * PTY 子进程环境构造测试
 */

import { describe, expect, it } from 'vitest'
import { buildPtyEnv, sanitizeEnv } from './pty-env.service'

describe('sanitizeEnv', () => {
  it('过滤敏感环境变量并保留普通变量', () => {
    expect(sanitizeEnv({
      PATH: '/usr/bin:/bin',
      API_KEY: 'secret-value',
      USER_TOKEN: 'token-value',
      HOME: '/Users/test'
    })).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/test'
    })
  })

  it('忽略值为 undefined 的环境变量', () => {
    expect(sanitizeEnv({ PATH: undefined })).toEqual({})
  })
})

describe('buildPtyEnv', () => {
  it('macOS 补充 Homebrew 和常见本地命令目录', () => {
    const env = buildPtyEnv({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, 'darwin')

    expect(env.PATH).toBe(
      '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin'
    )
  })

  it('macOS 不重复添加已存在的目录', () => {
    const env = buildPtyEnv({ PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, 'darwin')

    expect(env.PATH?.split(':').filter((entry) => entry === '/opt/homebrew/bin')).toHaveLength(1)
  })

  it('macOS 缺失 locale 时补充 UTF-8 设置', () => {
    const env = buildPtyEnv({ PATH: '/usr/bin:/bin' }, 'darwin')

    expect(env.LANG).toBe('en_US.UTF-8')
    expect(env.LC_CTYPE).toBe('UTF-8')
  })

  it('macOS 保留已有的 UTF-8 locale', () => {
    const env = buildPtyEnv({
      PATH: '/usr/bin:/bin',
      LANG: 'zh_CN.UTF-8',
      LC_CTYPE: 'zh_CN.UTF-8'
    }, 'darwin')

    expect(env.LANG).toBe('zh_CN.UTF-8')
    expect(env.LC_CTYPE).toBe('zh_CN.UTF-8')
  })

  it('macOS 将非 UTF-8 的 LC_ALL 修正为 UTF-8', () => {
    const env = buildPtyEnv({
      PATH: '/usr/bin:/bin',
      LC_ALL: 'C'
    }, 'darwin')

    expect(env.LC_ALL).toBe('en_US.UTF-8')
  })

  it('Windows 保持原 PATH', () => {
    const env = buildPtyEnv({ PATH: 'C:\\Windows\\System32' }, 'win32')

    expect(env.PATH).toBe('C:\\Windows\\System32')
    expect(env.LANG).toBeUndefined()
  })
})
