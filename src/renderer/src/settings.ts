/**
 * 设置管理
 */

import type { Config } from './types'
import { appConfig, setAppConfig, settingsOverlay, settingShell, settingCwd, settingFontSize, settingScrollback, settingTheme } from './state'
import { showNotification } from './ui-utils'

export async function loadConfig(): Promise<void> {
  setAppConfig(await window.terminalAPI.loadConfig())
}

export function openSettings(): void {
  settingShell.value = appConfig.general.defaultShell
  settingCwd.value = appConfig.general.defaultCwd
  settingFontSize.value = String(appConfig.general.fontSize)
  settingScrollback.value = String(appConfig.general.scrollback)
  settingTheme.value = appConfig.general.theme
  settingsOverlay.classList.add('visible')
}

export function closeSettings(): void {
  settingsOverlay.classList.remove('visible')
}

export async function saveSettings(): Promise<void> {
  const newConfig: Config = {
    general: {
      defaultShell: settingShell.value.trim() || 'powershell.exe',
      defaultCwd: settingCwd.value.trim(),
      fontSize: Math.max(8, Math.min(32, parseInt(settingFontSize.value) || 14)),
      theme: settingTheme.value === 'light' ? 'light' : 'dark',
      scrollback: Math.max(100, Math.min(100000, parseInt(settingScrollback.value) || 10000))
    }
  }

  const result = await window.terminalAPI.saveConfig(newConfig)
  if (result.success) {
    setAppConfig(newConfig)
    closeSettings()
    showNotification('设置已保存，重启后生效', 'success')
  }
}
