import type { Tab } from './types'
import { tabBar, tabs, terminalContainer } from './state'
import { movePaneToTab, movePaneToNewTab } from './tab-pane-manager'

type DropZone = 'top' | 'bottom' | 'left' | 'right' | 'center'

let dragSourceTab: Tab | null = null
let dragSourcePaneId: string | null = null
let dragSourcePaneTab: Tab | null = null

let activePane: HTMLElement | null = null
let activeZone: DropZone | null = null
let overlayEl: HTMLElement | null = null

interface DraggedPaneSource {
  tab: Tab
  paneId: string
}

function getDraggedPaneSource(): DraggedPaneSource | null {
  if (dragSourcePaneId && dragSourcePaneTab) {
    return { tab: dragSourcePaneTab, paneId: dragSourcePaneId }
  }

  if (dragSourceTab) {
    return { tab: dragSourceTab, paneId: dragSourceTab.focusedPaneId }
  }

  return null
}

/**
 * 检测拖拽放置区域 — 对标 VS Code 的 drop zone 检测
 *
 * VS Code 使用更宽松的中心区域（约 35%），边缘区域更窄。
 * 当鼠标在面板中心 35% 范围内时判定为 center（替换整个面板），
 * 否则根据最近的边缘判定方向。
 */
function detectZone(rect: DOMRect, x: number, y: number): DropZone {
  const topRatio = (y - rect.top) / rect.height
  const bottomRatio = (rect.bottom - y) / rect.height
  const leftRatio = (x - rect.left) / rect.width
  const rightRatio = (rect.right - x) / rect.width
  const minDist = Math.min(topRatio, bottomRatio, leftRatio, rightRatio)

  // 中心区域阈值：35% — 与 VS Code 的菱形指示器匹配
  if (minDist > 0.35) return 'center'
  if (topRatio === minDist) return 'top'
  if (bottomRatio === minDist) return 'bottom'
  if (leftRatio === minDist) return 'left'
  return 'right'
}

function findPaneAtPoint(x: number, y: number): HTMLElement | null {
  const elements = document.elementsFromPoint(x, y)
  for (const element of elements) {
    const pane = (element as HTMLElement).closest('.pane-frame')
    if (pane) return pane as HTMLElement
  }
  return null
}

function createOverlay(): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'drop-zone-overlay'

  for (const zone of ['top', 'bottom', 'left', 'right', 'center'] as const) {
    const indicator = document.createElement('div')
    indicator.className = 'drop-zone-indicator'
    indicator.setAttribute('data-zone', zone)
    overlay.appendChild(indicator)
  }

  return overlay
}

function updateOverlay(pane: HTMLElement, zone: DropZone): void {
  if (!overlayEl) {
    overlayEl = createOverlay()
  }

  if (pane !== activePane) {
    overlayEl.parentElement?.removeChild(overlayEl)
    pane.appendChild(overlayEl)
    activePane = pane
  }

  if (zone !== activeZone) {
    overlayEl.querySelectorAll('.drop-zone-indicator').forEach((element) => {
      element.classList.toggle('active', element.getAttribute('data-zone') === zone)
    })
    activeZone = zone
  }
}

function hideOverlay(): void {
  overlayEl?.parentElement?.removeChild(overlayEl)
  activePane = null
  activeZone = null
}

function resetDragState(): void {
  dragSourceTab = null
  dragSourcePaneId = null
  dragSourcePaneTab = null
  activePane = null
  activeZone = null
  tabBar.classList.remove('drag-over')
}

function handlePaneDragStart(event: DragEvent): void {
  const paneTabEl = (event.target as HTMLElement).closest('.pane-tab') as HTMLElement | null
  if (!paneTabEl) return

  const paneFrameEl = paneTabEl.closest('.pane-frame, .tab-group-segment') as HTMLElement | null
  const paneId = paneTabEl.getAttribute('data-pane-id') || paneFrameEl?.getAttribute('data-pane-id')
  const tabId = paneTabEl.getAttribute('data-tab-id') || paneFrameEl?.getAttribute('data-tab-id')
  if (!paneId || !tabId) return

  const tab = tabs.find((item) => item.id === tabId)
  if (!tab) return

  dragSourcePaneId = paneId
  dragSourcePaneTab = tab
  paneTabEl.classList.add('dragging')
  paneFrameEl?.classList.add('pane-dragging')

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-terminal-manager-pane', paneId)
    event.dataTransfer.setData('text/plain', paneId)
  }
}

