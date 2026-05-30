import type { ContainerNode, LayoutNode, Pane, Tab } from './types'
import { isLeaf } from './layout-ops'
import { activeTab, requestSaveLayout, tabs, terminalContainer } from './state'
import { createPaneTabStrip, getPaneDisplayTitle } from './tab-chrome'

type ClosePaneCallback = (tab: Tab, paneId: string) => void
type FocusPaneCallback = (tab: Tab, paneId: string) => void

let closePaneCallback: ClosePaneCallback | null = null
let focusPaneCallback: FocusPaneCallback | null = null
let closeListenersBound = false
let focusListenersBound = false

/**
 * IME（输入法）活动状态标志
 *
 * 当用户使用中文、日文等输入法时，此标志为 true。
 * 在 IME 输入期间，应暂停 fitAllPanes 等自动调整操作，
 * 避免输入法候选窗口触发的 resize 事件导致终端内容被挤压。
 */
let isIMEActive = false

/**
 * 初始化 IME 状态检测
 *
 * 监听全局的 compositionstart 和 compositionend 事件，
 * 跟踪输入法的活动状态。在 IME 活动期间，fitAllPanes 会被跳过。
 */
export function initIMEHandling(): void {
  document.addEventListener('compositionstart', () => {
    isIMEActive = true
  })

  document.addEventListener('compositionend', () => {
    isIMEActive = false
  })
}

export function registerClosePaneCallback(fn: ClosePaneCallback): void {
  closePaneCallback = fn

  if (closeListenersBound) return
  closeListenersBound = true

  const handleCloseClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest('.pane-close-btn')
    if (!button) return

    event.stopPropagation()

    const paneOwner = button.closest('[data-pane-id]') as HTMLElement | null
    const paneId = paneOwner?.getAttribute('data-pane-id')
    if (!paneId) return

    const tab = tabs.find((item) => item.panes.has(paneId))
    if (tab && closePaneCallback) {
      closePaneCallback(tab, paneId)
    }
  }

  terminalContainer.addEventListener('click', handleCloseClick)
}

export function registerFocusPaneCallback(fn: FocusPaneCallback): void {
  focusPaneCallback = fn

  if (focusListenersBound) return
  focusListenersBound = true

  const handleFocusMouseDown = (event: Event): void => {
    const paneTab = (event.target as HTMLElement).closest('.pane-tab') as HTMLElement | null
    if (!paneTab) return

    const paneId = paneTab.getAttribute('data-pane-id')
    if (!paneId) return

    const tab = tabs.find((item) => item.panes.has(paneId))
    if (tab && focusPaneCallback) {
      focusPaneCallback(tab, paneId)
    }
  }

  terminalContainer.addEventListener('mousedown', handleFocusMouseDown)
}

export function renderLayout(tab: Tab): void {
  for (const pane of tab.panes.values()) {
    pane.element.remove()
  }

  tab.containerEl.replaceChildren()
  renderNode(tab.layout, tab.containerEl, tab)

  if (isTabVisible(tab)) {
    fitAllPanes(tab)
  }
}

function isTabVisible(tab: Tab): boolean {
  return (
    activeTab?.id === tab.id &&
    tab.containerEl.isConnected &&
    tab.containerEl.offsetWidth > 0 &&
    tab.containerEl.offsetHeight > 0
  )
}

function renderNode(node: LayoutNode, container: HTMLElement, tab: Tab): void {
  if (isLeaf(node)) {
    const pane = tab.panes.get(node.paneId)
    if (!pane) return

    const frame = createPaneFrame(pane, tab, node.paneId, true)
    container.appendChild(frame)

    pane.element.setAttribute('data-pane-id', node.paneId)
    pane.element.setAttribute('data-tab-id', tab.id)
    pane.element.classList.toggle('focused', node.paneId === tab.focusedPaneId)
    return
  }

  const wrapper = document.createElement('div')
  wrapper.className = 'layout-container'
  wrapper.style.display = 'flex'
  wrapper.style.flexDirection = node.direction === 'horizontal' ? 'row' : 'column'
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'

  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index]
    const childContainer = document.createElement('div')
    childContainer.className = 'layout-child'
    childContainer.style.flex = `${node.sizes[index]}`
    childContainer.style.minWidth = `${MIN_PANE_WIDTH}px`
    childContainer.style.minHeight = `${MIN_PANE_HEIGHT}px`
    childContainer.style.position = 'relative'
    childContainer.style.overflow = 'hidden'

    renderNode(child, childContainer, tab)
    wrapper.appendChild(childContainer)

    if (index < node.children.length - 1) {
      wrapper.appendChild(createSplitter(node, index))
    }
  }

  container.appendChild(wrapper)
}

