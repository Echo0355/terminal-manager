/**
 * 终端右键菜单
 *
 * 使用渲染进程 DOM 绘制轻量菜单，避免 xterm 默认右键行为移动隐藏 textarea。
 */

const MENU_MARGIN = 4

export interface TerminalContextMenuItem {
  id: string
  label: string
  shortcut?: string
  enabled?: boolean
  title?: string
  onSelect?: () => void
}

export interface TerminalContextMenuOptions {
  x: number
  y: number
  items: TerminalContextMenuItem[]
}

let activeMenu: HTMLElement | null = null
let removeGlobalListeners: (() => void) | null = null

/**
 * 关闭当前终端右键菜单。
 */
export function closeTerminalContextMenu(): void {
  activeMenu?.remove()
  activeMenu = null
  removeGlobalListeners?.()
  removeGlobalListeners = null
}

function bindGlobalCloseListeners(): void {
  const handleMouseDown = (event: MouseEvent): void => {
    if (!activeMenu?.contains(event.target as Node)) {
      closeTerminalContextMenu()
    }
  }
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      closeTerminalContextMenu()
    }
  }
  const handleWindowChange = (): void => {
    closeTerminalContextMenu()
  }

  document.addEventListener('mousedown', handleMouseDown, { capture: true })
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('blur', handleWindowChange)
  window.addEventListener('resize', handleWindowChange)

  removeGlobalListeners = () => {
    document.removeEventListener('mousedown', handleMouseDown, { capture: true })
    document.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('blur', handleWindowChange)
    window.removeEventListener('resize', handleWindowChange)
  }
}

function positionMenu(menu: HTMLElement, x: number, y: number): void {
  const bounds = menu.getBoundingClientRect()
  const maxLeft = Math.max(MENU_MARGIN, window.innerWidth - bounds.width - MENU_MARGIN)
  const maxTop = Math.max(MENU_MARGIN, window.innerHeight - bounds.height - MENU_MARGIN)

  menu.style.left = `${Math.max(MENU_MARGIN, Math.min(x, maxLeft))}px`
  menu.style.top = `${Math.max(MENU_MARGIN, Math.min(y, maxTop))}px`
}

/**
 * 在鼠标位置显示终端右键菜单。
 *
 * @param options - 菜单位置和操作列表。
 */
export function showTerminalContextMenu(options: TerminalContextMenuOptions): void {
  closeTerminalContextMenu()

  const menu = document.createElement('div')
  menu.className = 'terminal-context-menu'
  menu.setAttribute('role', 'menu')

  options.items.forEach((item) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'terminal-context-menu-item'
    button.dataset.action = item.id
    button.disabled = item.enabled === false
    button.title = item.title || ''
    button.setAttribute('role', 'menuitem')

    const label = document.createElement('span')
    label.textContent = item.label
    button.appendChild(label)

    if (item.shortcut) {
      const shortcut = document.createElement('span')
      shortcut.className = 'terminal-context-menu-shortcut'
      shortcut.textContent = item.shortcut
      button.appendChild(shortcut)
    }

    button.addEventListener('click', () => {
      if (button.disabled) return
      closeTerminalContextMenu()
      item.onSelect?.()
    })
    menu.appendChild(button)
  })

  document.body.appendChild(menu)
  activeMenu = menu
  positionMenu(menu, options.x, options.y)
  bindGlobalCloseListeners()
}
