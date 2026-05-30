// ── 配置类型 ──

export interface Config {
  general: {
    defaultShell: string
    defaultCwd: string
    fontSize: number
    theme: 'dark' | 'light'
    scrollback: number
  }
}

// ── 工具函数 ──

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ── 默认配置 ──

export function getDefaultConfig(platform: NodeJS.Platform = process.platform): Config {
  return {
    general: {
      defaultShell: platform === 'win32' ? 'powershell.exe' : '/bin/zsh',
      defaultCwd: '',
      fontSize: 14,
      theme: 'dark',
      scrollback: 10000
    }
  }
}

// ── 配置校验 ──

export function validateConfig(data: any, platform: NodeJS.Platform = process.platform): Config {
  const defaults = getDefaultConfig(platform)

  if (!data || typeof data !== 'object') {
    return defaults
  }

  const general = data.general
  if (!general || typeof general !== 'object') {
    return defaults
  }

  return {
    general: {
      defaultShell: typeof general.defaultShell === 'string' && general.defaultShell.length > 0 && general.defaultShell.length <= 500
        ? general.defaultShell
        : defaults.general.defaultShell,
      defaultCwd: typeof general.defaultCwd === 'string' && general.defaultCwd.length <= 2000
        ? general.defaultCwd
        : defaults.general.defaultCwd,
      fontSize: typeof general.fontSize === 'number' && !isNaN(general.fontSize)
        ? clamp(general.fontSize, 8, 32)
        : defaults.general.fontSize,
      theme: general.theme === 'light' ? 'light' : 'dark',
      scrollback: typeof general.scrollback === 'number' && !isNaN(general.scrollback)
        ? clamp(general.scrollback, 100, 100000)
        : defaults.general.scrollback
    }
  }
}
