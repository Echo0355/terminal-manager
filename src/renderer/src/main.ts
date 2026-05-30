/**
 * 渲染进程入口
 *
 * 负责所有 UI 交互和终端渲染逻辑。
 * 使用原生 JavaScript 实现，无前端框架依赖。
 * 通过 xterm.js 渲染终端模拟器，通过 window.terminalAPI 与主进程通信。
 *
 * 主要功能模块：
 * 1. 标签页管理 - 创建、切换、关闭标签
 * 2. 分屏布局 - 二叉树布局结构，支持水平/垂直分屏
 * 3. 终端面板 - PTY 会话绑定，输入输出处理
 * 4. 项目管理 - 侧边栏项目列表，快速打开常用目录
 * 5. 设置管理 - Shell、字体、主题等配置
 * 6. 布局持久化 - 自动保存/恢复窗口布局
 */

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

// ── 布局树类型 ──

/** 布局节点类型，可以是容器节点或叶子节点 */
type LayoutNode = ContainerNode | LeafNode

/** 容器节点，定义分割方向和子节点 */
interface ContainerNode {
  type: 'container'
  /** 分割方向：'horizontal' 为左右分割，'vertical' 为上下分割 */
  direction: 'horizontal' | 'vertical'
  /** 子节点数组 */
  children: LayoutNode[]
  /** 每个子节点的百分比尺寸，总和为 100 */
  sizes: number[]
}

/** 叶子节点，代表一个终端面板 */
interface LeafNode {
  type: 'leaf'
  /** 关联的终端面板 ID */
  paneId: string
}

// ── 序列化类型 ──

/** 布局状态节点（JSON 序列化格式） */
interface LayoutStateNode {
  type: 'container' | 'leaf'
  direction?: 'horizontal' | 'vertical'
  children?: LayoutStateNode[]
  sizes?: number[]
  paneId?: string
}

/** 面板状态（用于持久化） */
interface PaneState {
  id: string
  shell: string
  cwd: string
}

/** 标签状态（用于持久化） */
interface TabState {
  id: string
  title: string
  activePaneId: string
  layout: LayoutStateNode
  panes: PaneState[]
}

/** 完整布局状态（用于持久化） */
interface LayoutState {
  version: string
  tabs: TabState[]
  activeTabId: string
  windowState?: {
    sidebarWidth: number
  }
}

// ── 配置类型 ──

/** 应用配置接口 */
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

/**
 * 终端面板接口
 *
 * 表示一个活跃的终端面板，包含 xterm.js 终端实例和 PTY 会话信息。
 * 每个面板对应一个 PTY 会话，通过 sessionId 关联。
 */
interface Pane {
  /** 面板唯一标识符 */
  id: string
  /** PTY 会话 ID，用于与主进程通信 */
  sessionId: string
  /** 使用的 Shell 路径 */
  shell: string
  /** 当前工作目录 */
  cwd: string
  /** xterm.js 终端实例 */
  terminal: Terminal
  /** xterm.js FitAddon，用于自动调整终端大小 */
  fitAddon: FitAddon
  /** 面板的 DOM 容器元素 */
  element: HTMLElement
  /** 清理 PTY 数据监听的函数 */
  cleanupData: () => void
  /** 清理 PTY 退出监听的函数 */
  cleanupExit: () => void
  /** 清理 PTY 错误监听的函数 */
  cleanupError: () => void
}

// ── Tab 类型 ──

/**
 * 标签页接口
 *
 * 表示一个标签页，包含布局树和所有终端面板。
 * 每个标签页有独立的布局结构，支持分屏。
 */
interface Tab {
  /** 标签唯一标识符 */
  id: string
  /** 标签显示标题 */
  title: string
  /** 布局树根节点 */
  layout: LayoutNode
  /** 所有终端面板的映射表，key 为面板 ID */
  panes: Map<string, Pane>
  /** 当前聚焦的面板 ID */
  focusedPaneId: string
  /** 标签内容的 DOM 容器 */
  containerEl: HTMLElement
  /** 标签页签的 DOM 元素 */
  tabEl: HTMLElement
}

// ── 项目类型 ──

/** 项目数据接口 */
interface Project {
  id: string
  name: string
  path: string
}

// ── DOM 元素引用 ──

/** 标签栏容器 */
const tabBar = document.getElementById('tab-bar')!
/** 添加标签按钮 */
const tabAddBtn = document.getElementById('tab-add')!
/** 终端容器，所有标签页内容都在此渲染 */
const terminalContainer = document.getElementById('terminal-container')!
/** 状态栏：显示当前 Shell */
const statusShell = document.getElementById('status-shell')!
/** 状态栏：显示当前工作目录 */
const statusCwd = document.getElementById('status-cwd')!
/** 加载提示元素 */
const loading = document.getElementById('loading')!
/** 侧边栏项目列表容器 */
const projectList = document.getElementById('project-list')!
/** 添加项目按钮 */
const btnAddProject = document.getElementById('btn-add-project')!
/** 侧边栏容器 */
const sidebar = document.getElementById('sidebar')!

// 设置对话框 DOM
/** 设置对话框遮罩层 */
const settingsOverlay = document.getElementById('settings-overlay')!
/** 设置对话框关闭按钮 */
const settingsClose = document.getElementById('settings-close')!
/** 设置对话框取消按钮 */
const settingsCancel = document.getElementById('settings-cancel')!
/** 设置对话框保存按钮 */
const settingsSave = document.getElementById('settings-save')!
/** 设置表单：默认 Shell */
const settingShell = document.getElementById('setting-shell') as HTMLInputElement
/** 设置表单：默认工作目录 */
const settingCwd = document.getElementById('setting-cwd') as HTMLInputElement
/** 设置表单：字体大小 */
const settingFontSize = document.getElementById('setting-font-size') as HTMLInputElement
/** 设置表单：滚动缓冲行数 */
const settingScrollback = document.getElementById('setting-scrollback') as HTMLInputElement
/** 设置表单：主题选择 */
const settingTheme = document.getElementById('setting-theme') as HTMLSelectElement

