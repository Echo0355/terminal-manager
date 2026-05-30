/**
 * 主进程入口
 *
 * Electron 主进程，负责：
 * 1. PTY（伪终端）会话管理 - 通过 node-pty 创建和管理终端进程
 * 2. IPC 通信处理 - 接收渲染进程的请求并执行相应操作
 * 3. 应用生命周期管理 - 窗口创建、菜单配置、应用退出
 * 4. 数据持久化 - 配置、项目列表、布局状态的 JSON 文件存储
 * 5. Shell 检测 - 自动检测系统中可用的 Shell 程序
 *
 * 数据存储位置：%APPDATA%/terminal-manager/（Windows）或 ~/.config/terminal-manager/（Linux/macOS）
 */

import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join, basename } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, accessSync, constants } from 'fs'
import { is } from '@electron-toolkit/utils'
import * as pty from 'node-pty'

// PTY session management

/**
 * PTY 会话接口
 *
 * 表示一个活跃的终端会话，包含进程实例和元数据。
 * 会话存储在内存中的 Map 里，应用退出时自动清理。
 */
interface PtySession {
  /** 会话唯一标识符 */
  id: string
  /** node-pty 进程实例 */
  pty: pty.IPty
  /** 使用的 Shell 可执行文件路径 */
  shell: string
  /** 当前工作目录 */
  cwd: string
}

/** 活跃的 PTY 会话映射表，key 为会话 ID */
const sessions = new Map<string, PtySession>()
/** 主窗口实例 */
let mainWindow: BrowserWindow | null = null

// ── Shell 白名单 ──

/**
 * Shell 信息接口
 *
 * 描述一个可用的 Shell 程序，包括名称、路径和启动参数。
 */
interface ShellInfo {
  /** Shell 显示名称，如 'PowerShell'、'Git Bash' */
  name: string
  /** Shell 可执行文件的绝对路径 */
  path: string
  /** 启动参数数组，如 Git Bash 需要 ['--login', '-i'] */
  args?: string[]
}

/** 系统中检测到的可用 Shell 列表 */
let detectedShells: ShellInfo[] = []

/**
 * 检测系统中可用的 Shell 程序
 *
 * 根据操作系统自动扫描常见的 Shell 安装位置。
 * Windows：PowerShell、CMD、Git Bash、WSL
 * macOS/Linux：zsh、bash、sh、fish（包括 Homebrew 安装的 fish）
 *
 * @returns 检测到的 Shell 信息数组
 */
function detectShells(): ShellInfo[] {
  const shells: ShellInfo[] = []

  if (process.platform === 'win32') {
    // PowerShell - Windows 默认 Shell
    shells.push({ name: 'PowerShell', path: 'powershell.exe' })
    // CMD - 传统命令提示符
    const comspec = process.env.COMSPEC || 'cmd.exe'
    shells.push({ name: 'CMD', path: comspec })
    // Git Bash - 需要 Git for Windows 已安装
    const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe'
    if (existsSync(gitBash)) {
      shells.push({ name: 'Git Bash', path: gitBash, args: ['--login', '-i'] })
    }
    // WSL - Windows Subsystem for Linux
    const wsl = 'C:\\Windows\\System32\\wsl.exe'
    if (existsSync(wsl)) {
      shells.push({ name: 'WSL', path: wsl })
    }
  } else {
    // macOS / Linux - 按优先级检测常见 Shell
    const shellPaths = ['/bin/zsh', '/bin/bash', '/bin/sh', '/usr/bin/fish']
    for (const sp of shellPaths) {
      if (existsSync(sp)) {
        shells.push({ name: basename(sp), path: sp })
      }
    }
    // Homebrew 安装的 fish（macOS Apple Silicon）
    const homebrewFish = '/opt/homebrew/bin/fish'
    if (existsSync(homebrewFish)) {
      shells.push({ name: 'fish', path: homebrewFish })
    }
  }

  return shells
}

/**
 * 检查 Shell 是否在白名单中
 *
 * 安全机制：只允许使用检测到的 Shell 或配置中指定的默认 Shell，
 * 防止恶意代码通过 IPC 请求执行任意程序。
 *
 * @param shellPath - 要检查的 Shell 路径
 * @returns 如果允许使用返回 true
 */
