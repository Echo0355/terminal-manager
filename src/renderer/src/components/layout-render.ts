import type { ContainerNode, LayoutNode, Pane, Tab } from '../types/renderer.types'
import { isLeaf } from '../services/layout-ops'
import { activeTab, requestSaveLayout, tabs, terminalContainer } from '../store/state'
import { createFloatingPaneActions, createPaneTabStrip, getPaneDisplayTitle, type ExternalEditor } from './tab-chrome'
import { normalizeSizes } from '../utils/layout-utils'
import { pinIMECompositionAnchor, releaseIMECompositionAnchor } from '../utils/ime-handling'
import { showNotification } from '../utils/ui-utils'
import { showTerminalContextMenu } from './terminal-context-menu'

const VSCODE_ICON_URL = new URL('../assets/vscode.svg', import.meta.url).href
const IDEA_ICON_URL = new URL('../assets/idea.svg', import.meta.url).href
const PYCHARM_ICON_URL = new URL('../assets/pycharm.svg', import.meta.url).href

type ClosePaneCallback = (tab: Tab, paneId: string) => void
type FocusPaneCallback = (tab: Tab, paneId: string) => void

let closePaneCallback: ClosePaneCallback | null = null
let focusPaneCallback: FocusPaneCallback | null = null
let closeListenersBound = false
let focusListenersBound = false

const EXTERNAL_EDITOR_ITEMS: Array<{
  editor: ExternalEditor
  label: string
  iconSrc: string
  iconAlt: string
}> = [
  { editor: 'vscode', label: '在 VS Code 中打开', iconSrc: VSCODE_ICON_URL, iconAlt: 'VS Code' },
  { editor: 'idea', label: '在 IntelliJ IDEA 中打开', iconSrc: IDEA_ICON_URL, iconAlt: 'IntelliJ IDEA' },
  { editor: 'pycharm', label: '在 PyCharm 中打开', iconSrc: PYCHARM_ICON_URL, iconAlt: 'PyCharm' }
]

/**
 * IME 组合期间的定位隔离
 *
 * xterm.js 的 CompositionHelper.updateCompositionElements() 在每次 render 时
 * 将 textarea 和预编辑文字移到当前终端光标位置。Claude Code 持续输出时
 * 光标不断变化，会导致输入法候选框闪烁和错位。
 *
 * 处理方案：
 * 1. compositionstart 时固定 textarea 和预编辑文字的坐标，compositionend 时释放。
 * 2. textarea 使用 viewport 固定定位，脱离分屏滚动层级，避免浏览器自动滚动祖先容器。
 * 3. 组合输入期间跳过 fit，结束后再补一次尺寸同步。
 * 4. 对缺失 compositionend 的输入法，在普通按键或失焦时兜底释放状态。
 */
let isIMEComposing = false
let imePinnedTerminal: HTMLElement | null = null
let imeNeedsFit = false

function finishIMEComposition(): void {
  if (!isIMEComposing) return

  isIMEComposing = false
  releaseIMECompositionAnchor(imePinnedTerminal)
  imePinnedTerminal = null

  // composition 期间窗口可能发生 resize，结束后补一次尺寸同步。
  const shouldFit = imeNeedsFit
  imeNeedsFit = false
  if (shouldFit && activeTab) {
    fitAllPanes(activeTab)
  }
}

/**
 * 初始化 IME 定位隔离
 */
export function initIMEHandling(): void {
  document.addEventListener('compositionstart', (event) => {
    isIMEComposing = true
    imePinnedTerminal = pinIMECompositionAnchor(event.target)
  })

  document.addEventListener('compositionupdate', (event) => {
    if (!imePinnedTerminal) {
      imePinnedTerminal = pinIMECompositionAnchor(event.target)
    }
  })

  document.addEventListener('compositionend', () => {
    finishIMEComposition()
  })

  // 部分 Windows 输入法可能不派发 compositionend，行为与 xterm 内部兜底保持一致。
  document.addEventListener('keydown', (event) => {
    if (!imePinnedTerminal || event.keyCode === 229 || [16, 17, 18].includes(event.keyCode)) return
    finishIMEComposition()
  })

  document.addEventListener('focusout', (event) => {
    if (imePinnedTerminal?.contains(event.target as Node)) {
      finishIMEComposition()
    }
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

/**
 * 注册 Claude 按钮点击回调
 *
 * 使用事件委托，在 terminalContainer 上监听所有 .claude-run-btn 的点击事件，
 * 找到对应 pane 后向其终端发送 "claude\r" 命令。
 */
export function registerClaudeRunCallback(): void {
  const handleClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest('.claude-run-btn')
    if (!button) return

    event.stopPropagation()

    const paneId = button.getAttribute('data-pane-id')
    if (!paneId) return

    const tab = tabs.find((item) => item.panes.has(paneId))
    if (!tab) return

    const pane = tab.panes.get(paneId)
    if (pane?.sessionId) {
      window.terminalAPI.writeToTerminal(pane.sessionId, 'claude\r')
    }
  }

  terminalContainer.addEventListener('click', handleClick)
}

/**
 * 注册 Codex 按钮点击回调
 *
 * 使用事件委托，在 terminalContainer 上监听所有 .codex-run-btn 的点击事件，
 * 找到对应 pane 后向其终端发送 "codex\r" 命令。
 */
export function registerCodexRunCallback(): void {
  const handleClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest('.codex-run-btn')
    if (!button) return

    event.stopPropagation()

    const paneId = button.getAttribute('data-pane-id')
    if (!paneId) return

    const tab = tabs.find((item) => item.panes.has(paneId))
    if (!tab) return

    const pane = tab.panes.get(paneId)
    if (pane?.sessionId) {
      window.terminalAPI.writeToTerminal(pane.sessionId, 'codex\r')
    }
  }

  terminalContainer.addEventListener('click', handleClick)
}

/**
 * 注册外部 IDE 菜单按钮点击回调
 *
 * 使用事件委托，在 terminalContainer 上监听所有 .editor-open-menu-btn 的点击事件，
 * 找到对应 pane 后显示外部 IDE 打开菜单。
 */
export function registerEditorOpenCallback(): void {
  const handleClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest('.editor-open-menu-btn') as HTMLElement | null
    if (!button) return

    event.stopPropagation()

    const paneId = button.getAttribute('data-pane-id')
    if (!paneId) return

    const tab = tabs.find((item) => item.panes.has(paneId))
    const pane = tab?.panes.get(paneId)
    if (!pane?.cwd) return

    const rect = button.getBoundingClientRect()
    showTerminalContextMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: EXTERNAL_EDITOR_ITEMS.map((item) => ({
        id: `open-editor-${item.editor}`,
        label: item.label,
        iconSrc: item.iconSrc,
        iconAlt: item.iconAlt,
        onSelect: () => {
          void openPaneFolderInEditor(item.editor, pane.cwd)
        }
      }))
    })
  }

  terminalContainer.addEventListener('click', handleClick)
}

