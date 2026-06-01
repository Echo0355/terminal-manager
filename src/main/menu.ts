/**
 * 应用菜单
 */

import { BrowserWindow, Menu, dialog } from 'electron'

export function createMenu(mainWindow: BrowserWindow | null): void {
  const send = (channel: string): void => {
    mainWindow?.webContents.send(channel)
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件(&F)',
      submenu: [
        { label: '新建标签', accelerator: 'CmdOrCtrl+T', click: () => send('menu:new-tab') },
        { type: 'separator' },
        { label: '关闭标签', accelerator: 'CmdOrCtrl+W', click: () => send('menu:close-tab') },
        { type: 'separator' },
        { label: '设置', accelerator: 'CmdOrCtrl+,', click: () => send('menu:settings') },
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
        { label: '新建终端', click: () => send('menu:new-tab') },
        { type: 'separator' },
        { label: '水平分屏（左右）', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('menu:split-horizontal') },
        { label: '垂直分屏（上下）', accelerator: 'CmdOrCtrl+Shift+Alt+D', click: () => send('menu:split-vertical') },
        { type: 'separator' },
        { label: '关闭面板', accelerator: 'Alt+Shift+W', click: () => send('menu:close-pane') },
        { type: 'separator' },
        { label: '聚焦左侧面板', accelerator: 'Alt+Left', click: () => send('menu:focus-left') },
        { label: '聚焦右侧面板', accelerator: 'Alt+Right', click: () => send('menu:focus-right') },
        { label: '聚焦上方面板', accelerator: 'Alt+Up', click: () => send('menu:focus-up') },
        { label: '聚焦下方面板', accelerator: 'Alt+Down', click: () => send('menu:focus-down') },
        { type: 'separator' },
        { label: '上一个标签', accelerator: 'CmdOrCtrl+Shift+Tab', click: () => send('menu:prev-tab') },
        { label: '下一个标签', accelerator: 'CmdOrCtrl+Tab', click: () => send('menu:next-tab') }
      ]
    },
    {
      label: '帮助(&H)',
      submenu: [
        {
          label: '关于 Terminal Manager',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: '关于',
              message: 'Terminal Manager v1.2.0',
              detail: '一个基于 Electron 的跨平台多终端管理工具。'
            })
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