function createPaneFrame(pane: Pane, tab: Tab, paneId: string, _showHeader: boolean): HTMLElement {
  const frame = document.createElement('div')
  frame.className = 'pane-frame'
  frame.setAttribute('data-pane-id', paneId)
  frame.setAttribute('data-tab-id', tab.id)
  frame.classList.toggle('focused', paneId === tab.focusedPaneId)

  // 分屏时为每个面板显示标签栏（第二层标签栏）
  if (tab.panes.size > 1) {
    frame.appendChild(
      createPaneTabStrip({
        active: paneId === tab.focusedPaneId,
        paneId,
        tabId: tab.id,
        title: getPaneDisplayTitle(pane, tab.title)
      })
    )
  }

  const body = document.createElement('div')
  body.className = 'pane-frame-body'
  body.appendChild(pane.element)
  frame.appendChild(body)

  return frame
}

/** 面板最小尺寸（像素）：水平方向 */
const MIN_PANE_WIDTH = 60
/** 面板最小尺寸（像素）：垂直方向 */
const MIN_PANE_HEIGHT = 30

/**
 * 创建分割条（Sash）
 *
 * 在相邻子节点之间创建可拖拽的分割条，支持 VS Code 风格的约束传播 resize。
 */
function createSplitter(container: ContainerNode, index: number): HTMLElement {
  const splitter = document.createElement('div')
  splitter.className = 'pane-splitter'

  const isHorizontal = container.direction === 'horizontal'
  splitter.style.flexBasis = '4px'
  splitter.style.flexShrink = '0'
  splitter.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'

  splitter.addEventListener('mousedown', (event) => {
    event.preventDefault()
    splitter.classList.add('dragging')
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
    startResize(event, container, index, isHorizontal, splitter)
  })

  return splitter
}

/**
 * 拖拽调整面板大小 — 严格对标 VS Code SplitView.resize()
 *
 * VS Code 核心算法：
 * 1. 将子节点分为上游（sash 左侧）和下游（sash 右侧）两组
 * 2. 计算全局 delta 边界：minDelta = max(minDeltaUp, minDeltaDown)，maxDelta 同理
 * 3. clamp delta 到 [minDelta, maxDelta]
 * 4. 上游传播：从 sashIndex 向左，每个 view 按 min/max 约束吸收 deltaUp
 * 5. 下游传播：从 sashIndex+1 向右，每个 view 按 min/max 约束吸收 deltaDown
 * 6. 关键：始终使用像素值，仅在最终应用时转换为百分比
 *
 * @param event - mousedown 事件
 * @param container - 容器节点
 * @param sashIndex - 分割条在子节点之间的索引
 * @param isHorizontal - 是否水平方向
 * @param splitter - 分割条 DOM 元素
 */