// 确认对话框 DOM
/** 确认对话框遮罩层 */
const confirmOverlay = document.getElementById('confirm-overlay')!
/** 确认对话框标题 */
const confirmTitle = document.getElementById('confirm-title')!
/** 确认对话框内容 */
const confirmBody = document.getElementById('confirm-body')!
/** 确认对话框确定按钮 */
const confirmOk = document.getElementById('confirm-ok')!
/** 确认对话框取消按钮 */
const confirmCancel = document.getElementById('confirm-cancel')!

// 通知 DOM
/** 通知提示元素 */
const notification = document.getElementById('notification')!

// ── 全局状态 ──

/** 所有标签页的数组 */
const tabs: Tab[] = []
/** 当前激活的标签页 */
let activeTab: Tab | null = null
/** 标签计数器，用于生成默认标题 */
let tabIndex = 0
/** 面板计数器，用于生成唯一 ID */
let paneCounter = 0
/** 项目列表 */
let projects: Project[] = []
/** 应用配置实例 */
let appConfig: Config = {
  general: {
    defaultShell: 'powershell.exe',
    defaultCwd: '',
    fontSize: 14,
    theme: 'dark',
    scrollback: 10000
  }
}

/** 侧边栏宽度（像素） */
let sidebarWidth = 220

// ── 主题定义 ──

/**
 * 终端主题配置
 *
 * 定义深色和浅色两种主题的颜色方案。
 * 颜色值直接传递给 xterm.js 的 Terminal 实例。
 */
const THEMES = {
  /** 深色主题 */
  dark: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    selectionBackground: '#264f78'
  },
  /** 浅色主题 */
  light: {
    background: '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    selectionBackground: '#add6ff'
  }
}

// ── 通知系统 ──

/** 通知自动消失的定时器 */
let notificationTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 显示通知提示
 *
 * 在界面顶部显示一个临时通知，支持多种类型和自动消失。
 * 新通知会替换当前显示的通知。
 *
 * @param message - 通知内容
 * @param type - 通知类型，决定颜色样式
 * @param duration - 显示时长（毫秒），0 表示不自动消失
 */
function showNotification(message: string, type: 'info' | 'error' | 'warning' | 'success' = 'info', duration = 3000): void {
  // 清除之前的定时器
  if (notificationTimer) {
    clearTimeout(notificationTimer)
    notificationTimer = null
  }

  notification.textContent = message
  notification.className = type
  notification.classList.add('visible')

  // 设置自动消失
  if (duration > 0) {
    notificationTimer = setTimeout(() => {
      notification.classList.remove('visible')
      notificationTimer = null
    }, duration)
  }
}

// ── 确认对话框 ──

/** 确认对话框的 Promise resolve 函数 */
let confirmResolve: ((value: boolean) => void) | null = null

/**
 * 显示确认对话框
 *
 * 使用 Promise 模式，等待用户点击确定或取消。
 * 用于删除、关闭等需要用户确认的操作。
 *
 * @param title - 对话框标题
 * @param message - 对话框内容
 * @returns Promise，用户点击确定返回 true，取消返回 false
 */
function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmTitle.textContent = title
    confirmBody.textContent = message
    confirmOverlay.classList.add('visible')
    confirmResolve = resolve
  })
}

/** 处理确认对话框确定按钮点击 */
function handleConfirmOk(): void {
  confirmOverlay.classList.remove('visible')
  if (confirmResolve) {
    confirmResolve(true)
    confirmResolve = null
  }
}

/** 处理确认对话框取消按钮点击 */
function handleConfirmCancel(): void {
  confirmOverlay.classList.remove('visible')
  if (confirmResolve) {
    confirmResolve(false)
    confirmResolve = null
  }
}

// 绑定确认对话框事件
confirmOk.addEventListener('click', handleConfirmOk)
confirmCancel.addEventListener('click', handleConfirmCancel)
// 点击遮罩层关闭对话框
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) handleConfirmCancel()
})

// ── 工具函数 ──

/**
 * 创建叶子节点
 *
 * @param paneId - 终端面板 ID
 * @returns 新的叶子节点
 */
function makeLeaf(paneId: string): LeafNode {
  return { type: 'leaf', paneId }
}

/**
 * 创建容器节点
 *
 * 自动计算子节点尺寸，平均分配 100% 的空间。
 *
 * @param direction - 分割方向
 * @param children - 子节点数组
 * @returns 新的容器节点
 */
function makeContainer(direction: 'horizontal' | 'vertical', children: LayoutNode[]): ContainerNode {
  const size = Math.floor(100 / children.length)
  const sizes = children.map((_, i) =>
    i === children.length - 1 ? 100 - size * (children.length - 1) : size
  )
  return { type: 'container', direction, children, sizes }
}

/**
 * 判断节点是否为叶子节点
 *
 * @param node - 要判断的节点
 * @returns 如果是叶子节点返回 true
 */
function isLeaf(node: LayoutNode): node is LeafNode {
  return node.type === 'leaf'
}

/**
 * 判断节点是否为容器节点
 *
 * @param node - 要判断的节点
 * @returns 如果是容器节点返回 true
 */
