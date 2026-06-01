/**
 * 标签页与面板生命周期管理
 *
 * 负责终端面板的创建、切换、分屏、关闭及拖拽操作。
 * 管理标签页的创建/切换/关闭，以及布局的序列化和恢复。
 */

import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import {
  collectLeafIds,
  findAdjacentPane,
  insertAtPosition,
  isLeaf,
  makeContainer,
  makeLeaf,
  removeFromLayout,
  simplifyLayout
} from './layout-ops'
import { attachTabDrag } from './drag-drop'
import { fitAllPanes, registerClaudeRunCallback, registerClosePaneCallback, registerFocusPaneCallback, renderLayout } from './layout-render'
import {
  activeTab,
  appConfig,
  incrementPaneCounter,
  incrementTabIndex,
  registerSaveLayout,
  setActiveTab,
  setSidebarWidth,
  sidebar,
  sidebarWidth,
  statusCwd,
  statusPanes,
  statusShell,
  tabBar,
  tabs,
  terminalContainer
} from './state'
import { THEMES, type LayoutNode, type LayoutStateNode, type Pane, type Tab, type TabState } from './types'
import { getPaneDisplayTitle, renderWorkspaceTab, titleFromCwd } from './tab-chrome'
import { showConfirm, showNotification } from './ui-utils'
import { showTerminalContextMenu } from './terminal-context-menu'

registerClosePaneCallback((tab, paneId) => {
  void closePane(tab, paneId)
})

registerFocusPaneCallback((tab, paneId) => {
  focusPane(tab, paneId)
})

registerClaudeRunCallback()

/**
 * 布局保存已禁用 — 每次启动为空白状态，退出时清空布局文件。
 * 保留空函数以兼容各处调用。
 */
export function scheduleSaveLayout(): void {
  // no-op
}

registerSaveLayout(scheduleSaveLayout)

tabBar.addEventListener('click', (event) => {
  const target = event.target as HTMLElement

  if (target.closest('.pane-tab') || target.closest('.pane-close-btn')) {
    return
  }

  const closeEl = target.closest('.tab-close')
  if (closeEl) {
    event.stopPropagation()
    const tabEl = closeEl.closest('.tab') as HTMLElement | null
    const tabId = tabEl?.getAttribute('data-tab-id')
    const tab = tabs.find((item) => item.id === tabId)
    if (tab) {
      void closeTab(tab)
    }
    return
  }

  const tabEl = target.closest('.tab') as HTMLElement | null
  const tabId = tabEl?.getAttribute('data-tab-id')
  const tab = tabs.find((item) => item.id === tabId)
  if (tab) {
    switchTab(tab)
  }
})

function updateStatusForPane(pane: Pane | undefined): void {
  const shellText = statusShell.querySelector('span:last-child')
  const cwdText = statusCwd.querySelector('span:last-child')
  if (!shellText || !cwdText) return

  shellText.textContent = pane?.shell || appConfig.general.defaultShell || 'PowerShell'
  cwdText.textContent = pane?.cwd || appConfig.general.defaultCwd || '~'
}

export function updatePaneCount(): void {
  if (!activeTab) {
    statusPanes.textContent = ''
    return
  }

  const count = activeTab.panes.size
  statusPanes.textContent = count > 1 ? `${count} 个面板` : ''
}

export function focusPane(tab: Tab, paneId: string): void {
  const previousPane = tab.panes.get(tab.focusedPaneId)
  if (previousPane) {
    previousPane.element.classList.remove('focused')
    previousPane.element.closest('.pane-frame')?.classList.remove('focused')
  }

  tab.focusedPaneId = paneId
  const pane = tab.panes.get(paneId)
  if (!pane) return

  pane.element.classList.add('focused')
  pane.element.closest('.pane-frame')?.classList.add('focused')
  pane.terminal.focus()
  updateStatusForPane(pane)

  if (activeTab?.id === tab.id) {
    refreshTabBar()
  }
}