export function attachTabDrag(tabEl: HTMLElement, tab: Tab): void {
  tabEl.setAttribute('draggable', 'true')

  tabEl.addEventListener('dragstart', (event) => {
    if ((event.target as HTMLElement).closest('.pane-tab')) return
    dragSourceTab = tab
    tabEl.classList.add('dragging')
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-terminal-manager-tab', tab.id)
      event.dataTransfer.setData('text/plain', tab.id)
    }
  })

  tabEl.addEventListener('dragend', () => {
    tabEl.classList.remove('dragging')
    hideOverlay()
    resetDragState()
  })
}

export function initDragDrop(): void {
  terminalContainer.addEventListener('dragstart', handlePaneDragStart)
  tabBar.addEventListener('dragstart', handlePaneDragStart)

  terminalContainer.addEventListener('dragenter', (event) => {
    if (!getDraggedPaneSource()) return
    event.preventDefault()
  })

  terminalContainer.addEventListener('dragover', (event) => {
    if (!getDraggedPaneSource()) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

    const paneEl = findPaneAtPoint(event.clientX, event.clientY)
    if (!paneEl) {
      hideOverlay()
      return
    }

    const rect = paneEl.getBoundingClientRect()
    const zone = detectZone(rect, event.clientX, event.clientY)
    updateOverlay(paneEl, zone)
  })

  terminalContainer.addEventListener('dragleave', (event) => {
    const related = event.relatedTarget as HTMLElement | null
    if (related && terminalContainer.contains(related)) return
    hideOverlay()
  })

  terminalContainer.addEventListener('drop', async (event) => {
    event.preventDefault()
    const source = getDraggedPaneSource()
    if (!source || !activePane || !activeZone) {
      hideOverlay()
      return
    }

    const targetPaneId = activePane.getAttribute('data-pane-id')
    if (!targetPaneId) {
      hideOverlay()
      return
    }

    const targetTab = tabs.find((item) => item.panes.has(targetPaneId))
    if (!targetTab) {
      hideOverlay()
      return
    }

    const zone = activeZone
    hideOverlay()
    resetDragState()
    await movePaneToTab(source.tab, source.paneId, targetTab, targetPaneId, zone)
  })

  tabBar.addEventListener('dragenter', (event) => {
    if (!dragSourcePaneId) return
    event.preventDefault()
    tabBar.classList.add('drag-over')
  })

  tabBar.addEventListener('dragover', (event) => {
    if (!dragSourcePaneId) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  })

  tabBar.addEventListener('dragleave', (event) => {
    const related = event.relatedTarget as HTMLElement | null
    if (related && tabBar.contains(related)) return
    tabBar.classList.remove('drag-over')
  })

  tabBar.addEventListener('drop', async (event) => {
    event.preventDefault()
    tabBar.classList.remove('drag-over')

    if (!dragSourcePaneId || !dragSourcePaneTab) return

    const beforeTab = findTabBefore(event.clientX)
    const sourceTab = dragSourcePaneTab
    const paneId = dragSourcePaneId

    resetDragState()
    hideOverlay()

    await movePaneToNewTab(sourceTab, paneId, beforeTab)
  })

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.pane-dragging').forEach((element) => {
      element.classList.remove('pane-dragging')
    })
    document.querySelectorAll('.pane-tab.dragging').forEach((element) => {
      element.classList.remove('dragging')
    })
    hideOverlay()
    resetDragState()
  })
}

function findTabBefore(clientX: number): Tab | null {
  for (const tab of tabs) {
    const rect = tab.tabEl.getBoundingClientRect()
    if (clientX < rect.left + rect.width / 2) return tab
  }
  return null
}