async function openPaneFolderInEditor(editor: ExternalEditor, cwd: string): Promise<void> {
  const result = await window.terminalAPI.openFolderInEditor(editor, cwd)
  if (result.success) {
    showNotification(result.message || '已打开编辑器', 'success')
  } else {
    showNotification('打开编辑器失败：' + (result.error || '未知错误'), 'error')
  }
}

export function renderLayout(tab: Tab): void {
  for (const pane of tab.panes.values()) {
    pane.element.remove()
  }

  tab.containerEl.replaceChildren()
  renderNode(tab.layout, tab.containerEl, tab)

  if (isTabVisible(tab)) {
    fitAllPanes(tab)
    requestAnimationFrame(() => {
      if (isTabVisible(tab)) {
        fitAllPanes(tab)
      }
    })
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

    // data-pane-id / data-tab-id 已由 createPaneFrame 设置在 frame 上，无需在 pane.element 上重复
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
    childContainer.style.flex = `${node.sizes[index]} 0`
    childContainer.style.minWidth = `${MIN_PANE_WIDTH}px`
    childContainer.style.minHeight = `${MIN_PANE_HEIGHT}px`
    childContainer.style.position = 'relative'
    childContainer.style.overflow = 'clip'

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
  } else {
    // 单面板时显示浮动的 AI 工具按钮（分屏时按钮已在标签栏中）
    frame.appendChild(createFloatingPaneActions(paneId))
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
   * - 下游传播：deltaDown 从 effectiveDelta 开始，每个 view 吸收后递减
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
      if (deltaUp === 0) break
    }

    // ── 步骤 5：下游传播（从 sashIndex+1 向右/下）──
    // VS Code: deltaDown += viewDelta（viewDelta 为负数时递减）
    // viewDelta = clamp(size - deltaDown, min, max) - size
    // 当某个 view 达到 min/max 无法完全吸收 delta 时，剩余 delta 自动传播到下一个 view。
    let deltaDown = effectiveDelta
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
      childElements[i].style.flex = `${percent} 0`
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
  if (isIMEComposing) {
    imeNeedsFit = true
    return
  }

  if (!tab.containerEl.isConnected || tab.containerEl.offsetWidth === 0 || tab.containerEl.offsetHeight === 0) {
    return
  }

  for (const pane of tab.panes.values()) {
    if (!pane.element.isConnected || pane.element.offsetWidth === 0 || pane.element.offsetHeight === 0) {
      continue
    }

    // 修补 fitAddon 的 scrollBarWidth：xterm 在构造时测量一次（元素未入 DOM 时回退到 15px），
    // 但项目 CSS 使用 scrollbar-width: thin（凹槽 ~6px），导致 canvas 始终偏窄。
    // 在 fit 前重新测量实际凹槽宽度，确保 canvas 宽度与容器精确匹配。
    // 注意：_core 是 xterm.js 私有 API（测试版本 @xterm/xterm@5.5.0），未来升级需验证兼容性。
    try {
      const core = (pane.terminal as any)._core
      const viewport = core?.viewport
      const viewportEl = pane.element.querySelector('.xterm-viewport') as HTMLElement | null
      const scrollAreaEl = pane.element.querySelector('.xterm-scroll-area') as HTMLElement | null
      if (viewport && viewportEl && scrollAreaEl) {
        const measured = viewportEl.offsetWidth - scrollAreaEl.offsetWidth
        if (measured >= 0) {
          viewport.scrollBarWidth = measured
        }
      }
    } catch {
      // 忽略内部 API 访问异常
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

export function initWindowResizeHandler(): () => void {
  const handleResize = (): void => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      // 重新适配所有标签的终端尺寸
      for (const tab of tabs) {
        if (tab.containerEl.isConnected && tab.containerEl.offsetWidth > 0) {
          fitAllPanes(tab)
        }
      }
    }, 100) // 防抖 100ms，避免频繁触发
  }
  window.addEventListener('resize', handleResize)

  // ResizeObserver 监听终端容器尺寸变化
  // 捕获侧边栏切换、开发者工具变化等不触发 window.resize 的场景
  const resizeObserver = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (activeTab) fitAllPanes(activeTab)
    }, 100)
  })
  resizeObserver.observe(terminalContainer)

  // 返回清理函数，供需要时取消监听
  return () => {
    window.removeEventListener('resize', handleResize)
    resizeObserver.disconnect()
    if (resizeTimer) clearTimeout(resizeTimer)
  }
}
