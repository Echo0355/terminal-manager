export interface Project {
  id: string
  name: string
  path: string
}

export interface PaneState {
  id: string
  shell: string
  cwd: string
}

export interface LayoutStateNode {
  type: 'container' | 'leaf'
  direction?: 'horizontal' | 'vertical'
  children?: LayoutStateNode[]
  sizes?: number[]
  paneId?: string
}

export interface TabState {
  id: string
  title: string
  activePaneId: string
  layout: LayoutStateNode
  panes: PaneState[]
}

export interface LayoutState {
  version: string
  tabs: TabState[]
  activeTabId: string
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

export interface ShellInfo {
  name: string
  path: string
  args?: string[]
}

export interface TerminalAPI {
  // 终端管理
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

  writeToTerminal: (id: string, data: string) => void

  resizeTerminal: (id: string, cols: number, rows: number) => void

  closeTerminal: (id: string) => Promise<{ success: boolean; error?: string }>

  onTerminalData: (id: string, callback: (data: string) => void) => () => void

  onTerminalExit: (id: string, callback: (exitCode: number) => void) => () => void

  onTerminalError: (id: string, callback: (error: string) => void) => () => void

  // 菜单事件
  onMenuEvent: (channel: string, callback: () => void) => () => void

  // 项目管理
  listProjects: () => Promise<Project[]>

  addProject: (projectPath?: string) => Promise<{
    success: boolean
    project?: Project
    error?: string
  }>

  removeProject: (projectId: string) => Promise<{ success: boolean; error?: string }>

  selectDirectory: () => Promise<string | null>

  // 布局状态
  loadLayout: () => Promise<LayoutState | null>

  saveLayout: (state: LayoutState) => void

  // 配置管理
  loadConfig: () => Promise<Config>

  saveConfig: (config: Config) => Promise<{ success: boolean; error?: string }>

  // Shell 列表
  listShells: () => Promise<ShellInfo[]>
}

declare global {
  interface Window {
    terminalAPI: TerminalAPI
  }
}
