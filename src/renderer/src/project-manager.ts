/**
 * 项目管理
 */

import { projects, setProjects, activeTab, projectList } from './state'
import { showNotification, showConfirm, escapeHtml } from './ui-utils'
import { addTab, createTerminalPane, focusPane, scheduleSaveLayout } from './tab-pane-manager'
import { makeLeaf, makeContainer, findParentAndIndex } from './layout-ops'
import { renderLayout } from './layout-render'

export async function loadProjects(): Promise<void> {
  setProjects(await window.terminalAPI.listProjects())
  renderProjectList()
}

export function renderProjectList(): void {
  projectList.innerHTML = ''

  if (projects.length === 0) {
    const empty = document.createElement('div')
    empty.id = 'sidebar-empty'
    empty.textContent = '暂无项目，点击上方 ＋ 添加'
    projectList.appendChild(empty)
    return
  }

  for (const project of projects) {
    const item = document.createElement('div')
    item.className = 'project-item'

    item.innerHTML = `
      <span class="project-icon">📁</span>
      <span class="project-name">${escapeHtml(project.name)}</span>
      <span class="project-actions">
        <button class="project-action-btn" data-action="open" title="在新标签中打开">▶</button>
        <button class="project-action-btn" data-action="split-h" title="水平分屏打开">⫼</button>
        <button class="project-action-btn" data-action="split-v" title="垂直分屏打开">⫟</button>
        <button class="project-action-btn danger" data-action="remove" title="移除项目">✕</button>
      </span>
    `

    item.querySelector('.project-name')!.addEventListener('click', () => {
      addTab(project.path)
    })

    item.querySelectorAll('.project-action-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const action = (btn as HTMLElement).dataset.action
        if (action === 'open') {
          addTab(project.path)
        } else if (action === 'split-h') {
          await openProjectInSplit(project.path, 'horizontal')
        } else if (action === 'split-v') {
          await openProjectInSplit(project.path, 'vertical')
        } else if (action === 'remove') {
          const confirmed = await showConfirm('移除项目', `确定要移除项目"${project.name}"吗？`)
          if (confirmed) {
            await removeProject(project.id)
          }
        }
      })
    })

    projectList.appendChild(item)
  }
}

async function openProjectInSplit(projectPath: string, direction: 'horizontal' | 'vertical'): Promise<void> {
  if (!activeTab) {
    await addTab(projectPath)
    return
  }

  const tab = activeTab
  const currentPaneId = tab.focusedPaneId

  const newPane = await createTerminalPane({ cwd: projectPath })
  tab.panes.set(newPane.id, newPane)

  const found = findParentAndIndex(tab.layout, currentPaneId)

  if (!found) {
    tab.layout = makeContainer(direction, [
      makeLeaf(currentPaneId),
      makeLeaf(newPane.id)
    ])
  } else {
    const { parent, index } = found
    if (parent.direction === direction) {
      parent.children.splice(index + 1, 0, makeLeaf(newPane.id))
      const count = parent.children.length
      const size = Math.floor(100 / count)
      parent.sizes = parent.children.map((_, i) =>
        i === count - 1 ? 100 - size * (count - 1) : size
      )
    } else {
      parent.children[index] = makeContainer(direction, [
        makeLeaf(currentPaneId),
        makeLeaf(newPane.id)
      ])
    }
  }

  renderLayout(tab)
  focusPane(tab, newPane.id)
  scheduleSaveLayout()
}

export async function addProject(): Promise<void> {
  const result = await window.terminalAPI.addProject()
  if (result.success) {
    await loadProjects()
    showNotification('项目已添加', 'success')
  } else if (result.error && result.error !== '已取消') {
    showNotification('添加项目失败：' + result.error, 'error')
  }
}

async function removeProject(projectId: string): Promise<void> {
  const result = await window.terminalAPI.removeProject(projectId)
  if (result.success) {
    await loadProjects()
    showNotification('项目已移除', 'success')
  }
}