function isContainer(node: LayoutNode): node is ContainerNode {
  return node.type === 'container'
}

/**
 * 查找指定面板的父容器和索引
 *
 * 在布局树中搜索指定 paneId 的叶子节点，返回其父容器和位置。
 *
 * @param root - 搜索的根节点
 * @param paneId - 要查找的面板 ID
 * @returns 父容器和索引，如果未找到返回 null
 */
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

/**
 * HTML 转义函数
 *
 * 防止 XSS 攻击，将特殊字符转换为 HTML 实体。
 *
 * @param text - 要转义的文本
 * @returns 转义后的 HTML 字符串
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ── 创建 PTY + xterm ──

/**
 * 创建新的终端面板
 *
 * 完整的终端创建流程：
 * 1. 创建 xterm.js 终端实例
 * 2. 加载 FitAddon 和 WebLinksAddon 插件
 * 3. 通过 IPC 请求主进程创建 PTY 会话
 * 4. 建立双向数据绑定（用户输入 → PTY，PTY 输出 → 终端）
 * 5. 设置事件监听（退出、错误、大小调整）
 *
 * @param options - 创建选项
 * @param options.shell - Shell 路径（可选）
 * @param options.cwd - 工作目录（可选）
 * @returns Promise 包含完整的 Pane 对象
 */
async function createTerminalPane(options?: { shell?: string; cwd?: string }): Promise<Pane> {
  const id = `pane_${++paneCounter}`

  // 创建 xterm.js 终端实例
  const terminal = new Terminal({
    fontSize: appConfig.general.fontSize,
    fontFamily: "'Cascadia Code', 'Microsoft YaHei', Consolas, monospace",
    theme: THEMES[appConfig.general.theme],
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: appConfig.general.scrollback,
    allowProposedApi: true
  })

  // 加载插件
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())

  // 创建 DOM 容器并挂载终端
  const element = document.createElement('div')
  element.className = 'pane'
  terminal.open(element)

  // 请求主进程创建 PTY 会话
  const result = await window.terminalAPI.createTerminal({
    cols: terminal.cols,
    rows: terminal.rows,
    shell: options?.shell,
    cwd: options?.cwd
  })

  // 处理创建失败
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

  // 建立双向数据绑定

  // 用户输入 → PTY
  terminal.onData((data) => {
    window.terminalAPI.writeToTerminal(sessionId, data)
  })

  // PTY 输出 → 终端显示
  const cleanupData = window.terminalAPI.onTerminalData(sessionId, (data) => {
    terminal.write(data)
  })

  // PTY 退出事件
  const cleanupExit = window.terminalAPI.onTerminalExit(sessionId, () => {
    terminal.write('\r\n\x1b[33m[进程已退出]\x1b[0m\r\n')
  })

  // PTY 错误事件
  const cleanupError = window.terminalAPI.onTerminalError(sessionId, (error) => {
    terminal.write('\r\n\x1b[31m[错误] ' + error + '\x1b[0m\r\n')
    showNotification('终端错误：' + error, 'error')
  })

  // 终端大小调整 → PTY
  terminal.onResize(({ cols, rows }) => {
    window.terminalAPI.resizeTerminal(sessionId, cols, rows)
  })

  // 点击面板时聚焦
  element.addEventListener('mousedown', () => {
    const tab = tabs.find((t) => t.panes.has(id))
    if (tab) focusPane(tab, id)
  })

  return { id, sessionId, shell, cwd: actualCwd, terminal, fitAddon, element, cleanupData, cleanupExit, cleanupError }
}

/**
 * 销毁终端面板
 *
 * 清理所有资源：
 * 1. 移除 IPC 事件监听
 * 2. 销毁 xterm.js 终端实例
 * 3. 关闭 PTY 会话
 *
 * @param pane - 要销毁的面板
 */
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

/**
 * 渲染标签页的布局
 *
 * 清空容器后递归渲染布局树，最后调整所有面板大小。
 *
 * @param tab - 要渲染的标签页
 */
function renderLayout(tab: Tab): void {
  tab.containerEl.innerHTML = ''
  renderNode(tab.layout, tab.containerEl, tab)
  fitAllPanes(tab)
}

/**
 * 递归渲染布局节点
 *
 * 叶子节点：直接添加终端面板元素
 * 容器节点：创建 Flex 容器，递归渲染子节点，添加分隔条
 *
 * @param node - 要渲染的节点
 * @param container - 父 DOM 容器
 * @param tab - 所属的标签页
 */
function renderNode(node: LayoutNode, container: HTMLElement, tab: Tab): void {
  // 叶子节点：添加终端面板
  if (isLeaf(node)) {
    const pane = tab.panes.get(node.paneId)
    if (pane) {
      container.appendChild(pane.element)
      pane.element.classList.toggle('focused', node.paneId === tab.focusedPaneId)
    }
    return
  }

  // 容器节点：创建 Flex 布局容器
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

    // 递归渲染子节点
    renderNode(child, childContainer, tab)
    wrapper.appendChild(childContainer)

    // 在子节点之间添加分隔条（最后一个子节点后不添加）
    if (i < node.children.length - 1) {
      const splitter = createSplitter(node, i)
      wrapper.appendChild(splitter)
    }
  }

  container.appendChild(wrapper)
}

