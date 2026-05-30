import type { LayoutNode, Pane, Tab } from './types'
import { isLeaf } from './layout-ops'

export interface TopBarEntry {
  paneId: string
  flex: number
}

export function titleFromCwd(cwd?: string): string | null {
  if (!cwd) return null
  return cwd.split(/[/\\]/).filter(Boolean).pop() || null
}

export function getPaneDisplayTitle(pane: Pane, fallback: string): string {
  return pane.title || titleFromCwd(pane.cwd) || fallback
}

export function collectTopBarEntries(node: LayoutNode, flex = 1): TopBarEntry[] {
  if (isLeaf(node)) {
    return [{ paneId: node.paneId, flex }]
  }

  if (node.direction === 'horizontal') {
    return node.children.flatMap((child, index) =>
      collectTopBarEntries(child, flex * ((node.sizes[index] ?? 0) / 100))
    )
  }

  const firstChild = node.children[0]
  if (!firstChild) return []

  return collectTopBarEntries(firstChild, flex)
}

interface PaneTabStripOptions {
  active?: boolean
  inline?: boolean
  paneId: string
  tabId: string
  title: string
}

export function createPaneTabStrip(options: PaneTabStripOptions): HTMLDivElement {
  const strip = document.createElement('div')
  strip.className = options.inline ? 'pane-tab-strip pane-tab-strip-inline' : 'pane-tab-strip'
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
  tabEl.className = isActive ? 'tab active' : 'tab'
  tabEl.setAttribute('data-tab-id', tab.id)
  tabEl.setAttribute('draggable', 'true')
  tabEl.replaceChildren()

  const titleEl = document.createElement('span')
  titleEl.className = 'tab-title'
  titleEl.textContent = tab.title

  tabEl.append(titleEl, createWorkspaceClose())
}

function renderSplitHostTab(tabEl: HTMLElement, tab: Tab): void {
  tabEl.className = 'tab active tab-group-host'
  tabEl.setAttribute('data-tab-id', tab.id)
  tabEl.setAttribute('draggable', 'false')
  tabEl.replaceChildren()

  const track = document.createElement('div')
  track.className = 'tab-group-track'

  for (const entry of collectTopBarEntries(tab.layout)) {
    const pane = tab.panes.get(entry.paneId)
    if (!pane) continue

    const segment = document.createElement('div')
    segment.className = 'tab-group-segment'
    segment.style.flex = `${Math.max(entry.flex, 0.0001)} 1 0`
    segment.setAttribute('data-tab-id', tab.id)
    segment.setAttribute('data-pane-id', entry.paneId)

    segment.appendChild(createPaneTabStrip({
      active: entry.paneId === tab.focusedPaneId,
      inline: true,
      paneId: entry.paneId,
      tabId: tab.id,
      title: getPaneDisplayTitle(pane, tab.title)
    }))

    track.appendChild(segment)
  }

  tabEl.appendChild(track)
}

export function renderWorkspaceTab(tab: Tab, isActive: boolean): void {
  const shouldRenderSplitHost = isActive && !isLeaf(tab.layout)
  if (shouldRenderSplitHost) {
    renderSplitHostTab(tab.tabEl, tab)
    return
  }

  renderRegularTab(tab.tabEl, tab, isActive)
}
