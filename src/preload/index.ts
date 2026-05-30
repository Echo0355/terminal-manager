import { contextBridge, ipcRenderer } from 'electron'

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('terminalAPI', {
  // ── 终端管理 ──

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

  writeToTerminal: (id: string, data: string): void => {
    if (typeof id !== 'string' || id.length > 100) return
    if (typeof data !== 'string' || data.length > 100000) return
    ipcRenderer.send('pty:input', id, data)
  },

  resizeTerminal: (id: string, cols: number, rows: number): void => {
    if (typeof id !== 'string' || id.length > 100) return
    if (typeof cols !== 'number' || typeof rows !== 'number') return
    ipcRenderer.send('pty:resize', id, cols, rows)
  },

  closeTerminal: (id: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof id !== 'string' || id.length > 100) {
      return Promise.resolve({ success: false, error: '无效的 ID' })
    }
    return ipcRenderer.invoke('pty:kill', id)
  },

  onTerminalData: (id: string, callback: (data: string) => void): (() => void) => {
    if (typeof id !== 'string' || typeof callback !== 'function') return () => {}
    const channel = `pty:data:${id}`
    const listener = (_event: Electron.IpcRendererEvent, data: string): void => callback(data)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

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

  onMenuEvent: (channel: string, callback: () => void): (() => void) => {
    const validChannels = [
      'menu:new-tab',
      'menu:close-tab',
      'menu:next-tab',
      'menu:prev-tab',
      'menu:split-h',
      'menu:split-v',
      'menu:close-pane',
      'menu:settings'
    ]
    if (!validChannels.includes(channel)) return () => {}
    const listener = (): void => callback()
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  // ── 项目管理 ──

  listProjects: (): Promise<Array<{ id: string; name: string; path: string }>> => {
    return ipcRenderer.invoke('project:list')
  },

  addProject: (projectPath?: string): Promise<{
    success: boolean
    project?: { id: string; name: string; path: string }
    error?: string
  }> => {
    return ipcRenderer.invoke('project:add', projectPath)
  },

  removeProject: (projectId: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof projectId !== 'string' || projectId.length > 100) {
      return Promise.resolve({ success: false, error: '无效的项目 ID' })
    }
    return ipcRenderer.invoke('project:remove', projectId)
  },

  selectDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:selectDirectory')
  },

  // ── 布局状态 ──

  loadLayout: (): Promise<{
    version: string
    tabs: Array<{
      id: string
      title: string
      activePaneId: string
      layout: any
      panes: Array<{ id: string; shell: string; cwd: string }>
    }>
    activeTabId: string
  } | null> => {
    return ipcRenderer.invoke('layout:load')
  },

  saveLayout: (state: {
    version: string
    tabs: Array<{
      id: string
      title: string
      activePaneId: string
      layout: any
      panes: Array<{ id: string; shell: string; cwd: string }>
    }>
    activeTabId: string
  }): void => {
    if (!state || typeof state !== 'object') return
    ipcRenderer.send('layout:save', state)
  },

  // ── 配置管理 ──

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

  listShells: (): Promise<Array<{ name: string; path: string; args?: string[] }>> => {
    return ipcRenderer.invoke('shell:list')
  }
})