/**
 * 创建分隔条元素
 *
 * 分隔条用于拖拽调整相邻面板的大小。
 * 水平分割时显示为垂直分隔条（col-resize 光标）
 * 垂直分割时显示为水平分隔条（row-resize 光标）
 *
 * @param container - 父容器节点
 * @param index - 分隔条左侧子节点的索引
 * @returns 分隔条 DOM 元素
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

  // 悬停时高亮显示
  splitter.addEventListener('mouseenter', () => {
    splitter.style.background = '#007acc'
  })
  splitter.addEventListener('mouseleave', () => {
    splitter.style.background = 'transparent'
  })

  // 拖拽开始
  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault()
    startResize(e, container, index, isH)
  })

  return splitter
}

/**
 * 开始拖拽调整大小
 *
 * 实现面板大小调整的核心逻辑：
 * 1. 记录起始位置和尺寸
 * 2. 监听鼠标移动，实时更新面板大小
 * 3. 鼠标释放时完成调整，保存布局
 *
 * @param e - 鼠标事件
 * @param container - 父容器节点
 * @param leftIndex - 左侧子节点的索引
 * @param isHorizontal - 是否为水平分割
 */
function startResize(
  e: MouseEvent,
  container: ContainerNode,
  leftIndex: number,
  isHorizontal: boolean
): void {
  const target = e.target as HTMLElement
  const parent = target.parentElement!
  // 获取所有非分隔条的子元素
  const children = Array.from(parent.children).filter(
    (el) => !el.classList.contains('pane-splitter')
  )

  const leftEl = children[leftIndex] as HTMLElement
  const rightEl = children[leftIndex + 1] as HTMLElement
  if (!leftEl || !rightEl) return

  // 记录起始状态
  const startPos = isHorizontal ? e.clientX : e.clientY
  const leftStart = isHorizontal ? leftEl.offsetWidth : leftEl.offsetHeight
  const rightStart = isHorizontal ? rightEl.offsetWidth : rightEl.offsetHeight
  const total = leftStart + rightStart

  // 鼠标移动处理
  const onMouseMove = (ev: MouseEvent): void => {
    const delta = (isHorizontal ? ev.clientX : ev.clientY) - startPos
    // 限制最小宽度 60px
    const newLeft = Math.max(60, Math.min(total - 60, leftStart + delta))
    const newRight = total - newLeft
    const leftPercent = (newLeft / total) * 100
    const rightPercent = (newRight / total) * 100

    // 更新布局数据
    container.sizes[leftIndex] = leftPercent
    container.sizes[leftIndex + 1] = rightPercent

    // 更新 DOM 样式
    leftEl.style.flex = `${leftPercent}`
    rightEl.style.flex = `${rightPercent}`
  }

  // 鼠标释放处理
  const onMouseUp = (): void => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    if (activeTab) fitAllPanes(activeTab)
    scheduleSaveLayout()
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

/**
 * 调整标签页中所有面板的大小
 *
 * 调用每个面板的 FitAddon.fit() 方法，
 * 使终端内容适应当前容器尺寸。
 *
 * @param tab - 要调整的标签页
 */
function fitAllPanes(tab: Tab): void {
  for (const pane of tab.panes.values()) {
    pane.fitAddon.fit()
  }
}

// ── 焦点管理 ──

/**
 * 聚焦指定面板
 *
 * 更新焦点状态，高亮显示聚焦的面板，并更新状态栏。
 *
 * @param tab - 所属的标签页
 * @param paneId - 要聚焦的面板 ID
 */
function focusPane(tab: Tab, paneId: string): void {
  // 移除旧焦点
  const old = tab.panes.get(tab.focusedPaneId)
  if (old) old.element.classList.remove('focused')

  // 设置新焦点
  tab.focusedPaneId = paneId
  const pane = tab.panes.get(paneId)
  if (pane) {
    pane.element.classList.add('focused')
    pane.terminal.focus()
  }

  // 更新状态栏
  statusShell.textContent = appConfig.general.defaultShell || 'PowerShell'
  statusCwd.textContent = appConfig.general.defaultCwd || '~'
}

/**
 * 查找相邻面板
 *
 * 在布局树中查找指定方向上的相邻面板。
 * 用于键盘快捷键切换焦点（Alt+方向键）。
 *
 * 算法思路：
 * 1. 从当前面板向上遍历树，记录路径
 * 2. 在每个层级检查是否有同方向的相邻节点
 * 3. 找到后返回该方向上最深的叶子节点
 *
 * @param root - 布局树根节点
 * @param currentPaneId - 当前面板 ID
 * @param direction - 查找方向
 * @returns 相邻面板的 ID，如果不存在返回 null
 */
function findAdjacentPane(
  root: LayoutNode,
  currentPaneId: string,
  direction: 'left' | 'right' | 'up' | 'down'
): string | null {
  // 记录从根到当前面板的路径
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

  // 从当前节点向上遍历，查找相邻节点
  for (let i = path.length - 1; i >= 0; i--) {
    const entry = path[i]
    if (!entry.parent || entry.indexInParent === undefined) continue

    const container = entry.parent
    const childIndex = entry.indexInParent

    // 判断方向是否与分割方向匹配
    const isHorizontalDir = direction === 'left' || direction === 'right'
    const isHorizontalSplit = container.direction === 'horizontal'

    if (isHorizontalDir === isHorizontalSplit) {
      // 计算目标索引
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

/**
 * 查找最深的叶子节点
 *
 * 在指定方向上查找最深的叶子节点。
 * 左/上方向：取最后一个子节点
 * 右/下方向：取第一个子节点
 *
 * @param node - 起始节点
 * @param direction - 查找方向
 * @returns 叶子节点的面板 ID
 */
function findDeepestLeaf(node: LayoutNode, direction: string): string {
  if (isLeaf(node)) return node.paneId
  const idx = (direction === 'left' || direction === 'up')
    ? node.children.length - 1
    : 0
  return findDeepestLeaf(node.children[idx], direction)
}

// ── 分屏操作 ──

/**
 * 执行分屏操作
 *
 * 在当前聚焦的面板位置进行分屏，创建新的终端面板。
 * 支持两种模式：
 * 1. 同方向分屏：在父容器中插入新面板
 * 2. 不同方向分屏：将当前面板替换为嵌套容器
 *
 * @param direction - 分屏方向：'horizontal' 为左右分屏，'vertical' 为上下分屏
 */
async function splitPane(direction: 'horizontal' | 'vertical'): Promise<void> {
  if (!activeTab) return

  const tab = activeTab
  const currentPaneId = tab.focusedPaneId

  // 创建新的终端面板
  const newPane = await createTerminalPane()
  tab.panes.set(newPane.id, newPane)

  // 查找当前面板的父容器
  const found = findParentAndIndex(tab.layout, currentPaneId)

  if (!found) {
    // 根节点是叶子：创建新的根容器
    const newLayout = makeContainer(direction, [
      makeLeaf(currentPaneId),
      makeLeaf(newPane.id)
    ])
    tab.layout = newLayout
  } else {
    const { parent, index } = found

    if (parent.direction === direction) {
      // 同方向分屏：在父容器中插入新面板
      parent.children.splice(index + 1, 0, makeLeaf(newPane.id))
      // 重新计算所有子节点的尺寸
      const count = parent.children.length
      const size = Math.floor(100 / count)
      parent.sizes = parent.children.map((_, i) =>
        i === count - 1 ? 100 - size * (count - 1) : size
      )
    } else {
      // 不同方向分屏：将当前面板替换为嵌套容器
      const newContainer = makeContainer(direction, [
        makeLeaf(currentPaneId),
        makeLeaf(newPane.id)
      ])
      parent.children[index] = newContainer
    }
  }

  // 重新渲染并聚焦新面板
  renderLayout(tab)
  focusPane(tab, newPane.id)
  scheduleSaveLayout()
}

// ── 关闭 Pane（带确认）──

/**
 * 关闭终端面板
 *
 * 流程：
 * 1. 如果是最后一个面板，关闭整个标签页
 * 2. 显示确认对话框
 * 3. 将焦点转移到相邻面板
 * 4. 从布局树中移除面板
 * 5. 销毁面板资源
 * 6. 简化布局树并重新渲染
 *
 * @param tab - 所属的标签页
 * @param paneId - 要关闭的面板 ID
 */
async function closePane(tab: Tab, paneId: string): Promise<void> {
  // 最后一个面板：关闭整个标签页
  if (tab.panes.size === 1) {
    await closeTab(tab)
    return
  }

  // 显示确认对话框
  const confirmed = await showConfirm('关闭面板', '确定要关闭当前面板吗？')
  if (!confirmed) return

  // 转移焦点到相邻面板
  if (tab.focusedPaneId === paneId) {
    const adjacent =
      findAdjacentPane(tab.layout, paneId, 'left') ??
      findAdjacentPane(tab.layout, paneId, 'right') ??
      findAdjacentPane(tab.layout, paneId, 'up') ??
      findAdjacentPane(tab.layout, paneId, 'down')
    if (adjacent) focusPane(tab, adjacent)
  }

  // 从布局树中移除
  removeFromLayout(tab.layout, paneId)

  // 销毁面板资源
  const pane = tab.panes.get(paneId)
  if (pane) {
    await destroyPane(pane)
    tab.panes.delete(paneId)
  }

  // 简化布局树并重新渲染
  simplifyLayout(tab)
  renderLayout(tab)
  scheduleSaveLayout()
}

/**
 * 从布局树中移除指定面板
 *
 * 递归查找并移除叶子节点，同时重新计算尺寸。
 * 注意：此函数直接修改传入的节点（与 shared 模块的不可变版本不同）。
 *
 * @param node - 要操作的节点
 * @param paneId - 要移除的面板 ID
 */
function removeFromLayout(node: LayoutNode, paneId: string): void {
  if (isContainer(node)) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      if (isLeaf(child) && child.paneId === paneId) {
        // 找到目标叶子，移除并重新计算尺寸
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
        // 如果子容器只剩一个节点，提升该节点
        if (child.children.length === 1) {
          node.children[i] = child.children[0]
        }
      }
    }
  }
}

/**
 * 简化布局树
 *
 * 如果根容器只有一个子节点，将子节点提升为根节点。
 * 避免不必要的嵌套层级。
 *
 * @param tab - 要简化的标签页
 */
function simplifyLayout(tab: Tab): void {
  if (isContainer(tab.layout) && tab.layout.children.length === 1) {
    tab.layout = tab.layout.children[0]
  }
}

// ── 布局序列化 ──

/**
 * 将布局节点序列化为可存储格式
 *
 * 递归遍历布局树，转换为可 JSON 序列化的格式。
 * 所有数据都被深拷贝，确保不影响运行时状态。
 *
 * @param node - 要序列化的节点
 * @returns 序列化后的节点
 */
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

/**
 * 序列化当前完整状态
 *
 * 将所有标签页、面板和窗口状态转换为可存储格式。
 * 用于布局持久化，应用重启后可恢复。
 *
 * @returns 完整的布局状态对象
 */
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

/** 保存布局的防抖定时器 */
let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 调度布局保存
 *
 * 使用防抖机制，避免频繁写入磁盘。
 * 在布局变化后 500ms 才执行实际保存。
 */
function scheduleSaveLayout(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const state = serializeCurrentState()
    window.terminalAPI.saveLayout(state)
  }, 500)
}

