/**
 * 数据持久化：配置、项目列表、布局状态
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

// ── 类型 ──

export interface Project {
  id: string
  name: string
  path: string
}

export interface Config {
  general: {
    defaultShell: string
    defaultCwd: string
    fontSize: number
    theme: 'dark' | 'light'
    scrollback: number
  }
}

export interface LayoutState {
  version: string
  tabs: unknown[]
  activeTabId: string
  windowState?: { sidebarWidth: number }
}

// ── 工具函数 ──

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function ensureDir(filePath: string): void {
  const dir = join(filePath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readJson(filePath: string): unknown {
  try {
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function writeJson(filePath: string, data: unknown): void {
  try {
    ensureDir(filePath)
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('写入文件失败:', filePath, err)
  }
}

// ── 项目 ──

function getProjectsPath(): string {
  return join(app.getPath('userData'), 'projects.json')
}

export function loadProjects(): Project[] {
  const data = readJson(getProjectsPath())
  if (!Array.isArray(data)) return []
  return data.filter(
    (p: any) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.path === 'string'
  )
}

export function saveProjects(projects: Project[]): void {
  writeJson(getProjectsPath(), projects)
}

export function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── 配置 ──

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function getDefaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/zsh'
}

export function getDefaultCwd(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd()
}

export function getDefaultConfig(): Config {
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

export function loadConfig(): Config {
  const data = readJson(getConfigPath())
  if (!data || typeof data !== 'object') return getDefaultConfig()
  const defaults = getDefaultConfig()
  const g = (data as any).general
  return {
    general: {
      defaultShell: typeof g?.defaultShell === 'string' ? g.defaultShell : defaults.general.defaultShell,
      defaultCwd: typeof g?.defaultCwd === 'string' ? g.defaultCwd : defaults.general.defaultCwd,
      fontSize: typeof g?.fontSize === 'number' ? clamp(g.fontSize, 8, 32) : defaults.general.fontSize,
      theme: g?.theme === 'light' ? 'light' : 'dark',
      scrollback: typeof g?.scrollback === 'number' ? clamp(g.scrollback, 100, 100000) : defaults.general.scrollback
    }
  }
}

export function saveConfig(config: Config): void {
  writeJson(getConfigPath(), config)
}

export function validateConfig(config: any): Config {
  const defaults = getDefaultConfig()
  if (!config || typeof config !== 'object') return defaults
  const g = config.general
  return {
    general: {
      defaultShell: typeof g?.defaultShell === 'string' ? g.defaultShell : defaults.general.defaultShell,
      defaultCwd: typeof g?.defaultCwd === 'string' ? g.defaultCwd : defaults.general.defaultCwd,
      fontSize: typeof g?.fontSize === 'number' ? clamp(g.fontSize, 8, 32) : defaults.general.fontSize,
      theme: g?.theme === 'light' ? 'light' : 'dark',
      scrollback: typeof g?.scrollback === 'number' ? clamp(g.scrollback, 100, 100000) : defaults.general.scrollback
    }
  }
}

// ── 布局状态 ──

function getLayoutPath(): string {
  return join(app.getPath('userData'), 'layout-state.json')
}

export function loadLayoutState(): LayoutState | null {
  const data = readJson(getLayoutPath())
  if (!data || typeof data !== 'object') return null
  if (!Array.isArray((data as any).tabs)) return null
  return data as LayoutState
}

export function saveLayoutState(state: LayoutState): void {
  writeJson(getLayoutPath(), state)
}
