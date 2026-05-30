import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

// ── 布局树类型 ──

type LayoutNode = ContainerNode | LeafNode

interface ContainerNode {
  type: 'container'
  direction: 'horizontal' | 'vertical'
  children: LayoutNode[]
  sizes: number[]
}

interface LeafNode {
  type: 'leaf'
  paneId: string
}

// ── 序列化类型 ──

interface LayoutStateNode {
  type: 'container' | 'leaf'
  direction?: 'horizontal' | 'vertical'
  children?: LayoutStateNode[]
  sizes?: number[]
  paneId?: string
}

interface PaneState {
  id: string
  shell: string
  cwd: string
}

interface TabState {
  id: string
  title: string
  activePaneId: string
  layout: LayoutStateNode
  panes: PaneState[]
}

interface LayoutState {
  version: string
  tabs: TabState[]
  activeTabId: string
  windowState?: {
    sidebarWidth: number
  }
}

// ── 配置类型 ──

interface Config {
  general: {
    defaultShell: string
    defaultCwd: string
    fontSize: number
    theme: 'dark' | 'light'
    scrollback: number
  }
}

// ── Pane 类型 ──

interface Pane {
  id: string
  sessionId: string
  shell: string
  cwd: string
  terminal: Terminal
  fitAddon: FitAddon
  element: HTMLElement
  cleanupData: () => void
  cleanupExit: () => void
  cleanupError: () => void
}

// ── Tab 类型 ──

interface Tab {
  id: string
  title: string
  layout: LayoutNode
  panes: Map<string, Pane>
  focusedPaneId: string
  containerEl: HTMLElement
  tabEl: HTMLElement
}

// ── 项目类型 ──

interface Project {
  id: string
  name: string
  path: string
}

// ── DOM ──

const tabBar = document.getElementById('tab-bar')!
const tabAddBtn = document.getElementById('tab-add')!
const terminalContainer = document.getElementById('terminal-container')!
const statusShell = document.getElementById('status-shell')!
const statusCwd = document.getElementById('status-cwd')!
const loading = document.getElementById('loading')!
const projectList = document.getElementById('project-list')!
const btnAddProject = document.getElementById('btn-add-project')!
const sidebar = document.getElementById('sidebar')!

// 设置对话框 DOM
const settingsOverlay = document.getElementById('settings-overlay')!
const settingsClose = document.getElementById('settings-close')!
const settingsCancel = document.getElementById('settings-cancel')!
const settingsSave = document.getElementById('settings-save')!
const settingShell = document.getElementById('setting-shell') as HTMLInputElement
const settingCwd = document.getElementById('setting-cwd') as HTMLInputElement
const settingFontSize = document.getElementById('setting-font-size') as HTMLInputElement
const settingScrollback = document.getElementById('setting-scrollback') as HTMLInputElement
const settingTheme = document.getElementById('setting-theme') as HTMLSelectElement

// 确认对话框 DOM
const confirmOverlay = document.getElementById('confirm-overlay')!
const confirmTitle = document.getElementById('confirm-title')!
const confirmBody = document.getElementById('confirm-body')!
const confirmOk = document.getElementById('confirm-ok')!
const confirmCancel = document.getElementById('confirm-cancel')!

// 通知 DOM
const notification = document.getElementById('notification')!

// ── 全局状态 ──

const tabs: Tab[] = []
let activeTab: Tab | null = null
let tabIndex = 0
let paneCounter = 0
let projects: Project[] = []
let appConfig: Config = {
  general: {
    defaultShell: 'powershell.exe',
    defaultCwd: '',
    fontSize: 14,
    theme: 'dark',
    scrollback: 10000
  }
}

let sidebarWidth = 220

// ── 主题定义 ──

const THEMES = {
  dark: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    selectionBackground: '#264f78'
  },
  light: {
    background: '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    selectionBackground: '#add6ff'
  }
}

// ── 通知系统 ──

let notificationTimer: ReturnType<typeof setTimeout> | null = null

function showNotification(message: string, type: 'info' | 'error' | 'warning' | 'success' = 'info', duration = 3000): void {
  if (notificationTimer) {
    clearTimeout(notificationTimer)
    notificationTimer = null
  }

  notification.textContent = message
  notification.className = type
  notification.classList.add('visible')

  if (duration > 0) {
    notificationTimer = setTimeout(() => {
      notification.classList.remove('visible')
      notificationTimer = null
    }, duration)
  }
}