// ── 恢复布局 ──

/**
 * 恢复上次保存的布局
 *
 * 从磁盘加载布局状态，重建所有标签页和终端面板。
 * 恢复失败时返回 false，调用方会创建默认标签页。
 *
 * @returns Promise，成功恢复返回 true
 */
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

  // 恢复所有标签页
  for (const tabState of state.tabs) {
    await restoreTab(tabState, tabState.id === state.activeTabId)
  }

  return true
}

/**
 * 恢复单个标签页
 *
 * 流程：
 * 1. 为每个面板创建新的终端实例
 * 2. 建立旧 ID 到新 ID 的映射
 * 3. 重映射布局树中的面板 ID
 * 4. 创建标签页 DOM 结构
 * 5. 渲染布局并切换到激活状态
 *
 * @param tabState - 标签状态数据
 * @param isActive - 是否为激活的标签页
 */
async function restoreTab(tabState: TabState, isActive: boolean): Promise<void> {
  // 创建所有终端面板
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

  // 建立旧 ID 到新 ID 的映射
  const oldToNewId = new Map<string, string>()
  const paneEntries = Array.from(paneMap.entries())
  for (let i = 0; i < tabState.panes.length && i < paneEntries.length; i++) {
    oldToNewId.set(tabState.panes[i].id, paneEntries[i][1].id)
  }

  /**
   * 重映射布局树中的面板 ID
   *
   * 将存储的旧 ID 替换为新创建的面板 ID。
   */
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

  // 创建标签内容容器
  const containerEl = document.createElement('div')
  containerEl.className = 'tab-content'
  containerEl.style.width = '100%'
  containerEl.style.height = '100%'
  containerEl.style.display = 'none'

  // 重建面板映射（使用新 ID）
  const newPaneMap = new Map<string, Pane>()
  for (const [, pane] of paneMap) {
    newPaneMap.set(pane.id, pane)
  }

  // 创建标签对象
  const tab: Tab = {
    id: tabState.id,
    title: tabState.title,
    layout,
    panes: newPaneMap,
    focusedPaneId,
    containerEl,
    tabEl: null as unknown as HTMLElement
  }

  // 创建标签页签 DOM
  const tabEl = document.createElement('div')
  tabEl.className = 'tab'
  tabEl.innerHTML = `<span class="tab-title">${escapeHtml(tabState.title)}</span><span class="tab-close">×</span>`
  tab.tabEl = tabEl

  tabs.push(tab)

  // 绑定标签点击事件
  tabEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('tab-close')) return
    switchTab(tab)
  })

  // 绑定关闭按钮事件
  tabEl.querySelector('.tab-close')!.addEventListener('click', (e) => {
    e.stopPropagation()
    closeTab(tab)
  })

  // 添加到 DOM
  tabBar.insertBefore(tabEl, tabAddBtn)
  terminalContainer.appendChild(containerEl)

  // 渲染布局
  renderLayout(tab)

  // 如果是激活标签，切换到该标签
  if (isActive) {
    switchTab(tab)
  }
}

