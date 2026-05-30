/**
 * 渲染进程入口
 *
 * 负责事件绑定、快捷键处理和应用初始化。
 * 具体业务逻辑分布在各子模块中。
 */

import { tabs, activeTab, setSidebarWidth, loading, sidebar, settingsOverlay, settingsClose, settingsCancel, settingsSave, confirmOverlay, tabAddBtn, btnAddProject } from './state'
import { handleConfirmCancel } from './ui-utils'
import { scheduleSaveLayout, addTab, closeTab, switchTab, switchToNextTab, switchToPrevTab, splitPane, closeCurrentPane, focusDirection, restoreLayout } from './tab-pane-manager'
import { fitAllPanes } from './layout-render'
import { loadConfig, openSettings, closeSettings, saveSettings } from './settings'
import { loadProjects, addProject } from './project-manager'

// ── 侧边栏宽度拖拽 ──

function initSidebarResize(): void {
  let isResizing = false
  let startX = 0
  let startWidth = 0

  sidebar.addEventListener('mousedown', (e) => {
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
      scheduleSaveLayout()
    }
  })
}

// ── 事件绑定 ──

tabAddBtn.addEventListener('click', () => addTab())
btnAddProject.addEventListener('click', () => addProject())

settingsClose.addEventListener('click', closeSettings)
settingsCancel.addEventListener('click', closeSettings)
settingsSave.addEventListener('click', saveSettings)
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings()
})

// ── 菜单事件 ──

window.terminalAPI.onMenuEvent('menu:new-tab', () => addTab())
window.terminalAPI.onMenuEvent('menu:close-tab', () => {
  if (activeTab) closeTab(activeTab)
})
window.terminalAPI.onMenuEvent('menu:next-tab', () => switchToNextTab())
window.terminalAPI.onMenuEvent('menu:prev-tab', () => switchToPrevTab())
window.terminalAPI.onMenuEvent('menu:split-h', () => splitPane('horizontal'))
window.terminalAPI.onMenuEvent('menu:split-v', () => splitPane('vertical'))
window.terminalAPI.onMenuEvent('menu:close-pane', () => closeCurrentPane())
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
  if (e.altKey && e.shiftKey && e.key === '-') {
    e.preventDefault()
    splitPane('horizontal')
  }
  if (e.altKey && e.shiftKey && e.key === '=') {
    e.preventDefault()
    splitPane('vertical')
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

window.addEventListener('resize', () => {
  if (activeTab) fitAllPanes(activeTab)
})

// ── 初始化 ──

async function main(): Promise<void> {
  try {
    await loadConfig()
    await loadProjects()
    initSidebarResize()

    const restored = await restoreLayout()

    if (!restored) {
      await addTab()
    }

    loading.classList.add('hidden')
  } catch (err) {
    console.error('初始化终端失败：', err)
    loading.textContent = `错误：${err instanceof Error ? err.message : '未知错误'}`
  }
}

main()