function nextTerminalTitle(cwd?: string): string {
  return titleFromCwd(cwd) || `终端 ${incrementTabIndex()}`
}

function createTabContainer(): HTMLElement {
  const containerEl = document.createElement('div')
  containerEl.className = 'tab-content'
  containerEl.style.width = '100%'
  containerEl.style.height = '100%'
  containerEl.style.display = 'none'
  return containerEl
}

function createTabShell(tab: Tab): void {
  const tabEl = document.createElement('div')
  tabEl.className = 'tab'
  tab.tabEl = tabEl
  attachTabDrag(tabEl, tab)
}

function createTabRecord(options: {
  id: string
  title: string
  layout: LayoutNode
  panes: Map<string, Pane>
  focusedPaneId: string
}): Tab {
  const tab: Tab = {
    id: options.id,
    title: options.title,
    layout: options.layout,
    panes: options.panes,
    focusedPaneId: options.focusedPaneId,
    containerEl: createTabContainer(),
    tabEl: document.createElement('div')
  }

  createTabShell(tab)
  return tab
}

function mountTab(tab: Tab, beforeTab?: Tab | null): void {
  const beforeIndex = beforeTab ? tabs.indexOf(beforeTab) : -1
  if (beforeIndex >= 0) {
    tabs.splice(beforeIndex, 0, tab)
  } else {
    tabs.push(tab)
  }

  const beforeEl = beforeIndex >= 0 ? beforeTab?.tabEl ?? null : null
  tabBar.insertBefore(tab.tabEl, beforeEl)
  terminalContainer.appendChild(tab.containerEl)
}

function refreshTabBar(): void {
  for (const tab of tabs) {
    renderWorkspaceTab(tab, activeTab?.id === tab.id)
    tabBar.insertBefore(tab.tabEl, null)
  }
}

function copyTerminalSelection(terminal: Terminal): boolean {
  const selection = terminal.getSelection()
  if (!selection) return false
  window.terminalAPI.writeClipboardText(selection)
  return true
}

function pasteClipboardToTerminal(terminal: Terminal): boolean {
  const text = window.terminalAPI.readClipboardText()
  if (!text) return false
  terminal.paste(text)
  return true
}

function bindTerminalClipboard(terminal: Terminal, element: HTMLElement): void {
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true

    const key = event.key.toLowerCase()
    const modifier = event.ctrlKey || event.metaKey

    if (modifier && key === 'c' && (event.shiftKey || event.metaKey || terminal.hasSelection())) {
      copyTerminalSelection(terminal)
      event.preventDefault()
      return false
    }

    if (modifier && key === 'v') {
      pasteClipboardToTerminal(terminal)
      event.preventDefault()
      return false
    }

    return true
  })

  element.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text/plain') || window.terminalAPI.readClipboardText()
    if (!text) return
    event.preventDefault()
    terminal.paste(text)
  })

  element.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      copyTerminalSelection(terminal)
    }
  })

  // xterm 默认右键会移动并聚焦隐藏 textarea。捕获阶段拦截该行为，
  // 避免影响 IME 定位，并交由应用菜单明确执行剪贴板操作。
  element.addEventListener('mousedown', (event) => {
    if (event.button === 2) {
      event.stopImmediatePropagation()
    }
  }, { capture: true })

  element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()

    showTerminalContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          id: 'copy',
          label: '复制',
          shortcut: 'Ctrl+C',
          enabled: terminal.hasSelection(),
          onSelect: () => copyTerminalSelection(terminal)
        },
        {
          id: 'paste',
          label: '粘贴',
          shortcut: 'Ctrl+V',
          enabled: Boolean(window.terminalAPI.readClipboardText()),
          onSelect: () => pasteClipboardToTerminal(terminal)
        },
        {
          id: 'cut',
          label: '剪切',
          shortcut: 'Ctrl+X',
          enabled: false,
          title: '终端输出不可编辑，无法剪切'
        }
      ]
    })
  }, { capture: true })
}

