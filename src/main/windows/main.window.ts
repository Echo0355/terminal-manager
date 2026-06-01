/**
 * 窗口创建和生命周期
 */

import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

/** 当前等待关闭确认的窗口引用 */
let pendingCloseWindow: BrowserWindow | null = null

/**
 * 标记用户是否通过 Cmd+Q 或程序坞右键"退出"触发了应用退出
 * 用于区分"关闭窗口"和"退出应用"两种场景
 */
export let isAppQuitting = false

// 监听应用退出事件（Cmd+Q、程序坞右键退出等触发）
app.on('before-quit', () => {
  isAppQuitting = true
})

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
  // 应用图标：Windows 使用 ico，macOS 和 Linux 使用 png
  const iconFilename = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const iconPath = is.dev
    ? join(__dirname, `../../build/${iconFilename}`)
    : join(process.resourcesPath, iconFilename)
  const icon = nativeImage.createFromPath(iconPath)

  // macOS 开发模式下手动设置应用名称和 Dock 图标
  // macOS 上 BrowserWindow 的 icon 选项会被忽略，Dock 图标需要通过 app.dock.setIcon() 设置
  // 开发模式下没有 .app bundle，应用名称会显示为 "Electron"，需要手动设置
  if (process.platform === 'darwin' && is.dev) {
    app.setName('Terminal Manager')
    if (app.dock) {
      app.dock.setIcon(iconPath)
    }
  }

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
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 关闭窗口前弹出确认对话框，防止误操作导致终端会话丢失
  // 如果是用户通过 Cmd+Q 或程序坞退出（isAppQuitting=true），直接允许关闭
  mainWindow.on('close', (event) => {
    if (!(mainWindow as any)._isForceClose && !isAppQuitting) {
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
