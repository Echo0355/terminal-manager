/**
 * 主进程入口
 *
 * 负责应用生命周期管理，具体业务逻辑分布在各子模块中。
 */

import { app, BrowserWindow } from 'electron'
import { detectShells } from './shell-detector'
import { init as initPtyIpc, killAllSessions } from './pty-ipc'
import { createMenu } from './menu'
import { createWindow } from './window'

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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