const SCROLL_BOTTOM_EPSILON = 2

function getTerminalCore(terminal: Terminal): any {
  return (terminal as any)._core
}

function syncTerminalScrollArea(terminal: Terminal): void {
  const viewport = getTerminalCore(terminal)?.viewport
  if (typeof viewport?.syncScrollArea === 'function') {
    viewport.syncScrollArea(true)
  }
}

function isTerminalBufferAtBottom(terminal: Terminal): boolean {
  const buffer = terminal.buffer.active
  return buffer.viewportY >= buffer.baseY
}

function isTerminalViewportAtBottom(terminal: Terminal): boolean {
  const viewportEl = terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null
  if (!viewportEl) return isTerminalBufferAtBottom(terminal)

  return viewportEl.scrollTop + viewportEl.clientHeight >= viewportEl.scrollHeight - SCROLL_BOTTOM_EPSILON
}

function isTerminalUserScrolling(terminal: Terminal): boolean {
  const isUserScrolling = getTerminalCore(terminal)?._bufferService?.isUserScrolling
  if (typeof isUserScrolling === 'boolean') {
    return isUserScrolling
  }

  return !isTerminalBufferAtBottom(terminal)
}

function shouldStickToBottom(terminal: Terminal): boolean {
  return !isTerminalUserScrolling(terminal) || isTerminalBufferAtBottom(terminal) || isTerminalViewportAtBottom(terminal)
}

function writeTerminalOutput(terminal: Terminal, data: string): void {
  const stickToBottom = shouldStickToBottom(terminal)

  terminal.write(data, () => {
    const viewportWasAtBottom = isTerminalViewportAtBottom(terminal)
    syncTerminalScrollArea(terminal)

    if (stickToBottom || viewportWasAtBottom || isTerminalViewportAtBottom(terminal)) {
      terminal.scrollToBottom()
      syncTerminalScrollArea(terminal)
    }
  })
}

export async function createTerminalPane(options?: { shell?: string; cwd?: string; title?: string }): Promise<Pane> {
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

  // 延迟初始化滚动位置，确保终端完全渲染后再设置
  // 解决问题：第一次输出较长内容时滚动条不出现
  requestAnimationFrame(() => {
    terminal.scrollToBottom()
  })

  const result = await window.terminalAPI.createTerminal({
    cols: terminal.cols,
    rows: terminal.rows,
    shell: options?.shell,
    cwd: options?.cwd
  })

  if (!result.success || !result.id) {
    const errorMsg = result.error || 'Unknown error'
    terminal.write(`\r\n\x1b[31m✗ Failed to create terminal: ${errorMsg}\x1b[0m\r\n`)
    terminal.write('\r\n\x1b[33mHint: check the shell path and working directory.\x1b[0m\r\n')
    showNotification(`终端创建失败: ${errorMsg}`, 'error', 5000)

    return {
      id,
      sessionId: '',
      shell: '',
      cwd: '',
      title: options?.title,
      terminal,
      fitAddon,
      element,
      cleanupData: () => {},
      cleanupExit: () => {},
      cleanupError: () => {}
    }
  }

  const sessionId = result.id
  const shell = result.shell || appConfig.general.defaultShell
  const actualCwd = result.cwd || options?.cwd || ''
  const title = options?.title || titleFromCwd(actualCwd) || ''

  terminal.onData((data) => {
    void window.terminalAPI.writeToTerminal(sessionId, data)
  })

  bindTerminalClipboard(terminal, element)

  const cleanupData = window.terminalAPI.onTerminalData(sessionId, (data) => {
    writeTerminalOutput(terminal, data)
  })

  const cleanupExit = window.terminalAPI.onTerminalExit(sessionId, () => {
    terminal.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n')
  })

  const cleanupError = window.terminalAPI.onTerminalError(sessionId, (error) => {
    terminal.write(`\r\n\x1b[31m[Error] ${error}\x1b[0m\r\n`)
    showNotification(`终端错误: ${error}`, 'error')
  })

  terminal.onResize(({ cols, rows }) => {
    void window.terminalAPI.resizeTerminal(sessionId, cols, rows)
  })

  element.addEventListener('mousedown', () => {
    const tab = tabs.find((item) => item.panes.has(id))
    if (tab) {
      focusPane(tab, id)
    }
  })

  return { id, sessionId, shell, cwd: actualCwd, title, terminal, fitAddon, element, cleanupData, cleanupExit, cleanupError }
}

