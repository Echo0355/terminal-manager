/**
 * 渲染进程入口
 *
 * 负责事件绑定、快捷键处理和应用初始化。
 * 具体业务逻辑分布在各子模块中。
 */

import {
  tabs, activeTab, appConfig, setAppConfig, sidebarWidth, setSidebarWidth, loading, sidebar,
  settingsOverlay, settingsClose, settingsCancel, settingsSave, confirmOverlay,
  btnAddProject, statusThemeToggle,
  btnToggleSidebar, btnOpenSettings
} from './state'
import { handleConfirmCancel } from './ui-utils'
import { addTab, closeTab, switchTab, switchToNextTab, switchToPrevTab, closeCurrentPane, focusDirection, updatePaneCount, splitHorizontal, splitVertical } from './tab-pane-manager'
import { fitAllPanes, initWindowResizeHandler, initIMEHandling } from './layout-render'
import { loadConfig, openSettings, closeSettings, saveSettings, applyTheme } from './settings'
import { loadProjects, addProject } from './project-manager'
import { initDragDrop } from './drag-drop'

// ── 侧边栏宽度拖拽 ──

function initSidebarResize(): void {
  let isResizing = false
  let startX = 0
  let startWidth = 0

  sidebar.addEventListener('mousedown', (e) => {
    if (sidebar.classList.contains('collapsed')) return
    const rect = sidebar.getBoundingClientRect()
    if (e.clientX > rect.right - 4) {
      isResizing = true
      startX = e.clientX
      startWidth = sidebar.offsetWidth
      e.preventDefault()
    }
  })

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return
    const delta = e.clientX - startX
    const newWidth = Math.max(150, Math.min(400, startWidth + delta))
    sidebar.style.width = `${newWidth}px`
    setSidebarWidth(newWidth)
  })

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
    }
  })
}

// ── 事件绑定 ──

btnAddProject.addEventListener('click', () => addProject())

settingsClose.addEventListener('click', closeSettings)
settingsCancel.addEventListener('click', closeSettings)
settingsSave.addEventListener('click', saveSettings)
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings()
})

// 活动栏按钮 — 显示/隐藏侧边栏
let pendingSidebarResize: (() => void) | null = null

btnToggleSidebar.addEventListener('click', () => {
  const isCollapsed = sidebar.classList.contains('collapsed')

  // 清理上一次未完成的 transitionend 监听器
  if (pendingSidebarResize) {
    sidebar.removeEventListener('transitionend', pendingSidebarResize)
    pendingSidebarResize = null
  }

  if (isCollapsed) {
    sidebar.classList.remove('collapsed')
    sidebar.style.width = `${sidebarWidth}px`
    btnToggleSidebar.classList.add('active')
  } else {
    setSidebarWidth(sidebar.offsetWidth)
    sidebar.classList.add('collapsed')
    sidebar.style.width = ''
    btnToggleSidebar.classList.remove('active')
  }

  // transition 结束后调整终端尺寸
  pendingSidebarResize = (): void => {
    pendingSidebarResize = null
    if (activeTab) fitAllPanes(activeTab)
  }
  sidebar.addEventListener('transitionend', pendingSidebarResize, { once: true })
})

btnOpenSettings.addEventListener('click', () => openSettings())

// 状态栏主题切换按钮
statusThemeToggle.addEventListener('click', async () => {
  const newTheme: 'dark' | 'light' = appConfig.general.theme === 'dark' ? 'light' : 'dark'
  const newConfig = { ...appConfig, general: { ...appConfig.general, theme: newTheme } }
  const result = await window.terminalAPI.saveConfig(newConfig)
  if (result.success) {
    setAppConfig(newConfig)
    applyTheme(newTheme)
  }
})

// ── 菜单事件 ──

window.terminalAPI.onMenuEvent('menu:new-tab', () => addTab())
window.terminalAPI.onMenuEvent('menu:close-tab', () => {
  if (activeTab) closeTab(activeTab)
})
window.terminalAPI.onMenuEvent('menu:next-tab', () => switchToNextTab())
window.terminalAPI.onMenuEvent('menu:prev-tab', () => switchToPrevTab())
window.terminalAPI.onMenuEvent('menu:close-pane', () => closeCurrentPane())
window.terminalAPI.onMenuEvent('menu:split-horizontal', () => splitHorizontal())
window.terminalAPI.onMenuEvent('menu:split-vertical', () => splitVertical())
window.terminalAPI.onMenuEvent('menu:focus-left', () => focusDirection('left'))
window.terminalAPI.onMenuEvent('menu:focus-right', () => focusDirection('right'))
window.terminalAPI.onMenuEvent('menu:focus-up', () => focusDirection('up'))
window.terminalAPI.onMenuEvent('menu:focus-down', () => focusDirection('down'))
window.terminalAPI.onMenuEvent('menu:settings', () => openSettings())

// ── 快捷键 ──

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && e.key === 't') {
    e.preventDefault()
    addTab()
  }
  if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
    e.preventDefault()
    closeCurrentPane()
  }
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) switchToPrevTab()
    else switchToNextTab()
  }
  if (e.ctrlKey && e.key.length === 1 && e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    const index = parseInt(e.key) - 1
    if (index < tabs.length) switchTab(tabs[index])
  }
  if (e.altKey && !e.shiftKey) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); focusDirection('left') }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusDirection('right') }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusDirection('up') }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusDirection('down') }
  }
  if (e.altKey && e.shiftKey && e.key === 'W') {
    e.preventDefault()
    closeCurrentPane()
  }
  if (e.ctrlKey && e.key === ',') {
    e.preventDefault()
    openSettings()
  }
  if (e.key === 'Escape') {
    if (settingsOverlay.classList.contains('visible')) {
      closeSettings()
    } else if (confirmOverlay.classList.contains('visible')) {
      handleConfirmCancel()
    }
  }
})

// ── 初始化 ──

async function main(): Promise<void> {
  try {
    await loadConfig()
    applyTheme(appConfig.general.theme)
    await loadProjects()
    initSidebarResize()

    initDragDrop()
    initIMEHandling()
    initWindowResizeHandler()
    updatePaneCount()
    loading.classList.add('hidden')
  } catch (err) {
    console.error('初始化终端失败：', err)
    const loadingText = loading.querySelector('.loading-text')
    if (loadingText) {
      loadingText.textContent = `错误：${err instanceof Error ? err.message : '未知错误'}`
    }
    const spinner = loading.querySelector('.loading-spinner')
    if (spinner) (spinner as HTMLElement).style.display = 'none'
  }
}

main()
