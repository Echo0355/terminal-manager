/**
 * 标签页 UI 组件测试
 *
 * 测试 tab-chrome.ts 中的标签页相关 UI 函数。
 * 覆盖以下方面：
 * - 路径标题提取
 * - 面板显示标题解析
 * - 面板标签栏 DOM 结构
 * - 工作区标签渲染
 */

// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest'
import {
  titleFromCwd,
  getPaneDisplayTitle,
  createPaneTabStrip,
  renderWorkspaceTab
} from './tab-chrome'

// ── titleFromCwd ──

describe('titleFromCwd', () => {
  it('从 Unix 路径提取目录名', () => {
    expect(titleFromCwd('/home/user/projects/my-app')).toBe('my-app')
  })

  it('从 Windows 路径提取目录名', () => {
    expect(titleFromCwd('C:\\Users\\user\\projects\\my-app')).toBe('my-app')
  })

  it('空字符串返回 null', () => {
    expect(titleFromCwd('')).toBeNull()
  })

  it('undefined 返回 null', () => {
    expect(titleFromCwd()).toBeNull()
  })

  it('单级路径返回该级名称', () => {
    expect(titleFromCwd('/home')).toBe('home')
  })

  it('尾部斜杠不影响结果', () => {
    expect(titleFromCwd('/home/user/projects/')).toBe('projects')
  })

  it('尾部反斜杠不影响结果', () => {
    expect(titleFromCwd('C:\\Users\\user\\')).toBe('user')
  })
})

// ── getPaneDisplayTitle ──

describe('getPaneDisplayTitle', () => {
  it('优先使用 pane.title', () => {
    const pane = { title: 'My Terminal', cwd: '/home/user' } as any
    expect(getPaneDisplayTitle(pane, 'fallback')).toBe('My Terminal')
  })

  it('title 为空时从 cwd 提取', () => {
    const pane = { title: '', cwd: '/home/user/projects/app' } as any
    expect(getPaneDisplayTitle(pane, 'fallback')).toBe('app')
  })

  it('title 和 cwd 都为空时使用 fallback', () => {
    const pane = { title: '', cwd: '' } as any
    expect(getPaneDisplayTitle(pane, 'Terminal')).toBe('Terminal')
  })

  it('title 为 undefined 时从 cwd 提取', () => {
    const pane = { cwd: '/tmp/workdir' } as any
    expect(getPaneDisplayTitle(pane, 'fallback')).toBe('workdir')
  })
})

// ── createPaneTabStrip ──

