/**
 * PTY 会话管理和 IPC 处理
 */

import { BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron'
import { existsSync, statSync } from 'fs'
import { basename } from 'path'
import * as pty from 'node-pty'

import { createShellValidator, type ShellInfo } from './shell-detector'
import {
  getDefaultCwd, loadConfig, saveConfig, validateConfig,
  loadProjects, saveProjects, loadLayoutState, saveLayoutState, generateProjectId,
  type Config, type Project
} from './data-store'
import { isValidString, isValidNumber, validateCwd } from './validation'
import { buildPtyEnv } from './pty-env'

// ── PTY 会话 ──

interface PtySession {
  id: string
  pty: pty.IPty
  shell: string
  cwd: string
}

const sessions = new Map<string, PtySession>()

let mainWindow: BrowserWindow | null = null
let appConfig: Config = loadConfig()
let shellValidator: ReturnType<typeof createShellValidator>
let detectedShells: ShellInfo[] = []

export function init(shells: ShellInfo[], getMainWindow: () => BrowserWindow | null): void {
  detectedShells = shells
  appConfig = loadConfig()
  shellValidator = createShellValidator(shells, () => appConfig.general.defaultShell)
  mainWindow = getMainWindow()
  // 启动时同步主题到原生标题栏
  nativeTheme.themeSource = appConfig.general.theme === 'light' ? 'light' : 'dark'
  setupIpcHandlers()
}

function generateId(): string {
  return `pty_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getEffectiveCwd(): string {
  return appConfig.general.defaultCwd || getDefaultCwd()
}

function createPty(options: {
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
}): { id: string; shell: string; cwd: string } {
  const shellPath = shellValidator.resolve(options.shell, appConfig.general.defaultShell)
  const cwd = validateCwd(options.cwd, getEffectiveCwd)
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
      env: buildPtyEnv(process.env)
    })
  } catch (err: any) {
    const errorMsg = `启动 Shell 失败: ${err.message || '未知错误'}`
    console.error(errorMsg, { shellPath, cwd })
    throw new Error(errorMsg)
  }

  ptyProcess.onData((data: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:data:${id}`, data)
    }
  })

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

export function killAllSessions(): void {
  for (const session of sessions.values()) {
    try {
      session.pty.kill()
    } catch {
      // ignore
    }
  }
  sessions.clear()
}

// ── IPC 处理 ──

function setupIpcHandlers(): void {
  ipcMain.handle('pty:create', (_event, options: any) => {
    try {
      const opts: { shell?: string; cwd?: string; cols?: number; rows?: number } = {}
      if (options && typeof options === 'object') {
        if (isValidString(options.shell, 500)) opts.shell = options.shell
        if (isValidString(options.cwd, 2000)) opts.cwd = options.cwd
        if (isValidNumber(options.cols, 1, 1000)) opts.cols = Math.floor(options.cols)
        if (isValidNumber(options.rows, 1, 500)) opts.rows = Math.floor(options.rows)
      }
      return { success: true, ...createPty(opts) }
    } catch (err: any) {
      return { success: false, error: err.message || '创建终端失败' }
    }
  })

  ipcMain.on('pty:input', (_event, id: string, data: string) => {
    if (!isValidString(id, 100)) return
    if (typeof data !== 'string' || data.length > 100000) return
    const session = sessions.get(id)
    if (session) {
      try { session.pty.write(data) } catch (err) { console.error('写入 PTY 失败:', err) }
    }
  })

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    if (!isValidString(id, 100)) return
    if (!isValidNumber(cols, 1, 1000) || !isValidNumber(rows, 1, 500)) return
    const session = sessions.get(id)
    if (session) {
      try { session.pty.resize(Math.floor(cols), Math.floor(rows)) } catch (err) { console.error('调整 PTY 大小失败:', err) }
    }
  })

  ipcMain.handle('pty:kill', (_event, id: string) => {
    if (!isValidString(id, 100)) return { success: false, error: '无效的会话 ID' }
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

  // 项目管理
  ipcMain.handle('project:list', () => loadProjects())

  ipcMain.handle('project:add', async (_event, projectPath?: string) => {
    try {
      let selectedPath = projectPath
      if (!selectedPath) {
        if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: '窗口不可用' }
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
          title: '选择项目目录'
        })
        if (result.canceled || result.filePaths.length === 0) return { success: false, error: '已取消' }
        selectedPath = result.filePaths[0]
      }
      if (!isValidString(selectedPath, 2000)) return { success: false, error: '无效的路径' }
      if (!existsSync(selectedPath)) return { success: false, error: '目录不存在' }
      if (!statSync(selectedPath).isDirectory()) return { success: false, error: '路径不是目录' }

      const projects = loadProjects()
      if (projects.some((p) => p.path === selectedPath)) return { success: false, error: '项目已存在' }

      const newProject: Project = { id: generateProjectId(), name: basename(selectedPath), path: selectedPath }
      projects.push(newProject)
      saveProjects(projects)
      return { success: true, project: newProject }
    } catch (err: any) {
      return { success: false, error: err.message || '添加项目失败' }
    }
  })

  ipcMain.handle('project:remove', (_event, projectId: string) => {
    try {
      if (!isValidString(projectId, 100)) return { success: false, error: '无效的项目 ID' }
      const projects = loadProjects()
      const index = projects.findIndex((p) => p.id === projectId)
      if (index === -1) return { success: false, error: '项目不存在' }
      projects.splice(index, 1)
      saveProjects(projects)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || '删除项目失败' }
    }
  })

  ipcMain.handle('dialog:selectDirectory', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择项目目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 布局状态
  ipcMain.handle('layout:load', () => loadLayoutState())
  ipcMain.on('layout:save', (_event, state: any) => {
    if (!state || typeof state !== 'object') return
    if (!Array.isArray(state.tabs)) return
    saveLayoutState(state)
  })

  // 配置
  ipcMain.handle('config:load', () => appConfig)
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

  // Shell 列表
  ipcMain.handle('shell:list', () => detectedShells)

  // 主题同步（更新原生标题栏颜色）
  ipcMain.on('theme:set', (_event, theme: string) => {
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
  })
}
