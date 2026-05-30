/**
 * 标签页和终端面板管理
 */

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

import type { Pane, Tab, LayoutNode, LayoutStateNode, PaneState, TabState, LayoutState } from './types'
import { THEMES } from './types'
import {
  tabs, activeTab, setActiveTab, incrementTabIndex, incrementPaneCounter, appConfig,
  sidebarWidth, setSidebarWidth, registerSaveLayout,
  tabBar, tabAddBtn, terminalContainer, statusShell, statusCwd, statusPanes, sidebar
} from './state'
import { showNotification, showConfirm, escapeHtml } from './ui-utils'
import {
  makeLeaf, makeContainer, isLeaf,
  findParentAndIndex, removeFromLayout, simplifyLayout, findAdjacentPane
} from './layout-ops'
import { renderLayout, fitAllPanes } from './layout-render'

// ── 防抖保存 ──

let saveTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleSaveLayout(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const state = serializeCurrentState()
    window.terminalAPI.saveLayout(state)
  }, 500)
}

// 注册保存回调，供 layout-render 调用（避免循环依赖）
registerSaveLayout(scheduleSaveLayout)

/**
 * 更新状态栏面板计数
 */
export function updatePaneCount(): void {
  if (!activeTab) return
  const count = activeTab.panes.size
  statusPanes.textContent = count > 1 ? `${count} 个面板` : ''
}

// ── 焦点管理 ──

export function focusPane(tab: Tab, paneId: string): void {
  const old = tab.panes.get(tab.focusedPaneId)
  if (old) old.element.classList.remove('focused')

  tab.focusedPaneId = paneId
  const pane = tab.panes.get(paneId)
  if (pane) {
    pane.element.classList.add('focused')
    pane.terminal.focus()
  }

  if (pane) {
    const shellText = statusShell.querySelector('span:last-child')
    const cwdText = statusCwd.querySelector('span:last-child')
    if (shellText) shellText.textContent = pane.shell || appConfig.general.defaultShell || 'PowerShell'
    if (cwdText) cwdText.textContent = pane.cwd || appConfig.general.defaultCwd || '~'
  }
}

// ── 创建 PTY + xterm ──

export async function createTerminalPane(options?: { shell?: string; cwd?: string }): Promise<Pane> {
  const id = `pane_${incrementPaneCounter()}`

  const terminal = new Terminal({
    fontSize: appConfig.general.fontSize,
    fontFamily: "'Cascadia Code', 'Microsoft YaHei', Consolas, monospace",
    theme: THEMES[appConfig.general.theme],
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: appConfig.general.scrollback,
    allowProposedApi: true
  })

  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())

  const element = document.createElement('div')
  element.className = 'pane'
  terminal.open(element)

  const result = await window.terminalAPI.createTerminal({
    cols: terminal.cols,
    rows: terminal.rows,
    shell: options?.shell,
    cwd: options?.cwd
  })

  if (!result.success || !result.id) {
    const errorMsg = result.error || '未知错误'
    terminal.write('\r\n\x1b[31m✗ 创建终端失败：' + errorMsg + '\x1b[0m\r\n')
    terminal.write('\r\n\x1b[33m提示：请检查 Shell 路径和工作目录是否正确\x1b[0m\r\n')
    showNotification('终端创建失败：' + errorMsg, 'error', 5000)
    const cleanupData = (): void => {}
    const cleanupExit = (): void => {}
    const cleanupError = (): void => {}
    return { id, sessionId: '', shell: '', cwd: '', terminal, fitAddon, element, cleanupData, cleanupExit, cleanupError }
  }

  const sessionId = result.id
  const shell = result.shell || appConfig.general.defaultShell
  const actualCwd = result.cwd || options?.cwd || ''

  terminal.onData((data) => {
    window.terminalAPI.writeToTerminal(sessionId, data)
  })

  const cleanupData = window.terminalAPI.onTerminalData(sessionId, (data) => {
    terminal.write(data)
  })

  const cleanupExit = window.terminalAPI.onTerminalExit(sessionId, () => {
    terminal.write('\r\n\x1b[33m[进程已退出]\x1b[0m\r\n')
  })

  const cleanupError = window.terminalAPI.onTerminalError(sessionId, (error) => {
    terminal.write('\r\n\x1b[31m[错误] ' + error + '\x1b[0m\r\n')
    showNotification('终端错误：' + error, 'error')
  })

  terminal.onResize(({ cols, rows }) => {
    window.terminalAPI.resizeTerminal(sessionId, cols, rows)
  })

  element.addEventListener('mousedown', () => {
    const tab = tabs.find((t) => t.panes.has(id))
    if (tab) focusPane(tab, id)
  })

  return { id, sessionId, shell, cwd: actualCwd, terminal, fitAddon, element, cleanupData, cleanupExit, cleanupError }
}

