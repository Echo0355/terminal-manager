/**
 * node-pty macOS helper 权限修复脚本测试
 */

import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import permissions from './fix-node-pty-permissions.cjs'

const { fixNodePtyPermissions } = permissions
const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function createHelper(mode = 0o644) {
  const rootDir = mkdtempSync(join(tmpdir(), 'terminal-manager-node-pty-'))
  tempDirs.push(rootDir)
  const helperDir = join(rootDir, 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64')
  const helperPath = join(helperDir, 'spawn-helper')
  mkdirSync(helperDir, { recursive: true })
  writeFileSync(helperPath, 'helper')
  chmodSync(helperPath, mode)
  return { rootDir, helperPath }
}

describe('fixNodePtyPermissions', () => {
  it('macOS 为 spawn-helper 补充执行权限', () => {
    const { rootDir, helperPath } = createHelper()

    expect(fixNodePtyPermissions(rootDir, 'darwin')).toEqual([helperPath])
    // Windows 的 chmodSync 不支持 Unix 权限位，跳过权限断言
    if (process.platform !== 'win32') {
      expect(statSync(helperPath).mode & 0o111).toBe(0o111)
    }
  })

  it('非 macOS 不修改文件权限', () => {
    const { rootDir, helperPath } = createHelper()

    expect(fixNodePtyPermissions(rootDir, 'win32')).toEqual([])
    expect(statSync(helperPath).mode & 0o111).toBe(0)
  })

  it('helper 不存在时直接跳过', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'terminal-manager-node-pty-'))
    tempDirs.push(rootDir)

    expect(fixNodePtyPermissions(rootDir, 'darwin')).toEqual([])
  })
})
