import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join, basename } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, accessSync, constants } from 'fs'
import { is } from '@electron-toolkit/utils'
import * as pty from 'node-pty'

// PTY session management
interface PtySession {
  id: string
  pty: pty.IPty
  shell: string
  cwd: string
}

const sessions = new Map<string, PtySession>()
let mainWindow: BrowserWindow | null = null

// ── Shell 白名单 ──

interface ShellInfo {
  name: string
  path: string
  args?: string[]
}

let detectedShells: ShellInfo[] = []

function detectShells(): ShellInfo[] {
  const shells: ShellInfo[] = []

  if (process.platform === 'win32') {
    // PowerShell
    shells.push({ name: 'PowerShell', path: 'powershell.exe' })
    // CMD
    const comspec = process.env.COMSPEC || 'cmd.exe'
    shells.push({ name: 'CMD', path: comspec })
    // Git Bash
    const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe'
    if (existsSync(gitBash)) {
      shells.push({ name: 'Git Bash', path: gitBash, args: ['--login', '-i'] })
    }
    // WSL
    const wsl = 'C:\\Windows\\System32\\wsl.exe'
    if (existsSync(wsl)) {
      shells.push({ name: 'WSL', path: wsl })
    }
  } else {
    // macOS / Linux
    const shellPaths = ['/bin/zsh', '/bin/bash', '/bin/sh', '/usr/bin/fish']
    for (const sp of shellPaths) {
      if (existsSync(sp)) {
        shells.push({ name: basename(sp), path: sp })
      }
    }
    // Homebrew fish on macOS
    const homebrewFish = '/opt/homebrew/bin/fish'
    if (existsSync(homebrewFish)) {
      shells.push({ name: 'fish', path: homebrewFish })
    }
  }

  return shells
}

function isShellAllowed(shellPath: string): boolean {
  // 检查是否在检测到的白名单中
  if (detectedShells.some((s) => s.path === shellPath)) return true
  // 检查是否在配置的默认 shell 中
  if (appConfig.general.defaultShell === shellPath) return true
  return false
}

function resolveShell(requestedShell?: string): string {
  const shell = requestedShell || appConfig.general.defaultShell || getDefaultShell()
  if (isShellAllowed(shell)) return shell
  // 如果请求的 shell 不在白名单，使用默认 shell
  return getDefaultShell()
}

// ── 项目数据管理 ──

interface Project {
  id: string
  name: string
  path: string
}

function getProjectsPath(): string {
  const userData = app.getPath('userData')
  return join(userData, 'projects.json')
}

function loadProjects(): Project[] {
  const filePath = getProjectsPath()
  try {
    if (!existsSync(filePath)) return []
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(
      (p: any) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.path === 'string'
    )
  } catch {
    return []
  }
}

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

interface Config {
  general: {
    defaultShell: string
    defaultCwd: string
    fontSize: number
    theme: 'dark' | 'light'
    scrollback: number
  }
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

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

// 全局配置实例
let appConfig = loadConfig()

// ── 布局状态管理 ──

interface PaneState {
  id: string
  shell: string
  cwd: string
}

interface LayoutStateNode {
  type: 'container' | 'leaf'
  direction?: 'horizontal' | 'vertical'
  children?: LayoutStateNode[]
  sizes?: number[]
  paneId?: string
}

interface TabState {
  id: string
  title: string
  activePaneId: string
  layout: LayoutStateNode
  panes: PaneState[]
}

interface LayoutState {
  version: string
  tabs: TabState[]
  activeTabId: string
}

function getLayoutPath(): string {
  return join(app.getPath('userData'), 'layout-state.json')
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function generateId(): string {
  return `pty_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

function getDefaultCwd(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd()
}

function getEffectiveCwd(): string {
  return appConfig.general.defaultCwd || getDefaultCwd()
}

/** 验证并规范化 cwd，不存在时回退到用户主目录 */
function validateCwd(requestedCwd?: string): string {
  const cwd = requestedCwd || getEffectiveCwd()
  try {
    if (existsSync(cwd)) {
      const stat = statSync(cwd)
      if (stat.isDirectory()) {
        // 检查是否有访问权限
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

/** 校验字符串参数 */
function isValidString(value: any, maxLength = 1000): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

/** 校验数字参数 */
function isValidNumber(value: any, min: number, max: number): value is number {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max
}

// ── PTY 管理 ──

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

  // Forward PTY output to renderer
  ptyProcess.onData((data: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:data:${id}`, data)
    }
  })

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode, signal }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:exit:${id}`, exitCode)
      if (signal) {
        mainWindow.webContents.send(`pty:error:${id}`, `进程被信号终止: ${signal}`)
      }
    }
    sessions.delete(id)
  })

  sessions.set(id, { id, pty: ptyProcess, shell: shellPath, cwd })

  return { id, shell: shellPath, cwd }
}

// ── IPC 处理 ──

function setupIpcHandlers(): void {
  // 创建终端
  ipcMain.handle('pty:create', (_event, options: any) => {
    try {
      // 参数校验
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

  // 写入数据
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

  // 调整大小
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

  // 关闭终端
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

  ipcMain.handle('project:list', () => {
    return loadProjects()
  })

  ipcMain.handle('project:add', async (_event, projectPath?: string) => {
    try {
      let selectedPath = projectPath

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

      const projects = loadProjects()
      if (projects.some((p) => p.path === selectedPath)) {
        return { success: false, error: '项目已存在' }
      }

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

  ipcMain.handle('layout:load', () => {
    return loadLayoutState()
  })

  ipcMain.on('layout:save', (_event, state: any) => {
    // 基本校验
    if (!state || typeof state !== 'object') return
    if (!Array.isArray(state.tabs)) return
    saveLayoutState(state as LayoutState)
  })

  // ── 配置 IPC ──

  ipcMain.handle('config:load', () => {
    return appConfig
  })

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

  ipcMain.handle('shell:list', () => {
    return detectedShells
  })
}

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

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// App lifecycle
app.whenReady().then(() => {
  // 检测系统 Shell
  detectedShells = detectShells()
  console.log('检测到的 Shell:', detectedShells.map((s) => s.name).join(', '))

  setupIpcHandlers()
  createMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Kill all PTY sessions
  for (const session of sessions.values()) {
    try {
      session.pty.kill()
    } catch {
      // 忽略已退出的进程
    }
  }
  sessions.clear()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
