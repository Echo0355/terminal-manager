/**
 * 输入校验工具函数
 *
 * 从 pty-ipc.ts 提取的纯函数，便于独立测试。
 * 所有 IPC 输入都应通过这些函数校验后才进入业务逻辑。
 */

import { existsSync, statSync, accessSync, constants } from 'fs'

/**
 * 校验字符串参数
 *
 * @param value - 待校验的值
 * @param maxLength - 最大长度限制，默认 1000
 * @returns 是否为有效字符串
 */
export function isValidString(value: unknown, maxLength = 1000): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

/**
 * 校验数值参数
 *
 * @param value - 待校验的值
 * @param min - 最小值（含）
 * @param max - 最大值（含）
 * @returns 是否为有效数值
 */
export function isValidNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max
}

/**
 * 校验工作目录是否存在且可访问
 *
 * @param requestedCwd - 请求的目录路径
 * @param getDefaultCwd - 获取默认目录的回调函数
 * @returns 校验后的有效目录路径
 */
export function validateCwd(requestedCwd: string | undefined, getDefaultCwd: () => string): string {
  const cwd = requestedCwd || getDefaultCwd()
  try {
    if (existsSync(cwd)) {
      const stat = statSync(cwd)
      if (stat.isDirectory()) {
        accessSync(cwd, constants.R_OK | constants.X_OK)
        return cwd
      }
    }
  } catch {
    // ignore
  }
  const fallback = getDefaultCwd()
  console.warn(`目录不存在或无权限: ${cwd}，回退到: ${fallback}`)
  return fallback
}