export async function destroyPane(pane: Pane): Promise<void> {
  pane.cleanupData()
  pane.cleanupExit()
  pane.cleanupError()
  pane.terminal.dispose()
  if (pane.sessionId) {
    await window.terminalAPI.closeTerminal(pane.sessionId)
  }
}

// ── 分屏操作 ──

export async function splitPane(direction: 'horizontal' | 'vertical'): Promise<void> {
  if (!activeTab) return

  const tab = activeTab
  const currentPaneId = tab.focusedPaneId

  const newPane = await createTerminalPane()
  tab.panes.set(newPane.id, newPane)

  const found = findParentAndIndex(tab.layout, currentPaneId)

  if (!found) {
    const newLayout = makeContainer(direction, [
      makeLeaf(currentPaneId),
      makeLeaf(newPane.id)
    ])
    tab.layout = newLayout
  } else {
    const { parent, index } = found

    if (parent.direction === direction) {
      parent.children.splice(index + 1, 0, makeLeaf(newPane.id))
      const count = parent.children.length
      const size = Math.floor(100 / count)
      parent.sizes = parent.children.map((_, i) =>
        i === count - 1 ? 100 - size * (count - 1) : size
      )
    } else {
      const newContainer = makeContainer(direction, [
        makeLeaf(currentPaneId),
        makeLeaf(newPane.id)
      ])
      parent.children[index] = newContainer
    }
  }

  renderLayout(tab)
  focusPane(tab, newPane.id)
  updatePaneCount()
  scheduleSaveLayout()
}

// ── 关闭 Pane ──

export async function closePane(tab: Tab, paneId: string): Promise<void> {
  if (tab.panes.size === 1) {
    await closeTab(tab)
    return
  }

  const confirmed = await showConfirm('关闭面板', '确定要关闭当前面板吗？')
  if (!confirmed) return

  if (tab.focusedPaneId === paneId) {
    const adjacent =
      findAdjacentPane(tab.layout, paneId, 'left') ??
      findAdjacentPane(tab.layout, paneId, 'right') ??
      findAdjacentPane(tab.layout, paneId, 'up') ??
      findAdjacentPane(tab.layout, paneId, 'down')
    if (adjacent) focusPane(tab, adjacent)
  }

  removeFromLayout(tab.layout, paneId)

  const pane = tab.panes.get(paneId)
  if (pane) {
    await destroyPane(pane)
    tab.panes.delete(paneId)
  }

  simplifyLayout(tab)
  renderLayout(tab)
  updatePaneCount()
  scheduleSaveLayout()
}

export async function closeCurrentPane(): Promise<void> {
  if (!activeTab) return
  await closePane(activeTab, activeTab.focusedPaneId)
}

export function focusDirection(direction: 'left' | 'right' | 'up' | 'down'): void {
  if (!activeTab) return
  const adjacent = findAdjacentPane(activeTab.layout, activeTab.focusedPaneId, direction)
  if (adjacent) focusPane(activeTab, adjacent)
}