export async function destroyPane(pane: Pane): Promise<void> {
  pane.cleanupData()
  pane.cleanupExit()
  pane.cleanupError()
  // 先关闭 PTY 会话，再销毁终端对象，避免终端 dispose 后 PTY 仍向已销毁的写入端推送数据
  if (pane.sessionId) {
    await window.terminalAPI.closeTerminal(pane.sessionId)
  }
  pane.terminal.dispose()
}

function removeTab(tab: Tab): void {
  const index = tabs.indexOf(tab)
  if (index === -1) return

  tab.tabEl.remove()
  tab.containerEl.remove()
  tabs.splice(index, 1)

  if (activeTab?.id === tab.id) {
    setActiveTab(null)
    if (tabs.length > 0) {
      switchTab(tabs[Math.min(index, tabs.length - 1)])
    } else {
      updateStatusForPane(undefined)
      updatePaneCount()
      refreshTabBar()
    }
  } else {
    refreshTabBar()
  }
}

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

    if (adjacent) {
      tab.focusedPaneId = adjacent
    }
  }

  const removed = removeFromLayout(tab.layout, paneId)
  if (!removed) {
    console.warn('closePane: removeFromLayout 未找到面板', paneId)
  }

  const pane = tab.panes.get(paneId)
  if (pane) {
    await destroyPane(pane)
    tab.panes.delete(paneId)
  }

  if (removed) {
    simplifyLayout(tab)
  }
  renderLayout(tab)

  const focusedPane = tab.panes.get(tab.focusedPaneId)
  if (focusedPane) {
    focusPane(tab, focusedPane.id)
  }

  updatePaneCount()
  if (activeTab?.id === tab.id) {
    refreshTabBar()
  }
  scheduleSaveLayout()
}

export async function closeCurrentPane(): Promise<void> {
  if (!activeTab) return
  await closePane(activeTab, activeTab.focusedPaneId)
}

/**
 * 分屏操作 — 对标 VS Code 的 split editor
 *
 * 在当前聚焦面板的指定方向创建新的终端面板。
 * 使用 Distribute 模式分配空间，现有面板按比例缩小。
 *
 * @param direction - 分屏方向：'horizontal'（左右）或 'vertical'（上下）
 */
export async function splitPane(direction: 'horizontal' | 'vertical'): Promise<void> {
  if (!activeTab) return

  const focusedPaneId = activeTab.focusedPaneId
  const focusedPane = activeTab.panes.get(focusedPaneId)
  if (!focusedPane) return

  // 创建新终端面板
  const pane = await createTerminalPane({
    cwd: focusedPane.cwd || undefined,
    shell: focusedPane.shell || undefined
  })

  // 确定插入位置：水平分屏插入右侧，垂直分屏插入下方
  const position = direction === 'horizontal' ? 'right' : 'bottom'

  // 如果当前布局是单个叶子节点，需要先创建容器
  if (isLeaf(activeTab.layout)) {
    const existingPaneId = activeTab.layout.paneId
    activeTab.layout = makeContainer(direction, [
      makeLeaf(existingPaneId),
      makeLeaf(pane.id)
    ])
  } else {
    // 在聚焦面板的指定方向插入新面板
    const inserted = insertAtPosition(activeTab.layout, focusedPaneId, makeLeaf(pane.id), position)
    if (!inserted) {
      console.warn('splitPane: insertAtPosition 未找到聚焦面板', focusedPaneId, '降级为追加')
      activeTab.layout = makeContainer(direction, [activeTab.layout, makeLeaf(pane.id)])
    }
  }

  // 添加面板到 Tab
  activeTab.panes.set(pane.id, pane)

  // 重新渲染布局并聚焦新面板
  renderLayout(activeTab)
  focusPane(activeTab, pane.id)
  updatePaneCount()
  if (activeTab?.id === activeTab.id) {
    refreshTabBar()
  }
  scheduleSaveLayout()
}