// ── 确认对话框 ──

let confirmResolve: ((value: boolean) => void) | null = null

function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmTitle.textContent = title
    confirmBody.textContent = message
    confirmOverlay.classList.add('visible')
    confirmResolve = resolve
  })
}

function handleConfirmOk(): void {
  confirmOverlay.classList.remove('visible')
  if (confirmResolve) {
    confirmResolve(true)
    confirmResolve = null
  }
}

function handleConfirmCancel(): void {
  confirmOverlay.classList.remove('visible')
  if (confirmResolve) {
    confirmResolve(false)
    confirmResolve = null
  }
}

confirmOk.addEventListener('click', handleConfirmOk)
confirmCancel.addEventListener('click', handleConfirmCancel)
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) handleConfirmCancel()
})

// ── 工具函数 ──

function makeLeaf(paneId: string): LeafNode {
  return { type: 'leaf', paneId }
}

function makeContainer(direction: 'horizontal' | 'vertical', children: LayoutNode[]): ContainerNode {
  const size = Math.floor(100 / children.length)
  const sizes = children.map((_, i) =>
    i === children.length - 1 ? 100 - size * (children.length - 1) : size
  )
  return { type: 'container', direction, children, sizes }
}

function isLeaf(node: LayoutNode): node is LeafNode {
  return node.type === 'leaf'
}

function isContainer(node: LayoutNode): node is ContainerNode {
  return node.type === 'container'
}

function findParentAndIndex(
  root: LayoutNode,
  paneId: string
): { parent: ContainerNode; index: number } | null {
  if (isContainer(root)) {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i]
      if (isLeaf(child) && child.paneId === paneId) {
        return { parent: root, index: i }
      }
      const found = findParentAndIndex(child, paneId)
      if (found) return found
    }
  }
  return null
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ── 创建 PTY + xterm ──

async function createTerminalPane(options?: { shell?: string; cwd?: string }): Promise<Pane> {
  const id = `pane_${++paneCounter}`

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
  const actualCwd = result.cwd || cwd || ''

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

async function destroyPane(pane: Pane): Promise<void> {
  pane.cleanupData()
  pane.cleanupExit()
  pane.cleanupError()
  pane.terminal.dispose()
  if (pane.sessionId) {
    await window.terminalAPI.closeTerminal(pane.sessionId)
  }
}

// ── 布局树渲染 ──

function renderLayout(tab: Tab): void {
  tab.containerEl.innerHTML = ''
  renderNode(tab.layout, tab.containerEl, tab)
  fitAllPanes(tab)
}

function renderNode(node: LayoutNode, container: HTMLElement, tab: Tab): void {
  if (isLeaf(node)) {
    const pane = tab.panes.get(node.paneId)
    if (pane) {
      container.appendChild(pane.element)
      pane.element.classList.toggle('focused', node.paneId === tab.focusedPaneId)
    }
    return
  }

  const wrapper = document.createElement('div')
  wrapper.className = 'layout-container'
  wrapper.style.display = 'flex'
  wrapper.style.flexDirection = node.direction === 'horizontal' ? 'row' : 'column'
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    const childContainer = document.createElement('div')
    childContainer.className = 'layout-child'
    childContainer.style.flex = `${node.sizes[i]}`
    childContainer.style.minWidth = '60px'
    childContainer.style.minHeight = '30px'
    childContainer.style.position = 'relative'
    childContainer.style.overflow = 'hidden'

    renderNode(child, childContainer, tab)
    wrapper.appendChild(childContainer)

    if (i < node.children.length - 1) {
      const splitter = createSplitter(node, i)
      wrapper.appendChild(splitter)
    }
  }

  container.appendChild(wrapper)
}

function createSplitter(container: ContainerNode, index: number): HTMLElement {
  const splitter = document.createElement('div')
  splitter.className = 'pane-splitter'
  const isH = container.direction === 'horizontal'
  splitter.style.flexBasis = '4px'
  splitter.style.flexShrink = '0'
  splitter.style.background = 'transparent'
  splitter.style.cursor = isH ? 'col-resize' : 'row-resize'
  splitter.style.position = 'relative'
  splitter.style.zIndex = '10'

  splitter.addEventListener('mouseenter', () => {
    splitter.style.background = '#007acc'
  })
  splitter.addEventListener('mouseleave', () => {
    splitter.style.background = 'transparent'
  })

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault()
    startResize(e, container, index, isH)
  })

  return splitter
}