// ── 布局序列化 ──

function serializeLayoutNode(node: LayoutNode): LayoutStateNode {
  if (isLeaf(node)) {
    return { type: 'leaf', paneId: node.paneId }
  }
  return {
    type: 'container',
    direction: node.direction,
    sizes: [...node.sizes],
    children: node.children.map(serializeLayoutNode)
  }
}

function serializeCurrentState(): LayoutState {
  const tabStates: TabState[] = tabs.map((tab) => {
    const paneStates: PaneState[] = []
    for (const pane of tab.panes.values()) {
      paneStates.push({
        id: pane.id,
        shell: pane.shell || appConfig.general.defaultShell,
        cwd: pane.cwd || '~'
      })
    }
    return {
      id: tab.id,
      title: tab.title,
      activePaneId: tab.focusedPaneId,
      layout: serializeLayoutNode(tab.layout),
      panes: paneStates
    }
  })

  return {
    version: '0.1.0',
    tabs: tabStates,
    activeTabId: activeTab?.id || '',
    windowState: {
      sidebarWidth
    }
  }
}

// ── 恢复布局 ──

export async function restoreLayout(): Promise<boolean> {
  const state = await window.terminalAPI.loadLayout()
  if (!state || !state.tabs || state.tabs.length === 0) {
    return false
  }

  if (state.windowState) {
    setSidebarWidth(state.windowState.sidebarWidth || 260)
    sidebar.style.width = `${sidebarWidth}px`
  }

  for (const tabState of state.tabs) {
    await restoreTab(tabState, tabState.id === state.activeTabId)
  }

  return true
}

async function restoreTab(tabState: TabState, isActive: boolean): Promise<void> {
  const paneMap = new Map<string, Pane>()
  for (const paneState of tabState.panes) {
    try {
      const pane = await createTerminalPane({
        shell: paneState.shell,
        cwd: paneState.cwd !== '~' ? paneState.cwd : undefined
      })
      paneMap.set(paneState.id, pane)
    } catch {
      continue
    }
  }

  if (paneMap.size === 0) return

  const oldToNewId = new Map<string, string>()
  for (const [oldId, pane] of paneMap) {
    oldToNewId.set(oldId, pane.id)
  }

  function remapLayout(node: LayoutStateNode): LayoutNode {
    if (node.type === 'leaf' && node.paneId) {
      const newId = oldToNewId.get(node.paneId)
      return makeLeaf(newId || node.paneId)
    }
    if (node.type === 'container' && node.direction && node.children && node.sizes) {
      return {
        type: 'container',
        direction: node.direction,
        sizes: [...node.sizes],
        children: node.children.map(remapLayout)
      }
    }
    return makeLeaf(paneMap.values().next().value!.id)
  }

  const layout = remapLayout(tabState.layout)
  const firstPane = paneMap.values().next().value!
  const focusedPaneId = oldToNewId.get(tabState.activePaneId) || firstPane.id

  const containerEl = document.createElement('div')
  containerEl.className = 'tab-content'
  containerEl.style.width = '100%'
  containerEl.style.height = '100%'
  containerEl.style.display = 'none'

  const newPaneMap = new Map<string, Pane>()
  for (const [, pane] of paneMap) {
    newPaneMap.set(pane.id, pane)
  }

  const tab: Tab = {
    id: tabState.id,
    title: tabState.title,
    layout,
    panes: newPaneMap,
    focusedPaneId,
    containerEl,
    tabEl: null as unknown as HTMLElement
  }

  const tabEl = document.createElement('div')
  tabEl.className = 'tab'
  tabEl.innerHTML = `<span class="tab-title">${escapeHtml(tabState.title)}</span><span class="tab-close">×</span>`
  tab.tabEl = tabEl

  tabs.push(tab)

  tabEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('tab-close')) return
    switchTab(tab)
  })

  tabEl.querySelector('.tab-close')!.addEventListener('click', (e) => {
    e.stopPropagation()
    closeTab(tab)
  })

  tabBar.insertBefore(tabEl, tabAddBtn)
  terminalContainer.appendChild(containerEl)

  renderLayout(tab)

  if (isActive) {
    switchTab(tab)
  }
}

