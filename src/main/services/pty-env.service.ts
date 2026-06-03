/**
 * PTY 子进程环境构造
 *
 * 负责过滤敏感环境变量，并补充 GUI 应用启动时可能缺失的系统命令路径和 UTF-8 locale。
 */

/** 传递给子进程时应排除的敏感环境变量模式 */
const SENSITIVE_ENV_PATTERNS = [
  /token/i, /secret/i, /password/i, /credential/i,
  /api[_-]?key/i, /auth/i, /private[_-]?key/i
]

/** macOS GUI 应用常见的命令目录 */
const MACOS_PATH_ENTRIES = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin'
]

/** macOS 下 PTY 默认使用的 UTF-8 locale */
const MACOS_DEFAULT_LOCALE = 'en_US.UTF-8'
const MACOS_DEFAULT_CTYPE = 'UTF-8'

function isUtf8Locale(value: string | undefined): boolean {
  return typeof value === 'string' && /utf-?8/i.test(value)
}

function ensureMacOSUtf8Locale(env: Record<string, string>): void {
  if (env.LC_ALL && !isUtf8Locale(env.LC_ALL)) {
    // LC_ALL 优先级最高，非 UTF-8 值会导致 zsh 将中文输入按坏字节回显。
    env.LC_ALL = MACOS_DEFAULT_LOCALE
  }

  if (env.LC_ALL) return

  if (!isUtf8Locale(env.LANG)) {
    env.LANG = MACOS_DEFAULT_LOCALE
  }
  if (!isUtf8Locale(env.LC_CTYPE)) {
    env.LC_CTYPE = MACOS_DEFAULT_CTYPE
  }
}

/**
 * 过滤敏感环境变量。
 *
 * @param env - 主进程环境变量
 * @returns 可安全传递给 PTY 子进程的环境变量
 */
export function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key))) continue
    result[key] = value
  }
  return result
}

/**
 * 构造 PTY 子进程环境。
 *
 * Finder 等 GUI 入口不会加载用户的 shell profile，macOS 下需要主动补充
 * Homebrew 和常见本地命令目录，并确保 shell 运行在 UTF-8 locale 下。
 *
 * @param env - 主进程环境变量
 * @param platform - 当前运行平台
 * @returns 可传递给 PTY 子进程的环境变量
 */
export function buildPtyEnv(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): Record<string, string> {
  const result = sanitizeEnv(env)
  if (platform !== 'darwin') return result

  const pathEntries = (result.PATH || '').split(':').filter(Boolean)
  for (const entry of MACOS_PATH_ENTRIES) {
    if (!pathEntries.includes(entry)) pathEntries.push(entry)
  }
  result.PATH = pathEntries.join(':')
  ensureMacOSUtf8Locale(result)
  return result
}
