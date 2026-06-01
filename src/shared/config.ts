/**
 * 配置模块
 *
 * 负责应用程序配置的类型定义、默认值生成和数据校验。
 * 配置存储在用户数据目录的 config.json 文件中。
 */

// ── 配置类型 ──

/**
 * 应用程序配置接口
 *
 * 包含所有可配置的选项，目前仅包含通用设置。
 * 配置会持久化到磁盘，应用重启后自动加载。
 */
export interface Config {
  /** 通用设置 */
  general: {
    /** 默认 Shell 可执行文件路径，如 'powershell.exe' 或 '/bin/zsh' */
    defaultShell: string
    /** 默认工作目录路径，空字符串表示使用用户主目录 */
    defaultCwd: string
    /** 终端字体大小（像素），范围 8-32 */
    fontSize: number
    /** 界面主题，'dark' 为深色主题，'light' 为浅色主题 */
    theme: 'dark' | 'light'
    /** 终端滚动缓冲区行数，范围 100-100000 */
    scrollback: number
  }
}

// ── 工具函数 ──

/**
 * 将数值限制在指定范围内
 *
 * @param value - 要限制的数值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 限制后的数值，保证在 [min, max] 范围内
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ── 默认配置 ──

/**
 * 获取平台默认 Shell
 *
 * @param platform - 运行平台
 * @returns Windows 使用 PowerShell，macOS 使用 zsh，Linux 使用 sh
 */
export function getDefaultShellForPlatform(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return 'powershell.exe'
  if (platform === 'darwin') return '/bin/zsh'
  return '/bin/sh'
}

/**
 * 生成默认配置
 *
 * 根据运行平台返回合理的默认值。
 *
 * @param platform - 运行平台，默认为当前平台
 * @returns 包含默认值的配置对象
 */
export function getDefaultConfig(platform: NodeJS.Platform = process.platform): Config {
  return {
    general: {
      defaultShell: getDefaultShellForPlatform(platform),
      defaultCwd: '',
      fontSize: 14,
      theme: 'dark',
      scrollback: 10000
    }
  }
}

// ── 配置校验 ──

/**
 * 校验并规范化配置数据
 *
 * 对输入数据进行严格校验，确保所有字段类型正确且在有效范围内。
 * 无效字段会被替换为默认值，部分字段缺失时使用默认值填充。
 * 此函数用于防止恶意或损坏的配置文件导致应用异常。
 *
 * @param data - 待校验的原始数据（可能来自 JSON 文件或 IPC 消息）
 * @param platform - 运行平台，用于生成默认值
 * @returns 校验后的配置对象，保证所有字段有效
 */
// TODO: 将 data 参数类型改为 unknown 以增强类型安全（需要同步修改 data-store.ts 中的调用方）
export function validateConfig(data: any, platform: NodeJS.Platform = process.platform): Config {
  const defaults = getDefaultConfig(platform)

  // 输入必须是对象
  if (!data || typeof data !== 'object') {
    return defaults
  }

  // general 字段必须是对象
  const general = data.general
  if (!general || typeof general !== 'object') {
    return defaults
  }

  return {
    general: {
      // Shell 路径：必须是非空字符串，长度不超过 500
      defaultShell: typeof general.defaultShell === 'string' && general.defaultShell.length > 0 && general.defaultShell.length <= 500
        ? general.defaultShell
        : defaults.general.defaultShell,
      // 工作目录：必须是字符串，长度不超过 2000（允许为空，表示使用默认目录）
      defaultCwd: typeof general.defaultCwd === 'string' && general.defaultCwd.length <= 2000
        ? general.defaultCwd
        : defaults.general.defaultCwd,
      // 字体大小：必须是有效数字，限制在 8-32 范围内
      fontSize: typeof general.fontSize === 'number' && !isNaN(general.fontSize)
        ? clamp(general.fontSize, 8, 32)
        : defaults.general.fontSize,
      // 主题：只接受 'light'，其他值一律为 'dark'
      theme: general.theme === 'light' ? 'light' : 'dark',
      // 滚动缓冲：必须是有效数字，限制在 100-100000 范围内
      scrollback: typeof general.scrollback === 'number' && !isNaN(general.scrollback)
        ? clamp(general.scrollback, 100, 100000)
        : defaults.general.scrollback
    }
  }
}