// ── 标签操作 ──

export async function addTab(cwd?: string): Promise<void> {
  const pane = await createTerminalPane(cwd ? { cwd } : undefined)
  const title = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() || `终端 ${incrementTabIndex()}` : `终端 ${incrementTabIndex()}`
  const id = `tab_${Date.now()}`

  const containerEl = document.createElement('div')
  containerEl.className = 'tab-content'
  containerEl.style.width = '100%'
  containerEl.style.height = '100%'
  containerEl.style.display = 'none'

  const tab: Tab = {
    id,
    title,
    layout: makeLeaf(pane.id),
    panes: new Map([[pane.id, pane]]),
    focusedPaneId: pane.id,
    containerEl,
    tabEl: null as unknown as HTMLElement
  }

  const tabEl = document.createElement('div')
  tabEl.className = 'tab'
  tabEl.innerHTML = `<span class="tab-title">${escapeHtml(title)}</span><span class="tab-close">×</span>`
  tab.tabEl = tabEl

  tabs.push(tab)

  tabEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('tab-close')) return
    switchTab(tab)
  })

  tabEl.querySelector('.tab-close')!.addEventListener('click', (e) => {
    e.stopPropagation()
    closeTab(tab)
  })

  tabBar.insertBefore(tabEl, tabAddBtn)
  terminalContainer.appendChild(containerEl)

  renderLayout(tab)
  switchTab(tab)
  scheduleSaveLayout()
}

export function switchTab(tab: Tab): void {
  if (activeTab?.id === tab.id) return

  for (const t of tabs) {
    t.containerEl.style.display = 'none'
    t.tabEl.classList.remove('active')
  }

  tab.containerEl.style.display = 'block'
  tab.tabEl.classList.add('active')
  setActiveTab(tab)

  fitAllPanes(tab)
  const focused = tab.panes.get(tab.focusedPaneId)
  if (focused) {
    focused.terminal.focus()
    const shellText = statusShell.querySelector('span:last-child')
    const cwdText = statusCwd.querySelector('span:last-child')
    if (shellText) shellText.textContent = focused.shell || appConfig.general.defaultShell || 'PowerShell'
    if (cwdText) cwdText.textContent = focused.cwd || appConfig.general.defaultCwd || '~'
  }

  updatePaneCount()
  scheduleSaveLayout()
}

export async function closeTab(tab: Tab): Promise<void> {
  const index = tabs.indexOf(tab)
  if (index === -1) return

  if (tabs.length > 1) {
    const confirmed = await showConfirm('关闭标签', `确定要关闭标签"${tab.title}"吗？`)
    if (!confirmed) return
  }

  for (const pane of tab.panes.values()) {
    await destroyPane(pane)
  }

  tab.tabEl.remove()
  tab.containerEl.remove()
  tabs.splice(index, 1)

  if (activeTab?.id === tab.id) {
    setActiveTab(null)
    if (tabs.length > 0) {
      switchTab(tabs[Math.min(index, tabs.length - 1)])
    }
  }

  if (tabs.length === 0) {
    await addTab()
  }

  scheduleSaveLayout()
}

export function switchToNextTab(): void {
  if (tabs.length <= 1) return
  const index = activeTab ? tabs.indexOf(activeTab) : -1
  switchTab(tabs[(index + 1) % tabs.length])
}

export function switchToPrevTab(): void {
  if (tabs.length <= 1) return
  const index = activeTab ? tabs.indexOf(activeTab) : 0
  switchTab(tabs[(index - 1 + tabs.length) % tabs.length])
}
