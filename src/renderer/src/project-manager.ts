/**
 * 项目管理
 */

import { projects, setProjects, projectList } from './state'
import { showNotification, showConfirm, escapeHtml } from './ui-utils'
import { addTab } from './tab-pane-manager'

export async function loadProjects(): Promise<void> {
  setProjects(await window.terminalAPI.listProjects())
  renderProjectList()
}

export function renderProjectList(): void {
  projectList.innerHTML = ''

  if (projects.length === 0) {
    const empty = document.createElement('div')
    empty.id = 'sidebar-empty'
    empty.innerHTML = '<span>暂无项目</span><span style="font-size:11px;opacity:0.7">点击上方 + 添加</span>'
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