describe('createPaneTabStrip', () => {
  it('创建正确的 DOM 结构', () => {
    const strip = createPaneTabStrip({
      paneId: 'pane-1',
      tabId: 'tab-1',
      title: 'bash'
    })

    expect(strip.className).toBe('pane-tab-strip')
    expect(strip.getAttribute('data-pane-id')).toBe('pane-1')
    expect(strip.getAttribute('data-tab-id')).toBe('tab-1')

    // 子元素：pane-tab 和 pane-actions（包含 Claude + Codex + IDE 菜单 + close）
    expect(strip.children).toHaveLength(2)

    const paneTab = strip.children[0] as HTMLElement
    expect(paneTab.className).toBe('pane-tab')
    expect(paneTab.getAttribute('draggable')).toBe('true')
    expect(paneTab.getAttribute('data-pane-id')).toBe('pane-1')
    expect(paneTab.getAttribute('data-tab-id')).toBe('tab-1')

    const titleEl = paneTab.querySelector('.pane-tab-title')
    expect(titleEl).not.toBeNull()
    expect(titleEl!.textContent).toBe('bash')

    const actions = strip.children[1] as HTMLElement
    expect(actions.className).toBe('pane-actions')
    expect(actions.children).toHaveLength(4)

    const claudeBtn = actions.children[0] as HTMLElement
    expect(claudeBtn.className).toBe('pane-tool-btn claude-run-btn')
    expect(claudeBtn.getAttribute('data-pane-id')).toBe('pane-1')

    const codexBtn = actions.children[1] as HTMLElement
    expect(codexBtn.className).toBe('pane-tool-btn codex-run-btn')
    expect(codexBtn.getAttribute('data-pane-id')).toBe('pane-1')
    expect(codexBtn.getAttribute('draggable')).toBe('false')

    const editorMenuBtn = actions.children[2] as HTMLElement
    expect(editorMenuBtn.className).toBe('pane-tool-btn editor-open-menu-btn')
    expect(editorMenuBtn.textContent).toBe('IDE')
    expect(editorMenuBtn.getAttribute('data-pane-id')).toBe('pane-1')
    expect(editorMenuBtn.getAttribute('draggable')).toBe('false')

    const closeBtn = actions.children[3] as HTMLElement
    expect(closeBtn.className).toBe('pane-close-btn')
    expect(closeBtn.textContent).toBe('×')
    expect(closeBtn.getAttribute('draggable')).toBe('false')
  })

  it('active 选项添加 active-pane-tab 类名', () => {
    const strip = createPaneTabStrip({
      paneId: 'pane-1',
      tabId: 'tab-1',
      title: 'bash',
      active: true
    })
    const paneTab = strip.children[0] as HTMLElement
    expect(paneTab.classList.contains('active-pane-tab')).toBe(true)
  })

  it('非 active 时不添加 active-pane-tab 类名', () => {
    const strip = createPaneTabStrip({
      paneId: 'pane-1',
      tabId: 'tab-1',
      title: 'bash'
    })
    const paneTab = strip.children[0] as HTMLElement
    expect(paneTab.classList.contains('active-pane-tab')).toBe(false)
  })
})

// ── renderWorkspaceTab ──

describe('renderWorkspaceTab', () => {
  function createMockTab(overrides: { id?: string; title?: string; paneCount?: number } = {}) {
    const tabEl = document.createElement('div')
    return {
      id: overrides.id || 'tab-1',
      title: overrides.title || 'My Tab',
      tabEl,
      panes: new Map(Array.from({ length: overrides.paneCount || 1 }, (_, i) => [`pane-${i}`, {}]))
    } as any
  }

  it('单面板标签的 class 和内容', () => {
    const tab = createMockTab({ title: 'Terminal', paneCount: 1 })
    renderWorkspaceTab(tab, false)

    expect(tab.tabEl.className).toBe('tab')
    expect(tab.tabEl.getAttribute('data-tab-id')).toBe('tab-1')
    expect(tab.tabEl.getAttribute('draggable')).toBe('true')

    const titleEl = tab.tabEl.querySelector('.tab-title')
    expect(titleEl).not.toBeNull()
    expect(titleEl!.textContent).toBe('Terminal')
  })

  it('active 标签添加 active 类名', () => {
    const tab = createMockTab()
    renderWorkspaceTab(tab, true)
    expect(tab.tabEl.className).toContain('active')
  })

  it('非 active 标签不添加 active 类名', () => {
    const tab = createMockTab()
    renderWorkspaceTab(tab, false)
    expect(tab.tabEl.className).not.toContain('active')
  })

  it('多面板标签显示分屏徽章', () => {
    const tab = createMockTab({ paneCount: 3 })
    renderWorkspaceTab(tab, false)

    expect(tab.tabEl.className).toContain('has-splits')

    const badge = tab.tabEl.querySelector('.tab-split-badge')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('3')
  })

  it('单面板标签不显示分屏徽章', () => {
    const tab = createMockTab({ paneCount: 1 })
    renderWorkspaceTab(tab, false)

    expect(tab.tabEl.className).not.toContain('has-splits')
    expect(tab.tabEl.querySelector('.tab-split-badge')).toBeNull()
  })

  it('包含关闭按钮', () => {
    const tab = createMockTab()
    renderWorkspaceTab(tab, false)

    const closeBtn = tab.tabEl.querySelector('.tab-close')
    expect(closeBtn).not.toBeNull()
    expect(closeBtn!.textContent).toBe('×')
  })
})
