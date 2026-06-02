/**
 * Shell 选择项组件
 *
 * 为设置页候选列表和新建终端菜单生成 Shell 选项。
 */

import type { ShellInfo } from '../types/renderer.types'
import type { TerminalContextMenuItem } from './terminal-context-menu'

/** 设置页中“自定义路径”选项的值 */
export const CUSTOM_SHELL_VALUE = '__custom_shell__'

/**
 * 将自动检测到的 Shell 渲染为设置页下拉选项。
 *
 * @param select - 设置页 Shell 下拉框
 * @param shells - 自动检测到的 Shell
 * @param selectedPath - 当前默认 Shell 路径
 */
export function renderShellOptions(
  select: HTMLSelectElement,
  shells: ShellInfo[],
  selectedPath?: string
): void {
  const options = shells.map((shell) => {
    const option = document.createElement('option')
    option.value = shell.path
    option.textContent = `${shell.name} — ${shell.path}`
    return option
  })
  const custom = document.createElement('option')
  custom.value = CUSTOM_SHELL_VALUE
  custom.textContent = '自定义路径...'
  select.replaceChildren(...options, custom)
  select.value = shells.some((shell) => shell.path === selectedPath)
    ? selectedPath!
    : CUSTOM_SHELL_VALUE
}

/**
 * 生成“新建终端”下拉菜单项。
 *
 * @param shells - 自动检测到的 Shell
 * @param onSelect - 选择 Shell 后的回调
 * @returns 可交给终端菜单组件渲染的菜单项
 */
export function createShellMenuItems(
  shells: ShellInfo[],
  onSelect: (shell: ShellInfo) => void
): TerminalContextMenuItem[] {
  return shells.map((shell, index) => ({
    id: `new-terminal-shell-${index}`,
    label: shell.name,
    shortcut: shell.path,
    title: shell.path,
    onSelect: () => onSelect(shell)
  }))
}
