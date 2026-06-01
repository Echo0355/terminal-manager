/**
 * 修复 node-pty macOS 预编译 spawn-helper 的执行权限。
 *
 * node-pty 1.1.0 发布包中的 spawn-helper 可能缺少执行位，导致所有终端启动
 * 都以 "posix_spawnp failed" 失败。安装依赖、开发启动和打包前都会运行此脚本。
 */

const { chmodSync, existsSync, statSync } = require('fs')
const { join } = require('path')

/**
 * 为 macOS node-pty 预编译 helper 补充执行权限。
 *
 * @param {string} rootDir - 项目根目录
 * @param {NodeJS.Platform} platform - 当前运行平台
 * @returns {string[]} 已处理的 helper 路径
 */
function fixNodePtyPermissions(rootDir = process.cwd(), platform = process.platform) {
  if (platform !== 'darwin') return []

  const fixedPaths = []
  for (const arch of ['darwin-arm64', 'darwin-x64']) {
    const helperPath = join(rootDir, 'node_modules', 'node-pty', 'prebuilds', arch, 'spawn-helper')
    if (!existsSync(helperPath)) continue

    chmodSync(helperPath, statSync(helperPath).mode | 0o111)
    fixedPaths.push(helperPath)
  }
  return fixedPaths
}

if (require.main === module) {
  const fixedPaths = fixNodePtyPermissions()
  if (fixedPaths.length > 0) {
    console.log(`已修复 node-pty spawn-helper 执行权限: ${fixedPaths.length} 个文件`)
  }
}

module.exports = { fixNodePtyPermissions }
