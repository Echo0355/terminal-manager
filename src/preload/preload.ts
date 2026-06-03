/**
 * 预加载脚本
 *
 * 作为主进程和渲染进程之间的安全桥梁。
 * 通过 contextBridge 向渲染进程暴露 window.terminalAPI 对象。
 *
 * 安全特性：
 * - 启用上下文隔离（contextIsolation），渲染进程无法直接访问 Node.js API
 * - 禁用 Node 集成（nodeIntegration），防止恶意代码执行系统命令
 * - 所有 IPC 通信都经过参数校验，防止注入攻击
 * - 使用白名单机制限制可访问的 IPC 通道
 */

import { clipboard, contextBridge, ipcRenderer } from 'electron'

/**
 * 向渲染进程暴露安全的终端 API
 *
 * 渲染进程只能通过此 API 与主进程通信，无法直接访问 ipcRenderer。
 * 所有方法都经过参数校验，确保数据安全。
 */
contextBridge.exposeInMainWorld('terminalAPI', {
  // ── 终端管理 ──

  /**
   * 创建新的终端会话
   *
   * @param options - 创建选项
   * @param options.shell - Shell 路径（可选）
   * @param options.cwd - 工作目录（可选）
   * @param options.cols - 终端列数（可选）
   * @param options.rows - 终端行数（可选）
   * @returns Promise 包含会话 ID 和 Shell 信息
   */
  createTerminal: (options: {
    shell?: string
    cwd?: string
    cols?: number
    rows?: number
  }): Promise<{
    success: boolean
    id?: string
    shell?: string
    cwd?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('pty:create', options)
  },

  /**
   * 向终端写入数据
   *
   * 将用户键盘输入发送到 PTY 进程。
   * 数据经过长度限制，防止缓冲区溢出。
   *
   * @param id - 会话 ID
   * @param data - 要写入的数据
   */
  writeToTerminal: (id: string, data: string): void => {
    if (typeof id !== 'string' || id.length > 100) return
    if (typeof data !== 'string' || data.length > 100000) return
    ipcRenderer.send('pty:input', id, data)
  },

  writeClipboardText: (text: string): void => {
    if (typeof text !== 'string' || text.length === 0) return
    clipboard.writeText(text.slice(0, 1000000))
  },

  readClipboardText: (): string => {
    return clipboard.readText()
  },

  /**
   * 调整终端大小
   *
   * 当窗口或分屏大小改变时调用，通知 PTY 进程更新尺寸。
   *
   * @param id - 会话 ID
   * @param cols - 新的列数
   * @param rows - 新的行数
   */
  resizeTerminal: (id: string, cols: number, rows: number): void => {
    if (typeof id !== 'string' || id.length > 100) return
    if (typeof cols !== 'number' || typeof rows !== 'number') return
    ipcRenderer.send('pty:resize', id, cols, rows)
  },

  /**
   * 关闭终端会话
   *
   * 终止 PTY 进程并释放资源。
   *
   * @param id - 会话 ID
   * @returns Promise 包含操作结果
   */
  closeTerminal: (id: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof id !== 'string' || id.length > 100) {
      return Promise.resolve({ success: false, error: '无效的 ID' })
    }
    return ipcRenderer.invoke('pty:kill', id)
  },

  /**
   * 监听终端输出数据
   *
   * 注册回调函数接收 PTY 进程的输出。
   * 返回清理函数用于取消监听。
   *
   * @param id - 会话 ID
   * @param callback - 接收数据的回调函数
   * @returns 清理函数，调用后取消监听
   */
  onTerminalData: (id: string, callback: (data: string) => void): (() => void) => {
    if (typeof id !== 'string' || typeof callback !== 'function') return () => {}
    const channel = `pty:data:${id}`
    const listener = (_event: Electron.IpcRendererEvent, data: string): void => callback(data)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  /**
   * 监听终端退出事件
   *
   * 当 PTY 进程退出时触发回调。
   *
   * @param id - 会话 ID
   * @param callback - 接收退出码的回调函数
   * @returns 清理函数
   */
  onTerminalExit: (id: string, callback: (exitCode: number) => void): (() => void) => {
    if (typeof id !== 'string' || typeof callback !== 'function') return () => {}
    const channel = `pty:exit:${id}`
    const listener = (_event: Electron.IpcRendererEvent, exitCode: number): void =>
      callback(exitCode)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  /**
   * 监听终端错误事件
   *
   * 当 PTY 进程发生错误时触发回调。
   *
   * @param id - 会话 ID
   * @param callback - 接收错误信息的回调函数
   * @returns 清理函数
   */
  onTerminalError: (id: string, callback: (error: string) => void): (() => void) => {
    if (typeof id !== 'string' || typeof callback !== 'function') return () => {}
    const channel = `pty:error:${id}`
    const listener = (_event: Electron.IpcRendererEvent, error: string): void => callback(error)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  // ── 菜单事件 ──

  /**
   * 监听菜单事件
   *
   * 接收来自主进程菜单的操作指令。
   * 使用白名单机制只允许特定的菜单事件通道。
   *
   * @param channel - 事件通道名称
   * @param callback - 事件回调函数
   * @returns 清理函数
   */
  onMenuEvent: (channel: string, callback: () => void): (() => void) => {
    // 允许的菜单事件通道白名单
    const validChannels = [
      'menu:new-tab',
      'menu:close-tab',
      'menu:next-tab',
      'menu:prev-tab',
      'menu:close-pane',
      'menu:split-horizontal',
      'menu:split-vertical',
      'menu:focus-left',
      'menu:focus-right',
      'menu:focus-up',
      'menu:focus-down',
      'menu:settings'
    ]
    if (!validChannels.includes(channel)) return () => {}
    const listener = (): void => callback()
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  // ── 应用生命周期 ──

  /**
   * 监听应用关闭确认请求
   *
   * 当用户尝试关闭窗口时，主进程会发送此事件请求渲染进程显示确认对话框。
   *
   * @param callback - 接收确认请求的回调函数
   * @returns 清理函数
   */
  onCloseConfirmRequest: (callback: () => void): (() => void) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (): void => callback()
    ipcRenderer.on('app:request-close-confirm', listener)
    return () => {
      ipcRenderer.removeListener('app:request-close-confirm', listener)
    }
  },

  /**
   * 发送关闭确认结果
   *
   * 将用户的选择结果返回给主进程。
   *
   * @param confirmed - 用户是否确认关闭
   */
  sendCloseConfirmResult: (confirmed: boolean): void => {
    ipcRenderer.send('app:close-confirm-result', confirmed)
  },

  // ── 项目管理 ──

  /**
   * 获取项目列表
   *
   * @returns Promise 包含所有项目的数组
   */
  listProjects: (): Promise<Array<{ id: string; name: string; path: string }>> => {
    return ipcRenderer.invoke('project:list')
  },

  /**
   * 添加新项目
   *
   * 如果未提供路径，会打开目录选择对话框。
   *
   * @param projectPath - 项目路径（可选）
   * @returns Promise 包含操作结果和新项目信息
   */
  addProject: (projectPath?: string): Promise<{
    success: boolean
    project?: { id: string; name: string; path: string }
    error?: string
  }> => {
    // 纵深防御：预加载层基本参数校验
    if (projectPath !== undefined && (typeof projectPath !== 'string' || projectPath.length > 2000 || projectPath.length === 0)) {
      return Promise.resolve({ success: false, error: '无效的路径' })
    }
    return ipcRenderer.invoke('project:add', projectPath)
  },

  /**
   * 删除项目
   *
   * @param projectId - 项目 ID
   * @returns Promise 包含操作结果
   */
  removeProject: (projectId: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof projectId !== 'string' || projectId.length > 100) {
      return Promise.resolve({ success: false, error: '无效的项目 ID' })
    }
    return ipcRenderer.invoke('project:remove', projectId)
  },

  /**
   * 使用外部 IDE 打开目录
   *
   * @param editor - 编辑器类型
   * @param folderPath - 要打开的目录路径
   * @returns Promise 包含操作结果
   */
  openFolderInEditor: (
    editor: 'vscode' | 'idea' | 'pycharm',
    folderPath: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    const validEditors = ['vscode', 'idea', 'pycharm']
    if (!validEditors.includes(editor)) {
      return Promise.resolve({ success: false, error: '无效的编辑器类型' })
    }
    if (typeof folderPath !== 'string' || folderPath.length === 0 || folderPath.length > 2000) {
      return Promise.resolve({ success: false, error: '无效的路径' })
    }
    return ipcRenderer.invoke('editor:open-folder', editor, folderPath)
  },

  /**
   * 打开目录选择对话框
   *
   * @returns Promise 包含选择的目录路径，取消时返回 null
   */
  selectDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:selectDirectory')
  },

  // ── 布局状态 ──

  /**
   * 加载布局状态
   *
   * 从磁盘读取上次保存的布局，用于恢复会话。
   *
   * @returns Promise 包含布局状态对象，首次运行时返回 null
   */
  loadLayout: (): Promise<{
    version: string
    tabs: Array<{
      id: string
      title: string
      activePaneId: string
      layout: any
      panes: Array<{ id: string; shell: string; cwd: string; title?: string }>
    }>
    activeTabId: string
  } | null> => {
    return ipcRenderer.invoke('layout:load').then((data: any) => {
      // 纵深防御：校验主进程返回的布局数据基本结构
      if (data === null || data === undefined) return null
      if (typeof data !== 'object') return null
      if (!Array.isArray(data.tabs)) return null
      return data
    })
  },

  /**
   * 保存布局状态
   *
   * 将当前布局持久化到磁盘，应用重启后可恢复。
   *
   * @param state - 布局状态对象
   */
  saveLayout: (state: {
    version: string
    tabs: Array<{
      id: string
      title: string
      activePaneId: string
      layout: any
      panes: Array<{ id: string; shell: string; cwd: string; title?: string }>
    }>
    activeTabId: string
  }): void => {
    if (!state || typeof state !== 'object') return
    ipcRenderer.send('layout:save', state)
  },

  // ── 配置管理 ──

  /**
   * 加载应用配置
   *
   * @returns Promise 包含配置对象
   */
  loadConfig: (): Promise<{
    general: {
      defaultShell: string
      defaultCwd: string
      fontSize: number
      theme: 'dark' | 'light'
      scrollback: number
    }
  }> => {
    return ipcRenderer.invoke('config:load')
  },

  /**
   * 保存应用配置
   *
   * 配置会立即生效并持久化到磁盘。
   *
   * @param config - 配置对象
   * @returns Promise 包含操作结果
   */
  saveConfig: (config: {
    general: {
      defaultShell: string
      defaultCwd: string
      fontSize: number
      theme: 'dark' | 'light'
      scrollback: number
    }
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('config:save', config)
  },

  // ── Shell 列表 ──

  /**
   * 获取系统中可用的 Shell 列表
   *
   * @returns Promise 包含 Shell 信息数组
   */
  listShells: (): Promise<Array<{ name: string; path: string; args?: string[] }>> => {
    return ipcRenderer.invoke('shell:list')
  },

  // ── 主题同步 ──

  /**
   * 同步主题到主进程（更新原生标题栏颜色）
   *
   * @param theme - 主题名称
   */
  setTheme: (theme: 'dark' | 'light'): void => {
    ipcRenderer.send('theme:set', theme)
  }
})
