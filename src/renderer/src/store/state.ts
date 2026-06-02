/**
 * 渲染进程全局状态
 */

import type { Tab, Project, Config, ShellInfo } from '../types/renderer.types'

// ── 全局状态 ──

export const tabs: Tab[] = []
export let activeTab: Tab | null = null
export let tabIndex = 0
export let paneCounter = 0
export let projects: Project[] = []
export let detectedShells: ShellInfo[] = []
// 初始默认值，启动时会被主进程加载的配置覆盖
// 注：无法使用 shared/config.ts 的 getDefaultConfig()，因其依赖 process.platform（渲染进程不可用）
export let appConfig: Config = {
  general: {
    defaultShell: '',
    defaultCwd: '',
    fontSize: 14,
    theme: 'dark',
    scrollback: 10000
  }
}
export let sidebarWidth = 260

export function setActiveTab(tab: Tab | null): void {
  activeTab = tab
}

export function setAppConfig(config: Config): void {
  appConfig = config
}

export function setProjects(p: Project[]): void {
  projects = p
}

export function setDetectedShells(shells: ShellInfo[]): void {
  detectedShells = shells
}

export function setSidebarWidth(w: number): void {
  sidebarWidth = w
}

export function incrementTabIndex(): number {
  return ++tabIndex
}

export function incrementPaneCounter(): number {
  return ++paneCounter
}

// ── 布局保存回调（避免循环依赖）──

let _saveFn: (() => void) | null = null

export function registerSaveLayout(fn: () => void): void {
  _saveFn = fn
}

export function requestSaveLayout(): void {
  if (_saveFn) _saveFn()
}

// ── DOM 元素引用 ──

export const tabBar = document.getElementById('tab-bar')!
export const terminalContainer = document.getElementById('terminal-container')!
export const terminalWorkspace = document.createElement('div')
terminalWorkspace.id = 'terminal-workspace'
terminalContainer.parentElement?.insertBefore(terminalWorkspace, terminalContainer)
terminalWorkspace.appendChild(tabBar)
terminalWorkspace.appendChild(terminalContainer)
export const statusShell = document.getElementById('status-shell')!
export const statusCwd = document.getElementById('status-cwd')!
export const loading = document.getElementById('loading')!
export const projectList = document.getElementById('project-list')!
export const btnAddProject = document.getElementById('btn-add-project')!
export const sidebar = document.getElementById('sidebar')!

// 设置对话框 DOM
export const settingsOverlay = document.getElementById('settings-overlay')!
export const settingsClose = document.getElementById('settings-close')!
export const settingsCancel = document.getElementById('settings-cancel')!
export const settingsSave = document.getElementById('settings-save')!
export const settingShellSelect = document.getElementById('setting-shell-select') as HTMLSelectElement
export const settingShell = document.getElementById('setting-shell') as HTMLInputElement
export const settingCwd = document.getElementById('setting-cwd') as HTMLInputElement
export const settingFontSize = document.getElementById('setting-font-size') as HTMLInputElement
export const settingScrollback = document.getElementById('setting-scrollback') as HTMLInputElement
export const statusThemeToggle = document.getElementById('status-theme-toggle')!
export const statusPanes = document.getElementById('status-panes')!

// 活动栏 DOM
export const btnToggleSidebar = document.getElementById('btn-toggle-sidebar')!
export const btnOpenSettings = document.getElementById('btn-open-settings')!

// 确认对话框 DOM
export const confirmOverlay = document.getElementById('confirm-overlay')!
export const confirmTitle = document.getElementById('confirm-title')!
export const confirmBody = document.getElementById('confirm-body')!
export const confirmOk = document.getElementById('confirm-ok')!
export const confirmCancel = document.getElementById('confirm-cancel')!

// 通知 DOM
export const notification = document.getElementById('notification')!