// ── 标签操作 ──

/**
 * 添加新标签页
 *
 * 创建一个新的标签页，包含一个终端面板。
 * 如果提供了工作目录，终端会在该目录下启动。
 *
 * @param cwd - 工作目录（可选）
 */
async function addTab(cwd?: string): Promise<void> {
  const pane = await createTerminalPane(cwd ? { cwd } : undefined)
  // 生成标签标题：使用目录名或递增编号
  const title = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() || `终端 ${++tabIndex}` : `终端 ${++tabIndex}`
  const id = `tab_${Date.now()}`

  // 创建标签内容容器
  const containerEl = document.createElement('div')
  containerEl.className = 'tab-content'
  containerEl.style.width = '100%'
  containerEl.style.height = '100%'
  containerEl.style.display = 'none'

  // 创建标签对象
  const tab: Tab = {
    id,
    title,
    layout: makeLeaf(pane.id),
    panes: new Map([[pane.id, pane]]),
    focusedPaneId: pane.id,
    containerEl,
    tabEl: null as unknown as HTMLElement
  }

  // 创建标签页签 DOM
  const tabEl = document.createElement('div')
  tabEl.className = 'tab'
  tabEl.innerHTML = `<span class="tab-title">${title}</span><span class="tab-close">×</span>`
  tab.tabEl = tabEl

  tabs.push(tab)

  // 绑定标签点击事件
  tabEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('tab-close')) return
    switchTab(tab)
  })

  // 绑定关闭按钮事件
  tabEl.querySelector('.tab-close')!.addEventListener('click', (e) => {
    e.stopPropagation()
    closeTab(tab)
  })

  // 添加到 DOM
  tabBar.insertBefore(tabEl, tabAddBtn)
  terminalContainer.appendChild(containerEl)

  // 渲染布局并切换到新标签
  renderLayout(tab)
  switchTab(tab)
  scheduleSaveLayout()
}

/**
 * 切换到指定标签页
 *
 * 隐藏其他标签页，显示目标标签页，更新焦点和状态栏。
 *
 * @param tab - 目标标签页
 */
function switchTab(tab: Tab): void {
  if (activeTab?.id === tab.id) return

  // 隐藏所有标签页
  for (const t of tabs) {
    t.containerEl.style.display = 'none'
    t.tabEl.classList.remove('active')
  }

  // 显示目标标签页
  tab.containerEl.style.display = 'block'
  tab.tabEl.classList.add('active')
  activeTab = tab

  // 调整面板大小并聚焦
  fitAllPanes(tab)
  const focused = tab.panes.get(tab.focusedPaneId)
  if (focused) focused.terminal.focus()

  // 更新状态栏
  statusShell.textContent = appConfig.general.defaultShell || 'PowerShell'
  statusCwd.textContent = appConfig.general.defaultCwd || '~'
  scheduleSaveLayout()
}

