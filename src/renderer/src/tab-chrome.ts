import type { Pane, Tab } from './types'

/** Claude SVG 图标（内联 data URI，避免外部文件依赖） */
const CLAUDE_ICON_DATA_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>Claude</title><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"></path></svg>'
  )

/**
 * 创建 Claude 运行按钮
 *
 * 浮动在终端面板右上角，点击后在当前终端执行 `claude` 命令。
 */
export function createClaudeButton(paneId: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'claude-run-btn'
  btn.type = 'button'
  btn.title = '运行 Claude'
  btn.setAttribute('data-pane-id', paneId)
  btn.setAttribute('draggable', 'false')

  const img = document.createElement('img')
  img.src = CLAUDE_ICON_DATA_URI
  img.alt = 'Claude'
  img.draggable = false
  btn.appendChild(img)

  return btn
}

export function titleFromCwd(cwd?: string): string | null {
  if (!cwd) return null
  return cwd.split(/[/\\]/).filter(Boolean).pop() || null
}

export function getPaneDisplayTitle(pane: Pane, fallback: string): string {
  return pane.title || titleFromCwd(pane.cwd) || fallback
}

interface PaneTabStripOptions {
  active?: boolean
  paneId: string
  tabId: string
  title: string
}

export function createPaneTabStrip(options: PaneTabStripOptions): HTMLDivElement {
  const strip = document.createElement('div')
  strip.className = 'pane-tab-strip'
  strip.setAttribute('data-pane-id', options.paneId)
  strip.setAttribute('data-tab-id', options.tabId)

  const paneTab = document.createElement('div')
  paneTab.className = 'pane-tab'
  if (options.active) {
    paneTab.classList.add('active-pane-tab')
  }
  paneTab.setAttribute('draggable', 'true')
  paneTab.setAttribute('data-pane-id', options.paneId)
  paneTab.setAttribute('data-tab-id', options.tabId)
  paneTab.title = '拖拽移动此分屏面板'

  const titleEl = document.createElement('span')
  titleEl.className = 'pane-tab-title'
  titleEl.textContent = options.title
  paneTab.appendChild(titleEl)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'pane-close-btn'
  closeBtn.type = 'button'
  closeBtn.textContent = '×'
  closeBtn.title = '关闭面板'
  closeBtn.setAttribute('draggable', 'false')

  const actions = document.createElement('div')
  actions.className = 'pane-actions'
  actions.appendChild(createClaudeButton(options.paneId))
  actions.appendChild(closeBtn)

  strip.appendChild(paneTab)
  strip.appendChild(actions)
  return strip
}

function createWorkspaceClose(): HTMLSpanElement {
  const closeEl = document.createElement('span')
  closeEl.className = 'tab-close'
  closeEl.textContent = '×'
  closeEl.title = '关闭标签'
  return closeEl
}

function renderRegularTab(tabEl: HTMLElement, tab: Tab, isActive: boolean): void {
  let cls = isActive ? 'tab active' : 'tab'
  if (tab.panes.size > 1) cls += ' has-splits'
  tabEl.className = cls
  tabEl.setAttribute('data-tab-id', tab.id)
  tabEl.setAttribute('draggable', 'true')
  tabEl.replaceChildren()

  const titleEl = document.createElement('span')
  titleEl.className = 'tab-title'
  titleEl.textContent = tab.title

  const children: Node[] = [titleEl]
  // 分屏时在标题后显示面板数量角标
  if (tab.panes.size > 1) {
    const badge = document.createElement('span')
    badge.className = 'tab-split-badge'
    badge.textContent = String(tab.panes.size)
    children.push(badge)
  }
  children.push(createWorkspaceClose())
  tabEl.append(...children)
}

export function renderWorkspaceTab(tab: Tab, isActive: boolean): void {
  // 始终渲染普通标签，分屏面板标签由 layout-render.ts 在终端区域内渲染
  renderRegularTab(tab.tabEl, tab, isActive)
}
