import type { Pane, Tab } from '../types/renderer.types'

export type ExternalEditor = 'vscode' | 'idea' | 'pycharm'

const CLAUDE_ICON_URL = new URL('../assets/claude.svg', import.meta.url).href

/**
 * 创建 Claude 运行按钮
 *
 * 浮动在终端面板右上角，点击后在当前终端执行 `claude` 命令。
 */
export function createClaudeButton(paneId: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'pane-tool-btn claude-run-btn'
  btn.type = 'button'
  btn.title = '运行 Claude'
  btn.setAttribute('data-pane-id', paneId)
  btn.setAttribute('draggable', 'false')

  const img = document.createElement('img')
  img.src = CLAUDE_ICON_URL
  img.alt = 'Claude'
  img.draggable = false
  btn.appendChild(img)

  return btn
}

/**
 * 创建外部 IDE 菜单按钮
 *
 * @param paneId - 面板 ID
 * @returns IDE 菜单按钮
 */
export function createEditorOpenMenuButton(paneId: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'pane-tool-btn editor-open-menu-btn'
  btn.type = 'button'
  btn.title = '在外部 IDE 中打开'
  btn.textContent = 'IDE'
  btn.setAttribute('data-pane-id', paneId)
  btn.setAttribute('draggable', 'false')
  return btn
}

/**
 * 创建面板操作按钮列表
 *
 * @param paneId - 面板 ID
 * @returns Claude 和外部 IDE 操作按钮
 */
export function createPaneActionButtons(paneId: string): HTMLButtonElement[] {
  return [createClaudeButton(paneId), createEditorOpenMenuButton(paneId)]
}

/**
 * 创建单面板悬浮操作栏
 *
 * @param paneId - 面板 ID
 * @returns 悬浮操作栏元素
 */
export function createFloatingPaneActions(paneId: string): HTMLDivElement {
  const actions = document.createElement('div')
  actions.className = 'pane-floating-actions'
  actions.setAttribute('data-pane-id', paneId)
  actions.append(...createPaneActionButtons(paneId))
  return actions
}

export function titleFromCwd(cwd?: string): string | null {
  if (!cwd) return null
  return cwd.split(/[/\\]/).filter(Boolean).pop() || null
}

export function getPaneDisplayTitle(pane: Pane, fallback: string): string {
  return pane.title || titleFromCwd(pane.cwd) || fallback
}

interface PaneTabStripOptions {
  active?: boolean
  paneId: string
  tabId: string
  title: string
}

export function createPaneTabStrip(options: PaneTabStripOptions): HTMLDivElement {
  const strip = document.createElement('div')
  strip.className = 'pane-tab-strip'
  strip.setAttribute('data-pane-id', options.paneId)
  strip.setAttribute('data-tab-id', options.tabId)

  const paneTab = document.createElement('div')
  paneTab.className = 'pane-tab'
  if (options.active) {
    paneTab.classList.add('active-pane-tab')
  }
  paneTab.setAttribute('draggable', 'true')
  paneTab.setAttribute('data-pane-id', options.paneId)
  paneTab.setAttribute('data-tab-id', options.tabId)
  paneTab.title = '拖拽移动此分屏面板'

  const titleEl = document.createElement('span')
  titleEl.className = 'pane-tab-title'
  titleEl.textContent = options.title
  paneTab.appendChild(titleEl)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'pane-close-btn'
  closeBtn.type = 'button'
  closeBtn.textContent = '×'
  closeBtn.title = '关闭面板'
  closeBtn.setAttribute('draggable', 'false')

  const actions = document.createElement('div')
  actions.className = 'pane-actions'
  actions.append(...createPaneActionButtons(options.paneId))
  actions.appendChild(closeBtn)

  strip.appendChild(paneTab)
  strip.appendChild(actions)
  return strip
}

function createWorkspaceClose(): HTMLSpanElement {
  const closeEl = document.createElement('span')
  closeEl.className = 'tab-close'
  closeEl.textContent = '×'
  closeEl.title = '关闭标签'
  return closeEl
}

function renderRegularTab(tabEl: HTMLElement, tab: Tab, isActive: boolean): void {
  let cls = isActive ? 'tab active' : 'tab'
  if (tab.panes.size > 1) cls += ' has-splits'
  tabEl.className = cls
  tabEl.setAttribute('data-tab-id', tab.id)
  tabEl.setAttribute('draggable', 'true')
  tabEl.replaceChildren()

  const titleEl = document.createElement('span')
  titleEl.className = 'tab-title'
  titleEl.textContent = tab.title

  const children: Node[] = [titleEl]
  // 分屏时在标题后显示面板数量角标
  if (tab.panes.size > 1) {
    const badge = document.createElement('span')
    badge.className = 'tab-split-badge'
    badge.textContent = String(tab.panes.size)
    children.push(badge)
  }
  children.push(createWorkspaceClose())
  tabEl.append(...children)
}

export function renderWorkspaceTab(tab: Tab, isActive: boolean): void {
  // 始终渲染普通标签，分屏面板标签由 layout-render.ts 在终端区域内渲染
  renderRegularTab(tab.tabEl, tab, isActive)
}