function startResize(
  e: MouseEvent,
  container: ContainerNode,
  leftIndex: number,
  isHorizontal: boolean
): void {
  const target = e.target as HTMLElement
  const parent = target.parentElement!
  const children = Array.from(parent.children).filter(
    (el) => !el.classList.contains('pane-splitter')
  )

  const leftEl = children[leftIndex] as HTMLElement
  const rightEl = children[leftIndex + 1] as HTMLElement
  if (!leftEl || !rightEl) return

  const startPos = isHorizontal ? e.clientX : e.clientY
  const leftStart = isHorizontal ? leftEl.offsetWidth : leftEl.offsetHeight
  const rightStart = isHorizontal ? rightEl.offsetWidth : rightEl.offsetHeight
  const total = leftStart + rightStart

  const onMouseMove = (ev: MouseEvent): void => {
    const delta = (isHorizontal ? ev.clientX : ev.clientY) - startPos
    const newLeft = Math.max(60, Math.min(total - 60, leftStart + delta))
    const newRight = total - newLeft
    const leftPercent = (newLeft / total) * 100
    const rightPercent = (newRight / total) * 100

    container.sizes[leftIndex] = leftPercent
    container.sizes[leftIndex + 1] = rightPercent

    leftEl.style.flex = `${leftPercent}`
    rightEl.style.flex = `${rightPercent}`
  }

  const onMouseUp = (): void => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    if (activeTab) fitAllPanes(activeTab)
    scheduleSaveLayout()
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function fitAllPanes(tab: Tab): void {
  for (const pane of tab.panes.values()) {
    pane.fitAddon.fit()
  }
}

// ── 焦点管理 ──

function focusPane(tab: Tab, paneId: string): void {
  const old = tab.panes.get(tab.focusedPaneId)
  if (old) old.element.classList.remove('focused')

  tab.focusedPaneId = paneId
  const pane = tab.panes.get(paneId)
  if (pane) {
    pane.element.classList.add('focused')
    pane.terminal.focus()
  }

  statusShell.textContent = appConfig.general.defaultShell || 'PowerShell'
  statusCwd.textContent = appConfig.general.defaultCwd || '~'
}

function findAdjacentPane(
  root: LayoutNode,
  currentPaneId: string,
  direction: 'left' | 'right' | 'up' | 'down'
): string | null {
  const path: { node: LayoutNode; parent?: ContainerNode; indexInParent?: number }[] = []

  function find(node: LayoutNode, parent?: ContainerNode, idx?: number): boolean {
    if (isLeaf(node)) {
      if (node.paneId === currentPaneId) {
        path.push({ node, parent, indexInParent: idx })
        return true
      }
      return false
    }
    path.push({ node, parent, indexInParent: idx })
    for (let i = 0; i < node.children.length; i++) {
      if (find(node.children[i], node, i)) return true
    }
    path.pop()
    return false
  }

  find(root)

  for (let i = path.length - 1; i >= 0; i--) {
    const entry = path[i]
    if (!entry.parent || entry.indexInParent === undefined) continue

    const container = entry.parent
    const childIndex = entry.indexInParent

    const isHorizontalDir = direction === 'left' || direction === 'right'
    const isHorizontalSplit = container.direction === 'horizontal'

    if (isHorizontalDir === isHorizontalSplit) {
      const targetIndex = (direction === 'left' || direction === 'up')
        ? childIndex - 1
        : childIndex + 1

      if (targetIndex >= 0 && targetIndex < container.children.length) {
        return findDeepestLeaf(container.children[targetIndex], direction)
      }
    }
  }

  return null
}

function findDeepestLeaf(node: LayoutNode, direction: string): string {
  if (isLeaf(node)) return node.paneId
  const idx = (direction === 'left' || direction === 'up')
    ? node.children.length - 1
    : 0
  return findDeepestLeaf(node.children[idx], direction)
}

// ── 分屏操作 ──

async function splitPane(direction: 'horizontal' | 'vertical'): Promise<void> {
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
  scheduleSaveLayout()
}

// ── 关闭 Pane（带确认）──

async function closePane(tab: Tab, paneId: string): Promise<void> {
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
  scheduleSaveLayout()
}

function removeFromLayout(node: LayoutNode, paneId: string): void {
  if (isContainer(node)) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      if (isLeaf(child) && child.paneId === paneId) {
        node.children.splice(i, 1)
        node.sizes.splice(i, 1)
        if (node.children.length > 0) {
          const count = node.children.length
          const size = Math.floor(100 / count)
          node.sizes = node.children.map((_, j) =>
            j === count - 1 ? 100 - size * (count - 1) : size
          )
        }
        return
      }
      if (isContainer(child)) {
        removeFromLayout(child, paneId)
        if (child.children.length === 1) {
          node.children[i] = child.children[0]
        }
      }
    }
  }
}

