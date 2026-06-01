/**
 * 设置管理
 */

import type { Config } from '../types/renderer.types'
import { THEMES } from '../types/renderer.types'
import {
  tabs,
  appConfig,
  setAppConfig,
  settingsOverlay,
  settingShell,
  settingCwd,
  settingFontSize,
  settingScrollback,
  statusThemeToggle
} from '../store/state'
import { showNotification } from '../utils/ui-utils'

/**
 * 加载配置
 */
export async function loadConfig(): Promise<void> {
  setAppConfig(await window.terminalAPI.loadConfig())
}

/**
 * 应用主题：切换 HTML 类名并更新所有终端主题
 */
export function applyTheme(themeName: 'dark' | 'light'): void {
  const root = document.documentElement
  if (themeName === 'light') {
    root.classList.add('light')
  } else {
    root.classList.remove('light')
  }
  // 更新状态栏主题切换按钮文字
  statusThemeToggle.textContent = themeName === 'light' ? '浅色' : '深色'
  // 同步主题到主进程（更新原生标题栏颜色）
  window.terminalAPI.setTheme(themeName)
  const theme = THEMES[themeName]
  for (const tab of tabs) {
    for (const pane of tab.panes.values()) {
      pane.terminal.options.theme = {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        selectionBackground: theme.selectionBackground
      }
    }
  }
}

/**
 * 打开设置对话框
 */
export function openSettings(): void {
  settingShell.value = appConfig.general.defaultShell
  settingCwd.value = appConfig.general.defaultCwd
  settingFontSize.value = String(appConfig.general.fontSize)
  settingScrollback.value = String(appConfig.general.scrollback)

  // 可视化主题选择器
  themeButtons.forEach((btn) => {
    const el = btn as HTMLElement
    el.classList.toggle('active', el.dataset.theme === appConfig.general.theme)
  })

  settingsOverlay.classList.add('visible')
}

/**
 * 关闭设置对话框
 */
export function closeSettings(): void {
  settingsOverlay.classList.remove('visible')
}

/**
 * 保存设置
 */
export async function saveSettings(): Promise<void> {
  const activeThemeBtn = settingsOverlay.querySelector('.theme-option.active') as HTMLElement
  const newConfig: Config = {
    general: {
      defaultShell: settingShell.value.trim() || appConfig.general.defaultShell,
      defaultCwd: settingCwd.value.trim(),
      fontSize: Math.max(8, Math.min(32, parseInt(settingFontSize.value) || 14)),
      theme: activeThemeBtn?.dataset.theme === 'light' ? 'light' : 'dark',
      scrollback: Math.max(100, Math.min(100000, parseInt(settingScrollback.value) || 10000))
    }
  }

  const result = await window.terminalAPI.saveConfig(newConfig)
  if (result.success) {
    // 主题即时生效，其他设置需重启
    const changedNonTheme =
      newConfig.general.defaultShell !== appConfig.general.defaultShell ||
      newConfig.general.defaultCwd !== appConfig.general.defaultCwd ||
      newConfig.general.fontSize !== appConfig.general.fontSize ||
      newConfig.general.scrollback !== appConfig.general.scrollback
    setAppConfig(newConfig)
    applyTheme(newConfig.general.theme)
    closeSettings()
    showNotification(
      changedNonTheme ? '设置已保存，部分设置需重启后生效' : '设置已保存',
      'success'
    )
  }
}

// 绑定主题选择器点击事件
const themeButtons = document.querySelectorAll('.theme-option')
themeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    themeButtons.forEach((b) => (b as HTMLElement).classList.remove('active'))
    ;(btn as HTMLElement).classList.add('active')
  })
})