function startResize(
  event: MouseEvent,
  container: ContainerNode,
  sashIndex: number,
  isHorizontal: boolean,
  splitter: HTMLElement
): void {
  const target = event.target as HTMLElement
  const parent = target.parentElement
  if (!parent) return

  // 获取所有子元素（排除分割条）
  const childElements = Array.from(parent.children).filter(
    (element) => !element.classList.contains('pane-splitter')
  ) as HTMLElement[]

  const childCount = childElements.length
  if (childCount < 2) return

  const startPos = isHorizontal ? event.clientX : event.clientY
  const minSize = isHorizontal ? MIN_PANE_WIDTH : MIN_PANE_HEIGHT

  // 记录所有子节点的初始像素尺寸（VS Code 始终使用像素值）
  const initialSizes = childElements.map((el) =>
    isHorizontal ? el.offsetWidth : el.offsetHeight
  )
  const totalSize = initialSizes.reduce((a, b) => a + b, 0)

  // 每个 view 的最大尺寸 = 总尺寸 - (N-1) * minSize（确保其他 view 至少有 minSize）
  const maxSizes = initialSizes.map(() => totalSize - (childCount - 1) * minSize)

  /**
   * 核心 resize 算法 — 严格对标 VS Code SplitView.resize()
   *
   * 关键设计：
   * - 始终在像素空间中操作，避免百分比累积误差
   * - 上游传播：deltaUp 从 effectiveDelta 开始，每个 view 吸收后递减
   * - 下游传播：deltaDown 从 0 开始，每个 view 的 viewDelta 累加到 deltaDown
   * - 这确保了对称性：拖回原位时 sizes 精确恢复
   */
  const applyResize = (delta: number): void => {
    // 克隆初始尺寸数组（每次从初始状态重新计算，避免累积误差）
    const sizes = [...initialSizes]

    // ── 步骤 1：计算上游组（sash 左侧/上方）的 min/max delta 约束 ──
    let minDeltaUp = 0
    let maxDeltaUp = 0
    for (let i = 0; i <= sashIndex; i++) {
      minDeltaUp += minSize - sizes[i]        // 所有上游 view 缩到最小时能吸收的负 delta
      maxDeltaUp += maxSizes[i] - sizes[i]    // 所有上游 view 扩到最大时能吸收的正 delta
    }

    // ── 步骤 2：计算下游组（sash 右侧/下方）的 min/max delta 约束 ──
    let minDeltaDown = 0
    let maxDeltaDown = 0
    for (let i = sashIndex + 1; i < childCount; i++) {
      minDeltaDown += sizes[i] - maxSizes[i]  // 下游 view 缩到最大约束时的负 delta
      maxDeltaDown += sizes[i] - minSize      // 下游 view 缩到最小时的正 delta
    }

    // ── 步骤 3：计算全局 delta 边界并 clamp ──
    // delta > 0 表示向右/下拖拽（上游增大，下游减小）
    const minDelta = Math.max(minDeltaUp, minDeltaDown)
    const maxDelta = Math.min(maxDeltaUp, maxDeltaDown)
    const effectiveDelta = Math.max(minDelta, Math.min(maxDelta, delta))

    if (effectiveDelta === 0) return

    // ── 步骤 4：上游传播（从 sashIndex 向左/上）──
    // VS Code: deltaUp -= viewDelta
    // viewDelta = clamp(size + deltaUp, min, max) - size
    // 每个 view 吸收部分 delta 后，剩余传递给下一个 view
    let deltaUp = effectiveDelta
    for (let i = sashIndex; i >= 0; i--) {
      const newSize = Math.max(minSize, Math.min(maxSizes[i], sizes[i] + deltaUp))
      const viewDelta = newSize - sizes[i]
      sizes[i] = newSize
      deltaUp -= viewDelta
      if (deltaUp <= 0) break
    }

    // ── 步骤 5：下游传播（从 sashIndex+1 向右/下）──
    // VS Code: deltaDown += viewDelta（累积式传播）
    // viewDelta = clamp(size - deltaDown, min, max) - size
    // 当某个 view 达到 maxSize 无法完全吸收 delta 时，
    // 剩余的 deltaDown 自动传播到下一个 view（级联效应）
    let deltaDown = 0
    for (let i = sashIndex + 1; i < childCount; i++) {
      const newSize = Math.max(minSize, Math.min(maxSizes[i], sizes[i] - deltaDown))
      const viewDelta = newSize - sizes[i]
      sizes[i] = newSize
      deltaDown += viewDelta
    }

    // ── 步骤 6：将像素尺寸转换为百分比并应用 ──
    // 使用实际 sizes 总和（可能因约束 clamp 而不等于 totalSize）
    const actualTotal = sizes.reduce((a, b) => a + b, 0)
    for (let i = 0; i < childCount; i++) {
      const percent = (sizes[i] / actualTotal) * 100
      container.sizes[i] = percent
      childElements[i].style.flex = `${percent}`
    }

    // 更新 sash 状态反馈
    updateSashState(splitter, childElements, sashIndex, isHorizontal, sizes, minSize)
  }

  const onMouseMove = (moveEvent: MouseEvent): void => {
    const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY
    const delta = currentPos - startPos
    applyResize(delta)
  }

  const onMouseUp = (): void => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    splitter.classList.remove('dragging')
    splitter.classList.remove('sash-at-minimum', 'sash-at-maximum')
    document.body.style.cursor = ''

    // 鼠标释放时将容器 sizes 规范化为精确的百分比（总和 = 100）
    normalizeSizes(container)

    if (activeTab) {
      fitAllPanes(activeTab)
    }

    requestSaveLayout()
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

/**
 * 规范化容器 sizes 为精确百分比（总和 = 100）
 *
 * 拖拽过程中 sizes 可能因浮点运算产生微小误差，
 * 鼠标释放时调用此函数确保数据一致性。
 */
function normalizeSizes(container: ContainerNode): void {
  const total = container.sizes.reduce((a, b) => a + b, 0)
  if (total <= 0) return

  for (let i = 0; i < container.sizes.length; i++) {
    container.sizes[i] = (container.sizes[i] / total) * 100
  }

  // 修正浮点误差：确保总和精确为 100
  const sum = container.sizes.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > 0.01 && container.sizes.length > 0) {
    container.sizes[container.sizes.length - 1] += 100 - sum
  }
}