/**
 * 关闭标签页
 *
 * 流程：
 * 1. 显示确认对话框（如果有多个标签）
 * 2. 销毁所有终端面板
 * 3. 移除 DOM 元素
 * 4. 切换到相邻标签页
 * 5. 如果没有标签页了，创建新的默认标签页
 *
 * @param tab - 要关闭的标签页
 */
async function closeTab(tab: Tab): Promise<void> {
  const index = tabs.indexOf(tab)
  if (index === -1) return

  // 如果有多个标签，显示确认对话框
  if (tabs.length > 1) {
    const confirmed = await showConfirm('关闭标签', `确定要关闭标签"${tab.title}"吗？`)
    if (!confirmed) return
  }

  // 销毁所有终端面板
  for (const pane of tab.panes.values()) {
    await destroyPane(pane)
  }

  // 移除 DOM 元素
  tab.tabEl.remove()
  tab.containerEl.remove()
  tabs.splice(index, 1)

  // 切换到相邻标签页
  if (activeTab?.id === tab.id) {
    activeTab = null
    if (tabs.length > 0) {
      switchTab(tabs[Math.min(index, tabs.length - 1)])
    }
  }

  // 如果没有标签页了，创建新的默认标签页
  if (tabs.length === 0) {
    await addTab()
  }

  scheduleSaveLayout()
}

/**
 * 切换到下一个标签页
 *
 * 循环切换，到最后一个标签后回到第一个。
 */
function switchToNextTab(): void {
  if (tabs.length <= 1) return
  const index = activeTab ? tabs.indexOf(activeTab) : -1
  switchTab(tabs[(index + 1) % tabs.length])
}

/**
 * 切换到上一个标签页
 *
 * 循环切换，到第一个标签后跳到最后一个。
 */
function switchToPrevTab(): void {
  if (tabs.length <= 1) return
  const index = activeTab ? tabs.indexOf(activeTab) : 0
  switchTab(tabs[(index - 1 + tabs.length) % tabs.length])
}

/**
 * 关闭当前聚焦的面板
 */
async function closeCurrentPane(): Promise<void> {
  if (!activeTab) return
  await closePane(activeTab, activeTab.focusedPaneId)
}

/**
 * 将焦点移动到指定方向的相邻面板
 *
 * @param direction - 移动方向
 */
function focusDirection(direction: 'left' | 'right' | 'up' | 'down'): void {
  if (!activeTab) return
  const adjacent = findAdjacentPane(activeTab.layout, activeTab.focusedPaneId, direction)
  if (adjacent) focusPane(activeTab, adjacent)
}

// ── 设置管理 ──

/**
 * 从主进程加载配置
 */
async function loadConfig(): Promise<void> {
  appConfig = await window.terminalAPI.loadConfig()
}

/**
 * 打开设置对话框
 *
 * 将当前配置值填充到表单中。
 */
function openSettings(): void {
  settingShell.value = appConfig.general.defaultShell
  settingCwd.value = appConfig.general.defaultCwd
  settingFontSize.value = String(appConfig.general.fontSize)
  settingScrollback.value = String(appConfig.general.scrollback)
  settingTheme.value = appConfig.general.theme
  settingsOverlay.classList.add('visible')
}

/**
 * 关闭设置对话框
 */
function closeSettings(): void {
  settingsOverlay.classList.remove('visible')
}

/**
 * 保存设置
 *
 * 从表单读取值，校验后保存到主进程。
 * 部分设置（如字体大小、主题）需要重启才能生效。
 */
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

/**
 * 从主进程加载项目列表
 */
async function loadProjects(): Promise<void> {
  projects = await window.terminalAPI.listProjects()
  renderProjectList()
}

/**
 * 渲染项目列表
 *
 * 在侧边栏中显示所有项目，每个项目提供以下操作：
 * - 点击名称：在新标签中打开
 * - 水平分屏按钮：在当前标签水平分屏打开
 * - 垂直分屏按钮：在当前标签垂直分屏打开
 * - 删除按钮：从项目列表中移除
 */