function isShellAllowed(shellPath: string): boolean {
  // 检查是否在检测到的白名单中
  if (detectedShells.some((s) => s.path === shellPath)) return true
  // 检查是否在配置的默认 shell 中
  if (appConfig.general.defaultShell === shellPath) return true
  return false
}

/**
 * 解析并验证 Shell 路径
 *
 * 确定要使用的 Shell，优先使用请求的 Shell，其次使用配置的默认 Shell。
 * 如果请求的 Shell 不在白名单中，回退到系统默认 Shell。
 *
 * @param requestedShell - 请求使用的 Shell 路径（可选）
 * @returns 验证后的 Shell 路径
 */
function resolveShell(requestedShell?: string): string {
  const shell = requestedShell || appConfig.general.defaultShell || getDefaultShell()
  if (isShellAllowed(shell)) return shell
  // 如果请求的 shell 不在白名单，使用默认 shell
  return getDefaultShell()
}

// ── 项目数据管理 ──

/**
 * 项目数据接口
 *
 * 表示用户收藏的项目目录，用于快速访问常用项目。
 */
interface Project {
  /** 项目唯一标识符 */
  id: string
  /** 项目显示名称（通常为目录名） */
  name: string
  /** 项目绝对路径 */
  path: string
}

/**
 * 获取项目数据文件路径
 *
 * @returns projects.json 文件的绝对路径
 */
function getProjectsPath(): string {
  const userData = app.getPath('userData')
  return join(userData, 'projects.json')
}

/**
 * 从磁盘加载项目列表
 *
 * 读取并解析 projects.json 文件，返回校验后的项目数组。
 * 如果文件不存在或格式错误，返回空数组。
 *
 * @returns 项目数组
 */
function loadProjects(): Project[] {
  const filePath = getProjectsPath()
  try {
    if (!existsSync(filePath)) return []
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    // 校验每个项目的数据结构
    return data.filter(
      (p: any) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.path === 'string'
    )
  } catch {
    return []
  }
}

/**
 * 将项目列表保存到磁盘
 *
 * @param projects - 要保存的项目数组
 */
function saveProjects(projects: Project[]): void {
  const filePath = getProjectsPath()
  try {
    const dir = join(filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, JSON.stringify(projects, null, 2), 'utf-8')
  } catch (err) {
    console.error('保存项目数据失败：', err)
  }
}

// ── 配置管理 ──

/**
 * 应用配置接口
 *
 * 包含所有可配置的选项，持久化到 config.json 文件。
 */
