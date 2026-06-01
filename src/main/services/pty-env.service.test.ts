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

  it('Windows 保持原 PATH', () => {
    const env = buildPtyEnv({ PATH: 'C:\\Windows\\System32' }, 'win32')

    expect(env.PATH).toBe('C:\\Windows\\System32')
  })
})
