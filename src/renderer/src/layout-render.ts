/**
 * 布局树 DOM 渲染
 */

import type { LayoutNode, ContainerNode, Tab } from './types'
import { isLeaf } from './layout-ops'
import { activeTab, requestSaveLayout } from './state'

/**
 * 渲染标签页的布局
 */
export function renderLayout(tab: Tab): void {
  tab.containerEl.innerHTML = ''
  renderNode(tab.layout, tab.containerEl, tab)
  fitAllPanes(tab)
}

/**
 * 递归渲染布局节点
 */
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

/**
 * 创建分隔条元素
 */
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

/**
 * 拖拽调整大小
 */
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
    requestSaveLayout()
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

/**
 * 调整标签页中所有面板的大小
 */
export function fitAllPanes(tab: Tab): void {
  for (const pane of tab.panes.values()) {
    pane.fitAddon.fit()
  }
}