interface Config {
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
 * 获取配置文件路径
 *
 * @returns config.json 文件的绝对路径
 */
function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

/**
 * 生成默认配置
 *
 * @returns 包含默认值的配置对象
 */
function getDefaultConfig(): Config {
  return {
    general: {
      defaultShell: getDefaultShell(),
      defaultCwd: getDefaultCwd(),
      fontSize: 14,
      theme: 'dark',
      scrollback: 10000
    }
  }
}

/**
 * 从磁盘加载配置
 *
 * 读取并解析 config.json 文件，对每个字段进行校验和范围限制。
 * 无效字段会被替换为默认值。
 *
 * @returns 校验后的配置对象
 */
function loadConfig(): Config {
  const filePath = getConfigPath()
  try {
    if (!existsSync(filePath)) return getDefaultConfig()
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return getDefaultConfig()
    const defaults = getDefaultConfig()
    return {
      general: {
        defaultShell: typeof data.general?.defaultShell === 'string' ? data.general.defaultShell : defaults.general.defaultShell,
        defaultCwd: typeof data.general?.defaultCwd === 'string' ? data.general.defaultCwd : defaults.general.defaultCwd,
        fontSize: typeof data.general?.fontSize === 'number' ? clamp(data.general.fontSize, 8, 32) : defaults.general.fontSize,
        theme: data.general?.theme === 'light' ? 'light' : 'dark',
        scrollback: typeof data.general?.scrollback === 'number' ? clamp(data.general.scrollback, 100, 100000) : defaults.general.scrollback
      }
    }
  } catch {
    return getDefaultConfig()
  }
}

/**
 * 将配置保存到磁盘
 *
 * @param config - 要保存的配置对象
 */
function saveConfig(config: Config): void {
  const filePath = getConfigPath()
  try {
    const dir = join(filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('保存配置失败：', err)
  }
}

/**
 * 校验配置数据
 *
 * 对输入数据进行严格校验，确保所有字段类型正确且在有效范围内。
 *
 * @param config - 待校验的原始数据
 * @returns 校验后的配置对象
 */
function validateConfig(config: any): Config {
  const defaults = getDefaultConfig()
  if (!config || typeof config !== 'object') return defaults
  return {
    general: {
      defaultShell: typeof config.general?.defaultShell === 'string' ? config.general.defaultShell : defaults.general.defaultShell,
      defaultCwd: typeof config.general?.defaultCwd === 'string' ? config.general.defaultCwd : defaults.general.defaultCwd,
      fontSize: typeof config.general?.fontSize === 'number' ? clamp(config.general.fontSize, 8, 32) : defaults.general.fontSize,
      theme: config.general?.theme === 'light' ? 'light' : 'dark',
      scrollback: typeof config.general?.scrollback === 'number' ? clamp(config.general.scrollback, 100, 100000) : defaults.general.scrollback
    }
  }
}

/** 全局配置实例，应用启动时加载，修改时同步保存到磁盘 */
let appConfig = loadConfig()

// ── 布局状态管理 ──

/**
 * 面板状态接口
 *
 * 记录单个终端面板的配置信息，用于布局持久化。
 */
interface PaneState {
  /** 面板 ID */
  id: string
  /** 使用的 Shell 路径 */
  shell: string
  /** 工作目录 */
  cwd: string
}

/**
 * 布局状态节点接口
 *
 * 递归定义布局树的序列化格式，用于持久化到磁盘。
 */
interface LayoutStateNode {
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
 * 记录单个标签页的完整状态，包括布局和所有面板。
 */
interface TabState {
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
 * 记录整个应用的布局状态，包括所有标签和窗口配置。
 */
interface LayoutState {
  /** 状态格式版本号 */
  version: string
  /** 所有标签的状态列表 */
  tabs: TabState[]
  /** 当前激活的标签 ID */
  activeTabId: string
}

/**
 * 获取布局状态文件路径
 *
 * @returns layout-state.json 文件的绝对路径
 */
function getLayoutPath(): string {
  return join(app.getPath('userData'), 'layout-state.json')
}

/**
 * 从磁盘加载布局状态
 *
 * @returns 布局状态对象，如果文件不存在或格式错误返回 null
 */
function loadLayoutState(): LayoutState | null {
  const filePath = getLayoutPath()
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    if (!Array.isArray(data.tabs)) return null
    return data as LayoutState
  } catch {
    return null
  }
}

/**
 * 将布局状态保存到磁盘
 *
 * @param state - 要保存的布局状态
 */
function saveLayoutState(state: LayoutState): void {
  const filePath = getLayoutPath()
  try {
    const dir = join(filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('保存布局状态失败：', err)
  }
}

// ── 工具函数 ──

/**
 * 将数值限制在指定范围内
 *
 * @param value - 要限制的数值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 限制后的数值
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 生成 PTY 会话 ID
 *
 * 格式：pty_<timestamp>_<random>
 *
 * @returns 唯一的会话 ID
 */
function generateId(): string {
  return `pty_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 生成项目 ID
 *
 * 格式：proj_<timestamp>_<random>
 *
 * @returns 唯一的项目 ID
 */
function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 获取系统默认 Shell
 *
 * Windows 返回 PowerShell，其他平台返回 SHELL 环境变量或 zsh。
 *
 * @returns 默认 Shell 的路径
 */
function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

/**
 * 获取默认工作目录
 *
 * 优先使用 HOME 环境变量，其次 USERPROFILE（Windows），最后使用进程当前目录。
 *
 * @returns 默认工作目录路径
 */
function getDefaultCwd(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd()
}

/**
 * 获取有效的工作目录
 *
 * 优先使用配置的默认工作目录，如果未配置则使用系统默认目录。
 *
 * @returns 有效的工作目录路径
 */
function getEffectiveCwd(): string {
  return appConfig.general.defaultCwd || getDefaultCwd()
}

/**
 * 验证并规范化工作目录
 *
 * 检查目录是否存在、是否为目录、是否有访问权限。
 * 如果验证失败，回退到用户主目录。
 *
 * @param requestedCwd - 请求的工作目录（可选）
 * @returns 验证后的有效工作目录
 */
function validateCwd(requestedCwd?: string): string {
  const cwd = requestedCwd || getEffectiveCwd()
  try {
    if (existsSync(cwd)) {
      const stat = statSync(cwd)
      if (stat.isDirectory()) {
        // 检查是否有读取和执行权限
        accessSync(cwd, constants.R_OK | constants.X_OK)
        return cwd
      }
    }
  } catch {
    // 无权限或其他错误
  }
  // 回退到用户主目录
  const fallback = getDefaultCwd()
  console.warn(`目录不存在或无权限: ${cwd}，回退到: ${fallback}`)
  return fallback
}

/**
 * 校验字符串参数
 *
 * 用于 IPC 消息参数校验，防止注入攻击。
 *
 * @param value - 要校验的值
 * @param maxLength - 最大长度限制，默认 1000
 * @returns 如果是有效字符串返回 true
 */
function isValidString(value: any, maxLength = 1000): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

/**
 * 校验数字参数
 *
 * 用于 IPC 消息参数校验，确保数值在有效范围内。
 *
 * @param value - 要校验的值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 如果是有效数字返回 true
 */
function isValidNumber(value: any, min: number, max: number): value is number {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max
}

// ── PTY 管理 ──

/**
 * 创建新的 PTY 会话
 *
 * 创建一个伪终端进程，设置数据监听和退出处理。
 * PTY 输出会实时转发到渲染进程的 xterm.js 终端。
 *
 * @param options - 创建选项
 * @param options.shell - Shell 路径（可选，使用默认值）
 * @param options.cwd - 工作目录（可选，使用默认值）
 * @param options.cols - 终端列数（可选，默认 80）
 * @param options.rows - 终端行数（可选，默认 24）
 * @returns 包含会话 ID、Shell 路径和工作目录的对象
 * @throws 如果 Shell 启动失败抛出错误
 */
function createPty(options: {
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
}): { id: string; shell: string; cwd: string } {
  const shellPath = resolveShell(options.shell)
  const cwd = validateCwd(options.cwd)
  const cols = isValidNumber(options.cols, 1, 1000) ? options.cols : 80
  const rows = isValidNumber(options.rows, 1, 500) ? options.rows : 24
  const id = generateId()

  let ptyProcess: pty.IPty
  try {
    ptyProcess = pty.spawn(shellPath, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>
    })
  } catch (err: any) {
    const errorMsg = `启动 Shell 失败: ${err.message || '未知错误'}`
    console.error(errorMsg, { shellPath, cwd })
    throw new Error(errorMsg)
  }

  // 监听 PTY 输出，转发到渲染进程
  ptyProcess.onData((data: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:data:${id}`, data)
    }
  })

