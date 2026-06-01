/**
 * 终端右键菜单测试
 *
 * 覆盖菜单渲染、操作触发、禁用项和关闭行为。
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeTerminalContextMenu, showTerminalContextMenu } from './terminal-context-menu'

describe('showTerminalContextMenu', () => {
  afterEach(() => {
    closeTerminalContextMenu()
    document.body.replaceChildren()
  })

  it('渲染复制、粘贴和剪切操作', () => {
    showTerminalContextMenu({
      x: 24,
      y: 32,
      items: [
        { id: 'copy', label: '复制', shortcut: 'Ctrl+C' },
        { id: 'paste', label: '粘贴', shortcut: 'Ctrl+V' },
        { id: 'cut', label: '剪切', enabled: false }
      ]
    })

    const menu = document.querySelector('.terminal-context-menu') as HTMLElement
    const buttons = menu.querySelectorAll('button')
    expect(menu.style.left).toBe('24px')
    expect(menu.style.top).toBe('32px')
    expect(buttons).toHaveLength(3)
    expect(buttons[0].textContent).toBe('复制Ctrl+C')
    expect(buttons[1].textContent).toBe('粘贴Ctrl+V')
    expect(buttons[2].textContent).toBe('剪切')
    expect(buttons[2].disabled).toBe(true)
  })

  it('点击可用菜单项后执行操作并关闭菜单', () => {
    const onSelect = vi.fn()
    showTerminalContextMenu({
      x: 0,
      y: 0,
      items: [{ id: 'paste', label: '粘贴', onSelect }]
    })

    const button = document.querySelector('[data-action="paste"]') as HTMLButtonElement
    button.click()

    expect(onSelect).toHaveBeenCalledOnce()
    expect(document.querySelector('.terminal-context-menu')).toBeNull()
  })

  it('点击菜单外部时关闭菜单', () => {
    showTerminalContextMenu({
      x: 0,
      y: 0,
      items: [{ id: 'copy', label: '复制' }]
    })

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(document.querySelector('.terminal-context-menu')).toBeNull()
  })

  it('按 Escape 时关闭菜单', () => {
    showTerminalContextMenu({
      x: 0,
      y: 0,
      items: [{ id: 'copy', label: '复制' }]
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(document.querySelector('.terminal-context-menu')).toBeNull()
  })
})
