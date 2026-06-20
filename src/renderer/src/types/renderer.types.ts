/**
 * 渲染进程共享类型定义
 */

import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

// ── 布局树类型 ──

export type LayoutNode = ContainerNode | LeafNode

export interface ContainerNode {
  type: 'container'
  direction: 'horizontal' | 'vertical'
  children: LayoutNode[]
  sizes: number[]
}

export interface LeafNode {
  type: 'leaf'
  paneId: string
}

// ── 序列化类型 ──

export interface LayoutStateNode {
  type: 'container' | 'leaf'
  direction?: 'horizontal' | 'vertical'
  children?: LayoutStateNode[]
  sizes?: number[]
  paneId?: string
}

export interface PaneState {
  id: string
  shell: string
  cwd: string
  title?: string
}

export interface TabState {
  id: string
  title: string
  activePaneId: string
  layout: LayoutStateNode
  panes: PaneState[]
}

export interface LayoutState {
  version: string
  tabs: TabState[]
  activeTabId: string
  windowState?: {
    sidebarWidth: number
  }
}

// ── 配置类型 ──

export interface Config {
  general: {
    defaultShell: string
    defaultCwd: string
    fontSize: number
    theme: 'dark' | 'light'
    scrollback: number
  }
}

// ── Shell 类型 ──

export interface ShellInfo {
  name: string
  path: string
  args?: string[]
}

// ── Pane 类型 ──

export interface Pane {
  id: string
  sessionId: string
  shell: string
  cwd: string
  title?: string
  terminal: Terminal
  fitAddon: FitAddon
  element: HTMLElement
  commandInputContainerEl?: HTMLElement
  commandInputEl?: HTMLTextAreaElement
  cleanupData: () => void
  cleanupExit: () => void
  cleanupError: () => void
}

// ── Tab 类型 ──

export interface Tab {
  id: string
  title: string
  layout: LayoutNode
  panes: Map<string, Pane>
  focusedPaneId: string
  containerEl: HTMLElement
  tabEl: HTMLElement
}

// ── 项目类型 ──

export interface Project {
  id: string
  name: string
  path: string
}

// ── 主题定义 ──

export const THEMES = {
  dark: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    selectionBackground: '#264f78'
  },
  light: {
    background: '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    selectionBackground: '#add6ff'
  }
}