/**
 * 水平分屏（左右）— 快捷键入口
 */
export async function splitHorizontal(): Promise<void> {
  await splitPane('horizontal')
}

/**
 * 垂直分屏（上下）— 快捷键入口
 */
export async function splitVertical(): Promise<void> {
  await splitPane('vertical')
}

export function focusDirection(direction: 'left' | 'right' | 'up' | 'down'): void {
  if (!activeTab) return

  const adjacent = findAdjacentPane(activeTab.layout, activeTab.focusedPaneId, direction)
  if (adjacent) {
    focusPane(activeTab, adjacent)
  }
}

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

function remapLayout(node: LayoutStateNode, oldToNewId: Map<string, string>, fallbackPaneId: string): LayoutNode {
  if (node.type === 'leaf' && node.paneId) {
    return makeLeaf(oldToNewId.get(node.paneId) || fallbackPaneId)
  }

  if (node.type === 'container' && node.direction && node.children && node.sizes) {
    return {
      type: 'container',
      direction: node.direction,
      sizes: [...node.sizes],
      children: node.children.map((child) => remapLayout(child, oldToNewId, fallbackPaneId))
    }
  }

  return makeLeaf(fallbackPaneId)
}

async function restoreTab(tabState: TabState, isActive: boolean): Promise<void> {
  const restoredPanes = new Map<string, Pane>()

  for (const paneState of tabState.panes) {
    try {
      const pane = await createTerminalPane({
        shell: paneState.shell,
        cwd: paneState.cwd !== '~' ? paneState.cwd : undefined,
        title: paneState.title || titleFromCwd(paneState.cwd !== '~' ? paneState.cwd : undefined) || tabState.title
      })
      restoredPanes.set(paneState.id, pane)
    } catch (err) {
      console.warn('面板恢复失败:', paneState.id, err)
      continue
    }
  }

  if (restoredPanes.size === 0) return

  const oldToNewId = new Map<string, string>()
  for (const [oldId, pane] of restoredPanes) {
    oldToNewId.set(oldId, pane.id)
  }

  const paneMap = new Map<string, Pane>()
  for (const pane of restoredPanes.values()) {
    paneMap.set(pane.id, pane)
  }

  const firstPane = paneMap.values().next().value as Pane
  const layout = remapLayout(tabState.layout, oldToNewId, firstPane.id)
  const focusedPaneId = oldToNewId.get(tabState.activePaneId) || firstPane.id

  const tab = createTabRecord({
    id: tabState.id,
    title: tabState.title,
    layout,
    panes: paneMap,
    focusedPaneId
  })

  mountTab(tab)
  renderLayout(tab)
  refreshTabBar()

  if (isActive) {
    switchTab(tab)
  }
}

export async function addTab(cwd?: string): Promise<void> {
  const title = nextTerminalTitle(cwd)
  const pane = await createTerminalPane(cwd ? { cwd, title } : { title })

  const tab = createTabRecord({
    id: `tab_${Date.now()}`,
    title,
    layout: makeLeaf(pane.id),
    panes: new Map([[pane.id, pane]]),
    focusedPaneId: pane.id
  })

  mountTab(tab)
  renderLayout(tab)
  refreshTabBar()
  switchTab(tab)
  scheduleSaveLayout()
}

