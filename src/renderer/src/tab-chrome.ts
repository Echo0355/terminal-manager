import type { Pane, Tab } from './types'

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
  paneTab.title = 'Drag to move this split pane'

  const titleEl = document.createElement('span')
  titleEl.className = 'pane-tab-title'
  titleEl.textContent = options.title
  paneTab.appendChild(titleEl)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'pane-close-btn'
  closeBtn.type = 'button'
  closeBtn.textContent = '×'
  closeBtn.title = 'Close pane'
  closeBtn.setAttribute('draggable', 'false')

  strip.appendChild(paneTab)
  strip.appendChild(closeBtn)
  return strip
}

function createWorkspaceClose(): HTMLSpanElement {
  const closeEl = document.createElement('span')
  closeEl.className = 'tab-close'
  closeEl.textContent = '×'
  closeEl.title = 'Close tab'
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
