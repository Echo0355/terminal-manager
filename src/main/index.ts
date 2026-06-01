/**
 * 主进程入口
 *
 * 负责应用生命周期管理，具体业务逻辑分布在各子模块中。
 */

import { app, BrowserWindow } from 'electron'
import { detectShells } from './shell-detector'
import { init as initPtyIpc, killAllSessions } from './pty-ipc'
import { createMenu } from './menu'
import { createWindow, isAppQuitting } from './window'
import { clearLayoutState } from './data-store'

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  const detectedShells = detectShells()
  console.log('检测到的 Shell:', detectedShells.map((s) => s.name).join(', '))

  mainWindow = createWindow()
  createMenu(mainWindow)
  initPtyIpc(detectedShells, () => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      createMenu(mainWindow)
    }
  })
})

app.on('window-all-closed', () => {
  killAllSessions()
  clearLayoutState()
  // macOS: 如果是用户主动退出（Cmd+Q/程序坞退出），调用 app.quit() 完全退出
  // 否则只关闭窗口，应用保留在程序坞中（macOS 惯例）
  if (process.platform !== 'darwin' || isAppQuitting) {
    app.quit()
  }
})
