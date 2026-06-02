/**
 * 项目管理测试
 *
 * 覆盖资源管理器项目右键选择 Shell 新建标签。
 *
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeTerminalContextMenu } from '../components/terminal-context-menu'

const mocks = vi.hoisted(() => ({
  addTab: vi.fn(),
  projects: [{ id: 'project-1', name: 'demo', path: '/workspace/demo' }],
  shells: [
    { name: 'zsh', path: '/bin/zsh' },
    { name: 'bash', path: '/bin/bash' }
  ]
}))

vi.mock('../store/state', () => ({
  detectedShells: mocks.shells,
  projects: mocks.projects,
  projectList: document.createElement('div'),
  setProjects: vi.fn()
}))

vi.mock('../utils/ui-utils', () => ({
  escapeHtml: (value: string) => value,
  showConfirm: vi.fn(),
  showNotification: vi.fn()
}))

vi.mock('./tab-pane-manager', () => ({
  addTab: mocks.addTab
}))

import { projectList } from '../store/state'
import { renderProjectList } from './project-manager'

describe('renderProjectList', () => {
  beforeEach(() => {
    mocks.addTab.mockClear()
    projectList.replaceChildren()
    document.body.replaceChildren(projectList)
  })

  afterEach(() => {
    closeTerminalContextMenu()
    document.body.replaceChildren()
  })

  it('项目右键菜单选择 Shell 后使用项目目录新建标签', () => {
    renderProjectList()

    const item = projectList.querySelector('.project-item') as HTMLElement
    item.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 24,
      clientY: 32
    }))

    const bash = document.querySelector('[data-action="new-terminal-shell-1"]') as HTMLButtonElement
    expect(bash.textContent).toBe('bash/bin/bash')

    bash.click()

    expect(mocks.addTab).toHaveBeenCalledWith('/workspace/demo', '/bin/bash')
  })
})
