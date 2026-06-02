/**
 * Shell 选择项组件测试
 *
 * 覆盖设置页候选项渲染和新建终端菜单回调。
 *
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { CUSTOM_SHELL_VALUE, createShellMenuItems, renderShellOptions } from './shell-options'

describe('renderShellOptions', () => {
  it('将检测到的 Shell 渲染为下拉选项，并选中当前路径', () => {
    const select = document.createElement('select')

    renderShellOptions(select, [
      { name: 'PowerShell', path: 'powershell.exe' },
      { name: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['--login', '-i'] }
    ], 'powershell.exe')

    const options = select.querySelectorAll('option')
    expect(options).toHaveLength(3)
    expect(options[0].textContent).toBe('PowerShell — powershell.exe')
    expect(options[0].value).toBe('powershell.exe')
    expect(options[1].textContent).toBe('Git Bash — C:\\Program Files\\Git\\bin\\bash.exe')
    expect(options[1].value).toBe('C:\\Program Files\\Git\\bin\\bash.exe')
    expect(options[2].textContent).toBe('自定义路径...')
    expect(select.value).toBe('powershell.exe')
  })

  it('重新渲染时替换旧候选项', () => {
    const select = document.createElement('select')
    renderShellOptions(select, [{ name: 'CMD', path: 'cmd.exe' }])

    renderShellOptions(select, [{ name: 'WSL', path: 'wsl.exe' }])

    expect(select.querySelectorAll('option')).toHaveLength(2)
    expect(select.querySelector('option')?.textContent).toBe('WSL — wsl.exe')
  })

  it('未检测到当前路径时选择自定义路径', () => {
    const select = document.createElement('select')

    renderShellOptions(select, [{ name: 'CMD', path: 'cmd.exe' }], 'C:\\Tools\\custom.exe')

    expect(select.value).toBe(CUSTOM_SHELL_VALUE)
  })
})

describe('createShellMenuItems', () => {
  it('为每个 Shell 生成新建终端菜单项', () => {
    const onSelect = vi.fn()
    const shells = [
      { name: 'PowerShell', path: 'powershell.exe' },
      { name: 'CMD', path: 'cmd.exe' }
    ]

    const items = createShellMenuItems(shells, onSelect)

    expect(items.map((item) => item.label)).toEqual([
      'PowerShell',
      'CMD'
    ])
    expect(items[0].shortcut).toBe('powershell.exe')
    items[1].onSelect?.()
    expect(onSelect).toHaveBeenCalledWith(shells[1])
  })

  it('未检测到 Shell 时返回空菜单项', () => {
    const items = createShellMenuItems([], vi.fn())

    expect(items).toHaveLength(0)
  })
})