/**
 * 更新 Sash 状态 — 对标 VS Code SashState
 *
 * 检测 sash 两侧的面板是否达到最小/最大尺寸，
 * 动态添加 CSS class 提供视觉反馈。
 */
function updateSashState(
  splitter: HTMLElement,
  _childElements: HTMLElement[],
  sashIndex: number,
  isHorizontal: boolean,
  sizes: number[],
  minSize: number
): void {
  // 检测上游（左侧/上方）是否达到最小尺寸
  const leftAtMin = sizes[sashIndex] <= minSize + 1
  // 检测下游（右侧/下方）是否达到最小尺寸
  const rightAtMin = sizes[sashIndex + 1] <= minSize + 1

  splitter.classList.toggle('sash-at-minimum', leftAtMin)
  splitter.classList.toggle('sash-at-maximum', rightAtMin)

  // 动态调整光标样式
  if (leftAtMin || rightAtMin) {
    const baseCursor = isHorizontal ? 'col-resize' : 'row-resize'
    splitter.style.cursor = baseCursor
  }
}

export function fitAllPanes(tab: Tab): void {
  // IME 输入期间跳过自动调整，避免输入法候选窗口触发 resize 导致终端内容被挤压
  if (isIMEActive) {
    return
  }

  if (!tab.containerEl.isConnected || tab.containerEl.offsetWidth === 0 || tab.containerEl.offsetHeight === 0) {
    return
  }

  for (const pane of tab.panes.values()) {
    if (!pane.element.isConnected || pane.element.offsetWidth === 0 || pane.element.offsetHeight === 0) {
      continue
    }

    pane.fitAddon.fit()
  }
}

/**
 * 窗口 resize 时按比例重新分配面板尺寸
 *
 * 对标 VS Code 的 proportionalLayout：窗口大小变化时，
 * 所有面板按当前百分比比例保持不变，终端自动适配新尺寸。
 *
 * 由于使用 flex + 百分比布局，窗口 resize 时浏览器会自动按比例分配。
 * 此函数只需在 resize 完成后重新适配终端尺寸。
 */
let resizeTimer: ReturnType<typeof setTimeout> | null = null

export function initWindowResizeHandler(): void {
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      // 重新适配所有标签的终端尺寸
      for (const tab of tabs) {
        if (tab.containerEl.isConnected && tab.containerEl.offsetWidth > 0) {
          fitAllPanes(tab)
        }
      }
    }, 100) // 防抖 100ms，避免频繁触发
  })
}