function simplifyLayout(tab: Tab): void {
  if (isContainer(tab.layout) && tab.layout.children.length === 1) {
    tab.layout = tab.layout.children[0]
  }
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

// ── 布局持久化（带防抖）──

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSaveLayout(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const state = serializeCurrentState()
    window.terminalAPI.saveLayout(state)
  }, 500)
}

// ── 恢复布局 ──

async function restoreLayout(): Promise<boolean> {
  const state = await window.terminalAPI.loadLayout()
  if (!state || !state.tabs || state.tabs.length === 0) {
    return false
  }

  // 恢复窗口状态
  if (state.windowState) {
    sidebarWidth = state.windowState.sidebarWidth || 220
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
  const paneEntries = Array.from(paneMap.entries())
  for (let i = 0; i < tabState.panes.length && i < paneEntries.length; i++) {
    oldToNewId.set(tabState.panes[i].id, paneEntries[i][1].id)
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
    return makeLeaf(paneEntries[0][1].id)
  }

  const layout = remapLayout(tabState.layout)
  const firstPane = paneEntries[0][1]
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

async function addTab(cwd?: string): Promise<void> {
  const pane = await createTerminalPane(cwd ? { cwd } : undefined)
  const title = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() || `终端 ${++tabIndex}` : `终端 ${++tabIndex}`
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
  tabEl.innerHTML = `<span class="tab-title">${title}</span><span class="tab-close">×</span>`
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

function switchTab(tab: Tab): void {
  if (activeTab?.id === tab.id) return

  for (const t of tabs) {
    t.containerEl.style.display = 'none'
    t.tabEl.classList.remove('active')
  }

  tab.containerEl.style.display = 'block'
  tab.tabEl.classList.add('active')
  activeTab = tab

  fitAllPanes(tab)

  const focused = tab.panes.get(tab.focusedPaneId)
  if (focused) focused.terminal.focus()

  statusShell.textContent = appConfig.general.defaultShell || 'PowerShell'
  statusCwd.textContent = appConfig.general.defaultCwd || '~'
  scheduleSaveLayout()
}

async function closeTab(tab: Tab): Promise<void> {
  const index = tabs.indexOf(tab)
  if (index === -1) return

  // 如果有多个标签，显示确认对话框
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
    activeTab = null
    if (tabs.length > 0) {
      switchTab(tabs[Math.min(index, tabs.length - 1)])
    }
  }

  if (tabs.length === 0) {
    await addTab()
  }

  scheduleSaveLayout()
}

function switchToNextTab(): void {
  if (tabs.length <= 1) return
  const index = activeTab ? tabs.indexOf(activeTab) : -1
  switchTab(tabs[(index + 1) % tabs.length])
}

function switchToPrevTab(): void {
  if (tabs.length <= 1) return
  const index = activeTab ? tabs.indexOf(activeTab) : 0
  switchTab(tabs[(index - 1 + tabs.length) % tabs.length])
}

async function closeCurrentPane(): Promise<void> {
  if (!activeTab) return
  await closePane(activeTab, activeTab.focusedPaneId)
}

function focusDirection(direction: 'left' | 'right' | 'up' | 'down'): void {
  if (!activeTab) return
  const adjacent = findAdjacentPane(activeTab.layout, activeTab.focusedPaneId, direction)
  if (adjacent) focusPane(activeTab, adjacent)
}

// ── 设置管理 ──

async function loadConfig(): Promise<void> {
  appConfig = await window.terminalAPI.loadConfig()
}

function openSettings(): void {
  settingShell.value = appConfig.general.defaultShell
  settingCwd.value = appConfig.general.defaultCwd
  settingFontSize.value = String(appConfig.general.fontSize)
  settingScrollback.value = String(appConfig.general.scrollback)
  settingTheme.value = appConfig.general.theme
  settingsOverlay.classList.add('visible')
}

function closeSettings(): void {
  settingsOverlay.classList.remove('visible')
}

async function saveSettings(): Promise<void> {
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
    appConfig = newConfig
    closeSettings()
    showNotification('设置已保存，重启后生效', 'success')
  }
}

// ── 项目管理（带目录校验）──

async function loadProjects(): Promise<void> {
  projects = await window.terminalAPI.listProjects()
  renderProjectList()
}

function renderProjectList(): void {
  projectList.innerHTML = ''

  if (projects.length === 0) {
    const empty = document.createElement('div')
    empty.id = 'sidebar-empty'
    empty.textContent = '暂无项目，点击上方 ＋ 添加'
    projectList.appendChild(empty)
    return
  }

  for (const project of projects) {
    const item = document.createElement('div')
    item.className = 'project-item'

    item.innerHTML = `
      <span class="project-icon">📁</span>
      <span class="project-name">${escapeHtml(project.name)}</span>
      <span class="project-actions">
        <button class="project-action-btn" data-action="open" title="在新标签中打开">▶</button>
        <button class="project-action-btn" data-action="split-h" title="水平分屏打开">⫼</button>
        <button class="project-action-btn" data-action="split-v" title="垂直分屏打开">⫟</button>
        <button class="project-action-btn danger" data-action="remove" title="移除项目">✕</button>
      </span>
    `

    item.querySelector('.project-name')!.addEventListener('click', () => {
      addTab(project.path)
    })

    item.querySelectorAll('.project-action-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const action = (btn as HTMLElement).dataset.action
        if (action === 'open') {
          addTab(project.path)
        } else if (action === 'split-h') {
          await openProjectInSplit(project.path, 'horizontal')
        } else if (action === 'split-v') {
          await openProjectInSplit(project.path, 'vertical')
        } else if (action === 'remove') {
          const confirmed = await showConfirm('移除项目', `确定要移除项目"${project.name}"吗？`)
          if (confirmed) {
            await removeProject(project.id)
          }
        }
      })
    })

    projectList.appendChild(item)
  }
}

