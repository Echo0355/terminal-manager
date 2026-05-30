/**
 * 预加载脚本类型声明
 *
 * 定义 window.terminalAPI 的完整类型接口。
 * 渲染进程通过此类型获得完整的类型检查和代码补全。
 *
 * 此文件通过 TypeScript 的声明合并机制扩展 Window 接口，
 * 使 window.terminalAPI 成为全局可用的类型化 API。
 */

/**
 * 项目数据接口
 *
 * 表示用户收藏的项目目录。
 */
export interface Project {
  /** 项目唯一标识符 */
  id: string
  /** 项目显示名称 */
  name: string
  /** 项目绝对路径 */
  path: string
}

/**
 * 面板状态接口
 *
 * 记录终端面板的配置信息，用于布局持久化。
 */
export interface PaneState {
  /** 面板 ID */
  id: string
  /** Shell 可执行文件路径 */
  shell: string
  /** 工作目录 */
  cwd: string
}

/**
 * 布局状态节点接口
 *
 * 递归定义布局树的序列化格式。
 */
export interface LayoutStateNode {
  /** 节点类型 */
  type: 'container' | 'leaf'
  /** 分割方向（仅容器节点） */
  direction?: 'horizontal' | 'vertical'
  /** 子节点数组（仅容器节点） */
  children?: LayoutStateNode[]
  /** 子节点尺寸数组（仅容器节点） */
  sizes?: number[]
  /** 面板 ID（仅叶子节点） */
  paneId?: string
}

/**
 * 标签状态接口
 *
 * 记录标签页的完整状态。
 */
export interface TabState {
  /** 标签 ID */
  id: string
  /** 标签标题 */
  title: string
  /** 当前聚焦的面板 ID */
  activePaneId: string
  /** 布局树结构 */
  layout: LayoutStateNode
  /** 所有面板的状态列表 */
  panes: PaneState[]
}

/**
 * 完整布局状态接口
 *
 * 记录整个应用的布局状态。
 */
export interface LayoutState {
  /** 状态格式版本号 */
  version: string
  /** 所有标签的状态列表 */
  tabs: TabState[]
  /** 当前激活的标签 ID */
  activeTabId: string
  /** 窗口状态（可选） */
  windowState?: {
    /** 侧边栏宽度（像素） */
    sidebarWidth: number
  }
}

/**
 * 应用配置接口
 *
 * 包含所有可配置的选项。
 */
export interface Config {
  general: {
    /** 默认 Shell 可执行文件路径 */
    defaultShell: string
    /** 默认工作目录 */
    defaultCwd: string
    /** 终端字体大小（像素） */
    fontSize: number
    /** 界面主题 */
    theme: 'dark' | 'light'
    /** 滚动缓冲区行数 */
    scrollback: number
  }
}

/**
 * Shell 信息接口
 *
 * 描述系统中可用的 Shell 程序。
 */
export interface ShellInfo {
  /** Shell 显示名称 */
  name: string
  /** Shell 可执行文件路径 */
  path: string
  /** 启动参数（可选） */
  args?: string[]
}

/**
 * 终端 API 接口
 *
 * 定义渲染进程可调用的所有方法。
 * 通过 contextBridge 暴露为 window.terminalAPI。
 */
export interface TerminalAPI {
  // ── 终端管理 ──

  /**
   * 创建新的终端会话
   *
   * @param options - 创建选项
   * @returns Promise 包含会话 ID 和 Shell 信息
   */
  createTerminal: (options: {
    shell?: string
    cwd?: string
    cols?: number
    rows?: number
  }) => Promise<{
    success: boolean
    id?: string
    shell?: string
    cwd?: string
    error?: string
  }>

  /**
   * 向终端写入数据
   *
   * @param id - 会话 ID
   * @param data - 要写入的数据
   */
  writeToTerminal: (id: string, data: string) => void

  /**
   * 调整终端大小
   *
   * @param id - 会话 ID
   * @param cols - 新的列数
   * @param rows - 新的行数
   */
  resizeTerminal: (id: string, cols: number, rows: number) => void

  /**
   * 关闭终端会话
   *
   * @param id - 会话 ID
   * @returns Promise 包含操作结果
   */
  closeTerminal: (id: string) => Promise<{ success: boolean; error?: string }>

  /**
   * 监听终端输出数据
   *
   * @param id - 会话 ID
   * @param callback - 接收数据的回调函数
   * @returns 清理函数
   */
  onTerminalData: (id: string, callback: (data: string) => void) => () => void

  /**
   * 监听终端退出事件
   *
   * @param id - 会话 ID
   * @param callback - 接收退出码的回调函数
   * @returns 清理函数
   */
  onTerminalExit: (id: string, callback: (exitCode: number) => void) => () => void

  /**
   * 监听终端错误事件
   *
   * @param id - 会话 ID
   * @param callback - 接收错误信息的回调函数
   * @returns 清理函数
   */
  onTerminalError: (id: string, callback: (error: string) => void) => () => void

  // ── 菜单事件 ──

  /**
   * 监听菜单事件
   *
   * @param channel - 事件通道名称
   * @param callback - 事件回调函数
   * @returns 清理函数
   */
  onMenuEvent: (channel: string, callback: () => void) => () => void

  // ── 项目管理 ──

  /**
   * 获取项目列表
   *
   * @returns Promise 包含所有项目的数组
   */
  listProjects: () => Promise<Project[]>

  /**
   * 添加新项目
   *
   * @param projectPath - 项目路径（可选）
   * @returns Promise 包含操作结果和新项目信息
   */
  addProject: (projectPath?: string) => Promise<{
    success: boolean
    project?: Project
    error?: string
  }>

  /**
   * 删除项目
   *
   * @param projectId - 项目 ID
   * @returns Promise 包含操作结果
   */
  removeProject: (projectId: string) => Promise<{ success: boolean; error?: string }>

  /**
   * 打开目录选择对话框
   *
   * @returns Promise 包含选择的目录路径
   */
  selectDirectory: () => Promise<string | null>

  // ── 布局状态 ──

  /**
   * 加载布局状态
   *
   * @returns Promise 包含布局状态对象
   */
  loadLayout: () => Promise<LayoutState | null>

  /**
   * 保存布局状态
   *
   * @param state - 布局状态对象
   */
  saveLayout: (state: LayoutState) => void

  // ── 配置管理 ──

  /**
   * 加载应用配置
   *
   * @returns Promise 包含配置对象
   */
  loadConfig: () => Promise<Config>

  /**
   * 保存应用配置
   *
   * @param config - 配置对象
   * @returns Promise 包含操作结果
   */
  saveConfig: (config: Config) => Promise<{ success: boolean; error?: string }>

  // ── Shell 列表 ──

  /**
   * 获取系统中可用的 Shell 列表
   *
   * @returns Promise 包含 Shell 信息数组
   */
  listShells: () => Promise<ShellInfo[]>

  /**
   * 同步主题到主进程（更新原生标题栏颜色）
   *
   * @param theme - 主题名称
   */
  setTheme: (theme: 'dark' | 'light') => void
}

/**
 * 扩展 Window 接口
 *
 * 通过声明合并使 window.terminalAPI 成为全局类型化的 API。
 * 渲染进程可以直接使用 window.terminalAPI 而无需类型断言。
 */
declare global {
  interface Window {
    /** 终端管理 API，通过预加载脚本注入 */
    terminalAPI: TerminalAPI
  }
}
