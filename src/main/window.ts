/**
 * 窗口创建和生命周期
 */

import { shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

/** 当前等待关闭确认的窗口引用 */
let pendingCloseWindow: BrowserWindow | null = null

// 注册一次全局监听器，避免 createWindow 重复注册
ipcMain.on('app:close-confirm-result', (_event, confirmed: boolean) => {
  if (confirmed && pendingCloseWindow && !pendingCloseWindow.isDestroyed()) {
    // 标记为强制关闭，绕过 close 事件中的拦截
    ;(pendingCloseWindow as any)._isForceClose = true
    pendingCloseWindow.close()
  }
  pendingCloseWindow = null
})

export function createWindow(): BrowserWindow {
  // 应用图标：开发模式读取 build/icon.ico，打包后从 resources 目录读取
  const iconPath = is.dev
    ? join(__dirname, '../../build/icon.ico')
    : join(process.resourcesPath, 'favicon.ico')
  const icon = nativeImage.createFromPath(iconPath)

  // sandbox: false — node-pty 原生模块需要在渲染进程预加载脚本中运行，
  // 启用沙箱会导致原生模块加载失败。contextIsolation + nodeIntegration:false 已提供安全保障。
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 关闭窗口前弹出确认对话框，防止误操作导致终端会话丢失
  mainWindow.on('close', (event) => {
    if (!(mainWindow as any)._isForceClose) {
      event.preventDefault()
      pendingCloseWindow = mainWindow
      // 通知渲染进程显示自定义确认对话框
      mainWindow.webContents.send('app:request-close-confirm')
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