function renderProjectList(): void {
  projectList.innerHTML = ''

  // 空列表提示
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

    // 点击项目名称：在新标签中打开
    item.querySelector('.project-name')!.addEventListener('click', () => {
      addTab(project.path)
    })

    // 操作按钮事件
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

/**
 * 在分屏中打开项目
 *
 * 如果没有激活的标签页，直接在新标签中打开。
 * 否则在当前标签页中进行分屏操作。
 *
 * @param projectPath - 项目路径
 * @param direction - 分屏方向
 */
async function openProjectInSplit(projectPath: string, direction: 'horizontal' | 'vertical'): Promise<void> {
  if (!activeTab) {
    await addTab(projectPath)
    return
  }

  const tab = activeTab
  const currentPaneId = tab.focusedPaneId

  // 创建新终端面板
  const newPane = await createTerminalPane({ cwd: projectPath })
  tab.panes.set(newPane.id, newPane)

  // 查找父容器并更新布局
  const found = findParentAndIndex(tab.layout, currentPaneId)

  if (!found) {
    // 根节点是叶子：创建新的根容器
    tab.layout = makeContainer(direction, [
      makeLeaf(currentPaneId),
      makeLeaf(newPane.id)
    ])
  } else {
    const { parent, index } = found
    if (parent.direction === direction) {
      // 同方向分屏：在父容器中插入新面板
      parent.children.splice(index + 1, 0, makeLeaf(newPane.id))
      const count = parent.children.length
      const size = Math.floor(100 / count)
      parent.sizes = parent.children.map((_, i) =>
        i === count - 1 ? 100 - size * (count - 1) : size
      )
    } else {
      // 不同方向分屏：将当前面板替换为嵌套容器
      parent.children[index] = makeContainer(direction, [
        makeLeaf(currentPaneId),
        makeLeaf(newPane.id)
      ])
    }
  }

  // 重新渲染并聚焦新面板
  renderLayout(tab)
  focusPane(tab, newPane.id)
  scheduleSaveLayout()
}

/**
 * 添加新项目
 *
 * 打开目录选择对话框，选择后添加到项目列表。
 */
async function addProject(): Promise<void> {
  const result = await window.terminalAPI.addProject()
  if (result.success) {
    await loadProjects()
    showNotification('项目已添加', 'success')
  } else if (result.error && result.error !== '已取消') {
    showNotification('添加项目失败：' + result.error, 'error')
  }
}

/**
 * 移除项目
 *
 * @param projectId - 要移除的项目 ID
 */
async function removeProject(projectId: string): Promise<void> {
  const result = await window.terminalAPI.removeProject(projectId)
  if (result.success) {
    await loadProjects()
    showNotification('项目已移除', 'success')
  }
}

// ── 侧边栏宽度持久化 ──

/**
 * 初始化侧边栏拖拽调整宽度功能
 *
 * 实现逻辑：
 * 1. 监听侧边栏右边框 4px 范围内的 mousedown 事件
 * 2. 鼠标移动时实时更新侧边栏宽度
 * 3. 鼠标释放时保存新的宽度到布局状态
 *
 * 宽度限制在 150px - 400px 之间。
 */
function initSidebarResize(): void {
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
    // 限制宽度范围
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

// 标签操作
tabAddBtn.addEventListener('click', () => addTab())
btnAddProject.addEventListener('click', () => addProject())

// 设置对话框
settingsClose.addEventListener('click', closeSettings)
settingsCancel.addEventListener('click', closeSettings)
settingsSave.addEventListener('click', saveSettings)
// 点击遮罩层关闭设置对话框
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

// ── 快捷键 ──

/**
 * 键盘快捷键处理
 *
 * 支持的快捷键：
 * - Ctrl+T：新建标签
 * - Ctrl+W：关闭当前面板
 * - Ctrl+Tab / Ctrl+Shift+Tab：切换标签
 * - Ctrl+1-9：切换到指定索引的标签
 * - Alt+Shift+-：水平分屏
 * - Alt+Shift+=：垂直分屏
 * - Alt+方向键：切换焦点到相邻面板
 * - Alt+Shift+W：关闭当前面板
 * - Ctrl+,：打开设置
 * - Escape：关闭对话框
 */
document.addEventListener('keydown', (e) => {
  // Ctrl+T：新建标签
  if (e.ctrlKey && !e.shiftKey && e.key === 't') {
    e.preventDefault()
    addTab()
  }
  // Ctrl+W：关闭当前面板
  if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
    e.preventDefault()
    closeCurrentPane()
  }
  // Ctrl+Tab：切换标签
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) switchToPrevTab()
    else switchToNextTab()
  }
  // Ctrl+1-9：切换到指定标签
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    const index = parseInt(e.key) - 1
    if (index < tabs.length) switchTab(tabs[index])
  }
  // Alt+Shift+-：水平分屏
  if (e.altKey && e.shiftKey && e.key === '-') {
    e.preventDefault()
    splitPane('horizontal')
  }
  // Alt+Shift+=：垂直分屏
  if (e.altKey && e.shiftKey && e.key === '=') {
    e.preventDefault()
    splitPane('vertical')
  }
  // Alt+方向键：切换焦点
  if (e.altKey && !e.shiftKey) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); focusDirection('left') }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusDirection('right') }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusDirection('up') }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusDirection('down') }
  }
  // Alt+Shift+W：关闭当前面板
  if (e.altKey && e.shiftKey && e.key === 'W') {
    e.preventDefault()
    closeCurrentPane()
  }
  // Ctrl+,：打开设置
  if (e.ctrlKey && e.key === ',') {
    e.preventDefault()
    openSettings()
  }
  // Escape：关闭对话框
  if (e.key === 'Escape') {
    if (settingsOverlay.classList.contains('visible')) {
      closeSettings()
    } else if (confirmOverlay.classList.contains('visible')) {
      handleConfirmCancel()
    }
  }
})

// 窗口大小改变时调整面板大小
window.addEventListener('resize', () => {
  if (activeTab) fitAllPanes(activeTab)
})

// ── 初始化 ──

/**
 * 应用初始化入口
 *
 * 初始化流程：
 * 1. 加载配置
 * 2. 加载项目列表
 * 3. 初始化侧边栏拖拽功能
 * 4. 尝试恢复上次的布局状态
 * 5. 如果恢复失败，创建默认标签页
 * 6. 隐藏加载提示
 */
async function main(): Promise<void> {
  try {
    await loadConfig()
    await loadProjects()
    initSidebarResize()

    // 尝试恢复布局
    const restored = await restoreLayout()

    // 恢复失败：创建默认标签页
    if (!restored) {
      await addTab()
    }

    // 隐藏加载提示
    loading.classList.add('hidden')
  } catch (err) {
    console.error('初始化终端失败：', err)
    loading.textContent = `错误：${err instanceof Error ? err.message : '未知错误'}`
  }
}

// 启动应用
main()