export function switchTab(tab: Tab): void {
  if (activeTab?.id === tab.id) return

  for (const item of tabs) {
    item.containerEl.style.display = 'none'
  }

  tab.containerEl.style.display = 'block'
  setActiveTab(tab)
  refreshTabBar()

  fitAllPanes(tab)
  const focusedPane = tab.panes.get(tab.focusedPaneId)
  if (focusedPane) {
    focusedPane.terminal.focus()
  }
  updateStatusForPane(focusedPane)
  updatePaneCount()
  scheduleSaveLayout()
}

export async function closeTab(tab: Tab): Promise<void> {
  const index = tabs.indexOf(tab)
  if (index === -1) return

  if (tabs.length > 1 || tab.panes.size > 1) {
    const message = tab.panes.size > 1
      ? `确定要关闭标签”${tab.title}”吗？该标签包含 ${tab.panes.size} 个分屏面板，关闭后将全部销毁。`
      : `确定要关闭标签”${tab.title}”吗？`
    const confirmed = await showConfirm('关闭标签', message)
    if (!confirmed) return
  }

  for (const pane of tab.panes.values()) {
    await destroyPane(pane)
  }

  removeTab(tab)
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

async function closeTabSilent(tab: Tab): Promise<void> {
  for (const pane of tab.panes.values()) {
    await destroyPane(pane)
  }

  removeTab(tab)
  scheduleSaveLayout()
}

export async function movePaneToTab(
  sourceTab: Tab,
  paneId: string,
  targetTab: Tab,
  targetPaneId: string,
  position: 'left' | 'right' | 'top' | 'bottom' | 'center'
): Promise<void> {
  if (sourceTab === targetTab && paneId === targetPaneId) {
    return
  }

  if (sourceTab === targetTab && position !== 'center') {
    const pane = sourceTab.panes.get(paneId)
    if (!pane) return

    pane.title = getPaneDisplayTitle(pane, sourceTab.title)
    pane.element.remove()

    const removed = removeFromLayout(sourceTab.layout, paneId)
    if (!removed) {
      console.warn('movePaneToTab(同标签): removeFromLayout 未找到面板', paneId)
    }
    simplifyLayout(sourceTab)

    if (isLeaf(sourceTab.layout)) {
      const existingPaneId = sourceTab.layout.paneId
      const direction = position === 'left' || position === 'right' ? 'horizontal' : 'vertical'
      sourceTab.layout = makeContainer(direction, [
        position === 'left' || position === 'top' ? makeLeaf(paneId) : makeLeaf(existingPaneId),
        position === 'left' || position === 'top' ? makeLeaf(existingPaneId) : makeLeaf(paneId)
      ])
    } else {
      const inserted = insertAtPosition(sourceTab.layout, targetPaneId, makeLeaf(paneId), position)
      if (!inserted) {
        console.warn('movePaneToTab(同标签): insertAtPosition 未找到目标', targetPaneId, '降级为追加')
        sourceTab.layout = makeContainer(
          position === 'left' || position === 'right' ? 'horizontal' : 'vertical',
          [sourceTab.layout, makeLeaf(paneId)]
        )
      }
    }

    renderLayout(sourceTab)
    focusPane(sourceTab, paneId)
    scheduleSaveLayout()
    return
  }

  const pane = sourceTab.panes.get(paneId)
  if (!pane) return

  pane.title = getPaneDisplayTitle(pane, sourceTab.title)
  pane.element.remove()

  // 先从布局树中移除，再从 Map 中删除，确保两者始终一致
  // 根节点叶子的情况：removeFromLayout 无法处理，但该 pane 是最后一个，由 closeTabSilent 清理
  const isRootLeaf = isLeaf(sourceTab.layout) && sourceTab.layout.paneId === paneId
  if (!isRootLeaf) {
    const removed = removeFromLayout(sourceTab.layout, paneId)
    if (!removed) {
      // 布局树中找不到该 paneId（状态已不一致），跳过后续清理避免恶化
      console.warn('movePaneToTab: removeFromLayout 未找到面板', paneId)
    }
    simplifyLayout(sourceTab)
  }

  sourceTab.panes.delete(paneId)

  if (sourceTab.panes.size === 0) {
    await closeTabSilent(sourceTab)
  } else {
    if (sourceTab.focusedPaneId === paneId) {
      const leafIds = collectLeafIds(sourceTab.layout)
      if (leafIds.length > 0) {
        sourceTab.focusedPaneId = leafIds[0]
      }
    }

    renderLayout(sourceTab)

    if (activeTab?.id === sourceTab.id) {
      const nextFocusedPane = sourceTab.panes.get(sourceTab.focusedPaneId)
      if (nextFocusedPane) {
        focusPane(sourceTab, nextFocusedPane.id)
      }
      updatePaneCount()
      refreshTabBar()
    }
  }

  targetTab.panes.set(paneId, pane)

  if (isLeaf(targetTab.layout) && targetTab.layout.paneId === targetPaneId) {
    const direction = position === 'left' || position === 'right' ? 'horizontal' : 'vertical'
    targetTab.layout = makeContainer(direction, [
      position === 'left' || position === 'top' ? makeLeaf(paneId) : makeLeaf(targetPaneId),
      position === 'left' || position === 'top' ? makeLeaf(targetPaneId) : makeLeaf(paneId)
    ])
  } else if (position === 'center') {
    targetTab.layout = makeContainer('vertical', [targetTab.layout, makeLeaf(paneId)])
  } else {
    const inserted = insertAtPosition(targetTab.layout, targetPaneId, makeLeaf(paneId), position)
    if (!inserted) {
      // 目标 paneId 在布局树中未找到，降级为追加到根容器
      console.warn('movePaneToTab: insertAtPosition 未找到目标', targetPaneId, '降级为追加')
      targetTab.layout = makeContainer(
        position === 'left' || position === 'right' ? 'horizontal' : 'vertical',
        [targetTab.layout, makeLeaf(paneId)]
      )
    }
  }

  renderLayout(targetTab)
  focusPane(targetTab, paneId)
  switchTab(targetTab)
  scheduleSaveLayout()
}

export async function movePaneToNewTab(sourceTab: Tab, paneId: string, beforeTab?: Tab | null): Promise<void> {
  if (sourceTab.panes.size <= 1) return

  const pane = sourceTab.panes.get(paneId)
  if (!pane) return

  pane.element.remove()

  const removed = removeFromLayout(sourceTab.layout, paneId)
  if (!removed) {
    console.warn('movePaneToNewTab: removeFromLayout 未找到面板', paneId)
  }
  sourceTab.panes.delete(paneId)
  if (removed) {
    simplifyLayout(sourceTab)
  }

  if (sourceTab.focusedPaneId === paneId) {
    const leafIds = collectLeafIds(sourceTab.layout)
    if (leafIds.length > 0) {
      sourceTab.focusedPaneId = leafIds[0]
    }
  }

  renderLayout(sourceTab)
  if (activeTab?.id === sourceTab.id) {
    const focusedPane = sourceTab.panes.get(sourceTab.focusedPaneId)
    if (focusedPane) {
      focusPane(sourceTab, focusedPane.id)
    }
    updatePaneCount()
    refreshTabBar()
  }

  const title = getPaneDisplayTitle(pane, sourceTab.title)
  pane.title = title

  const tab = createTabRecord({
    id: `tab_${Date.now()}`,
    title,
    layout: makeLeaf(pane.id),
    panes: new Map([[pane.id, pane]]),
    focusedPaneId: pane.id
  })

  mountTab(tab, beforeTab)
  renderLayout(tab)
  refreshTabBar()
  switchTab(tab)
  scheduleSaveLayout()
}