  // 处理 PTY 退出事件
  ptyProcess.onExit(({ exitCode, signal }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:exit:${id}`, exitCode)
      if (signal) {
        mainWindow.webContents.send(`pty:error:${id}`, `进程被信号终止: ${signal}`)
      }
    }
    // 从会话映射中移除
    sessions.delete(id)
  })

  // 保存会话到映射表
  sessions.set(id, { id, pty: ptyProcess, shell: shellPath, cwd })

  return { id, shell: shellPath, cwd }
}

// ── IPC 处理 ──

/**
 * 设置所有 IPC 消息处理器
 *
 * 注册主进程与渲染进程之间的通信通道。
 * 使用 ipcMain.handle 处理请求/响应模式，ipcMain.on 处理单向通知。
 * 所有输入都经过长度限制和类型校验，防止恶意数据。
 */
function setupIpcHandlers(): void {
  // ── 终端管理 IPC ──

  /**
   * 创建新终端会话
   *
   * 请求/响应模式，返回会话 ID 和 Shell 信息。
   */
  ipcMain.handle('pty:create', (_event, options: any) => {
    try {
      // 参数校验：只提取有效字段
      const opts: { shell?: string; cwd?: string; cols?: number; rows?: number } = {}

      if (options && typeof options === 'object') {
        if (isValidString(options.shell, 500)) {
          opts.shell = options.shell
        }
        if (isValidString(options.cwd, 2000)) {
          opts.cwd = options.cwd
        }
        if (isValidNumber(options.cols, 1, 1000)) {
          opts.cols = Math.floor(options.cols)
        }
        if (isValidNumber(options.rows, 1, 500)) {
          opts.rows = Math.floor(options.rows)
        }
      }

      return { success: true, ...createPty(opts) }
    } catch (err: any) {
      return { success: false, error: err.message || '创建终端失败' }
    }
  })

  /**
   * 向终端写入数据
   *
   * 单向通知模式，将用户输入发送到 PTY 进程。
   */
  ipcMain.on('pty:input', (_event, id: string, data: string) => {
    if (!isValidString(id, 100)) return
    if (typeof data !== 'string' || data.length > 100000) return
    const session = sessions.get(id)
    if (session) {
      try {
        session.pty.write(data)
      } catch (err) {
        console.error('写入 PTY 失败:', err)
      }
    }
  })

  /**
   * 调整终端大小
   *
   * 单向通知模式，当窗口或分屏大小改变时调用。
   */
  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    if (!isValidString(id, 100)) return
    if (!isValidNumber(cols, 1, 1000) || !isValidNumber(rows, 1, 500)) return
    const session = sessions.get(id)
    if (session) {
      try {
        session.pty.resize(Math.floor(cols), Math.floor(rows))
      } catch (err) {
        console.error('调整 PTY 大小失败:', err)
      }
    }
  })

  /**
   * 关闭终端会话
   *
   * 请求/响应模式，终止 PTY 进程并清理资源。
   */
  ipcMain.handle('pty:kill', (_event, id: string) => {
    if (!isValidString(id, 100)) {
      return { success: false, error: '无效的会话 ID' }
    }
    const session = sessions.get(id)
    if (session) {
      try {
        session.pty.kill()
        sessions.delete(id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message || '关闭终端失败' }
      }
    }
    return { success: false, error: '会话不存在' }
  })

  // ── 项目管理 IPC ──

  /** 获取项目列表 */
  ipcMain.handle('project:list', () => {
    return loadProjects()
  })

  /**
   * 添加新项目
   *
   * 如果未提供路径，会打开目录选择对话框。
   * 验证路径有效性后添加到项目列表。
   */
  ipcMain.handle('project:add', async (_event, projectPath?: string) => {
    try {
      let selectedPath = projectPath

      // 如果未提供路径，打开目录选择对话框
      if (!selectedPath) {
        const result = await dialog.showOpenDialog(mainWindow!, {
          properties: ['openDirectory'],
          title: '选择项目目录'
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: '已取消' }
        }
        selectedPath = result.filePaths[0]
      }

      // 验证路径
      if (!isValidString(selectedPath, 2000)) {
        return { success: false, error: '无效的路径' }
      }

      if (!existsSync(selectedPath)) {
        return { success: false, error: '目录不存在' }
      }

      const stat = statSync(selectedPath)
      if (!stat.isDirectory()) {
        return { success: false, error: '路径不是目录' }
      }

      // 检查是否已存在
      const projects = loadProjects()
      if (projects.some((p) => p.path === selectedPath)) {
        return { success: false, error: '项目已存在' }
      }

      // 创建新项目
      const newProject: Project = {
        id: generateProjectId(),
        name: basename(selectedPath),
        path: selectedPath
      }

      projects.push(newProject)
      saveProjects(projects)

      return { success: true, project: newProject }
    } catch (err: any) {
      return { success: false, error: err.message || '添加项目失败' }
    }
  })

  /**
   * 删除项目
   *
   * 根据项目 ID 从列表中移除项目。
   */
  ipcMain.handle('project:remove', (_event, projectId: string) => {
    try {
      if (!isValidString(projectId, 100)) {
        return { success: false, error: '无效的项目 ID' }
      }
      const projects = loadProjects()
      const index = projects.findIndex((p) => p.id === projectId)
      if (index === -1) {
        return { success: false, error: '项目不存在' }
      }
      projects.splice(index, 1)
      saveProjects(projects)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || '删除项目失败' }
    }
  })

  /**
   * 打开目录选择对话框
   *
   * 返回用户选择的目录路径，如果取消则返回 null。
   */
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '选择项目目录'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // ── 布局状态 IPC ──

  /** 加载布局状态 */
  ipcMain.handle('layout:load', () => {
    return loadLayoutState()
  })

  /** 保存布局状态（单向通知） */
  ipcMain.on('layout:save', (_event, state: any) => {
    // 基本校验
    if (!state || typeof state !== 'object') return
    if (!Array.isArray(state.tabs)) return
    saveLayoutState(state as LayoutState)
  })

  // ── 配置 IPC ──

  /** 加载配置 */
  ipcMain.handle('config:load', () => {
    return appConfig
  })

  /**
   * 保存配置
   *
   * 校验后保存到磁盘，并更新内存中的配置实例。
   */
  ipcMain.handle('config:save', (_event, config: any) => {
    try {
      const validated = validateConfig(config)
      appConfig = validated
      saveConfig(validated)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || '保存配置失败' }
    }
  })

  // ── Shell 列表 IPC ──

  /** 获取检测到的 Shell 列表 */
  ipcMain.handle('shell:list', () => {
    return detectedShells
  })
}

/**
 * 创建应用菜单
 *
 * 构建包含文件、编辑、视图、终端、帮助五个菜单项的菜单栏。
 * 菜单项通过 IPC 通知渲染进程执行相应操作。
 */
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件(&F)',
      submenu: [
        { label: '新建标签', accelerator: 'CmdOrCtrl+T', click: () => mainWindow?.webContents.send('menu:new-tab') },
        { type: 'separator' },
        { label: '关闭标签', accelerator: 'CmdOrCtrl+W', click: () => mainWindow?.webContents.send('menu:close-tab') },
        { type: 'separator' },
        { label: '设置', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu:settings') },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑(&E)',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'delete', label: '删除' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图(&V)',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '终端(&T)',
      submenu: [
        { label: '新建终端', accelerator: 'CmdOrCtrl+T', click: () => mainWindow?.webContents.send('menu:new-tab') },
        { type: 'separator' },
        { label: '水平分屏', accelerator: 'Alt+Shift+-', click: () => mainWindow?.webContents.send('menu:split-h') },
        { label: '垂直分屏', accelerator: 'Alt+Shift+=', click: () => mainWindow?.webContents.send('menu:split-v') },
        { label: '关闭面板', accelerator: 'Alt+Shift+W', click: () => mainWindow?.webContents.send('menu:close-pane') },
        { type: 'separator' },
        { label: '上一个标签', accelerator: 'CmdOrCtrl+Shift+Tab', click: () => mainWindow?.webContents.send('menu:prev-tab') },
        { label: '下一个标签', accelerator: 'CmdOrCtrl+Tab', click: () => mainWindow?.webContents.send('menu:next-tab') }
      ]
    },
    {
      label: '帮助(&H)',
      submenu: [
        { label: '关于终端管理器', click: () => {
          dialog.showMessageBox(mainWindow!, {
            type: 'info',
            title: '关于',
            message: '终端管理器 v0.1.0',
            detail: '一个基于 Electron 的跨平台多终端管理工具。'
          })
        }}
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/**
 * 创建主窗口
 *
 * 配置窗口属性、安全策略和加载渲染进程页面。
 * 启用上下文隔离，禁用 Node 集成，确保安全性。
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 窗口准备好后显示
  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // 处理外部链接：在系统浏览器中打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 加载渲染进程页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── 应用生命周期 ──

/**
 * 应用就绪后的初始化流程
 *
 * 1. 检测系统中可用的 Shell
 * 2. 设置 IPC 消息处理器
 * 3. 创建应用菜单
 * 4. 创建主窗口
 */
app.whenReady().then(() => {
  // 检测系统 Shell
  detectedShells = detectShells()
  console.log('检测到的 Shell:', detectedShells.map((s) => s.name).join(', '))

  setupIpcHandlers()
  createMenu()
  createWindow()

  // macOS：点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

/**
 * 所有窗口关闭时的处理
 *
 * 1. 终止所有 PTY 会话
 * 2. 非 macOS 平台退出应用
 */
app.on('window-all-closed', () => {
  // 终止所有 PTY 会话
  for (const session of sessions.values()) {
    try {
      session.pty.kill()
    } catch {
      // 忽略已退出的进程
    }
  }
  sessions.clear()

  // macOS 应用通常在所有窗口关闭后仍然保持运行
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