async function openProjectInSplit(projectPath: string, direction: 'horizontal' | 'vertical'): Promise<void> {
  if (!activeTab) {
    await addTab(projectPath)
    return
  }

  const tab = activeTab
  const currentPaneId = tab.focusedPaneId

  const newPane = await createTerminalPane({ cwd: projectPath })
  tab.panes.set(newPane.id, newPane)

  const found = findParentAndIndex(tab.layout, currentPaneId)

  if (!found) {
    tab.layout = makeContainer(direction, [
      makeLeaf(currentPaneId),
      makeLeaf(newPane.id)
    ])
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
      parent.children[index] = makeContainer(direction, [
        makeLeaf(currentPaneId),
        makeLeaf(newPane.id)
      ])
    }
  }

  renderLayout(tab)
  focusPane(tab, newPane.id)
  scheduleSaveLayout()
}

async function addProject(): Promise<void> {
  const result = await window.terminalAPI.addProject()
  if (result.success) {
    await loadProjects()
    showNotification('项目已添加', 'success')
  } else if (result.error && result.error !== '已取消') {
    showNotification('添加项目失败：' + result.error, 'error')
  }
}

async function removeProject(projectId: string): Promise<void> {
  const result = await window.terminalAPI.removeProject(projectId)
  if (result.success) {
    await loadProjects()
    showNotification('项目已移除', 'success')
  }
}

// ── 侧边栏宽度持久化 ──

function initSidebarResize(): void {
  // 简单实现：鼠标拖拽侧边栏右边框调整宽度
  let isResizing = false
  let startX = 0
  let startWidth = 0

  sidebar.addEventListener('mousedown', (e) => {
    // 只在右边框 4px 范围内触发
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
    sidebarWidth = newWidth
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

// 设置对话框
settingsClose.addEventListener('click', closeSettings)
settingsCancel.addEventListener('click', closeSettings)
settingsSave.addEventListener('click', saveSettings)
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings()
})

// 监听主进程菜单事件
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

// 快捷键
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
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
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
