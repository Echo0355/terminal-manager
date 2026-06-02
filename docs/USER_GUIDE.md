# Terminal Manager User Guide

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

English | **[中文](./USER_GUIDE_CN.md)**

## Table of Contents

- [Interface Overview](#interface-overview)
- [Terminal Operations](#terminal-operations)
- [Tab Management](#tab-management)
- [Split Layout](#split-layout)
- [Drag and Drop](#drag-and-drop)
- [Project Management](#project-management)
- [Settings](#settings)
- [Keyboard Shortcuts](#keyboard-shortcuts)

## Interface Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│ File  Edit  View  Terminal  Help                                      │
├────┬──────────────────────────────────────────────────────────────────┤
│    │ [Terminal 1] [Terminal 2] [Terminal 3] ＋                        │
│ ├─ │ ┌──────────────────────┬──────────────────────┐                │
│ │📁│ │  ┌─────┐ ┌─────┐    │  ┌─────┐             │                │
│ │  │ │  │Pane1│ │Pane2│    │  │Pane1│             │                │
│ │  │ │  └─────┘ └─────┘    │  └─────┘             │                │
│ ├─ │ │  PowerShell > _     │  PowerShell > _      │                │
│ │⚙│ ├──────────────────────┴──────────────────────┤                │
│    │ │  PowerShell > _                             │                │
│    │ └────────────────────────────────────────────┘                │
├────┴──────────────────────────────────────────────────────────────────┤
│  PowerShell  ~\projects                              UTF-8  Dark     │
└───────────────────────────────────────────────────────────────────────┘
  Activity Bar  Sidebar        Tab Bar              Terminal Area  Status Bar
```

### Area Description

| Area | Function |
|------|----------|
| **Activity Bar** | Left icon bar (48px), contains sidebar toggle and settings buttons, always dark theme |
| **Sidebar** | Project explorer, add/delete/open projects, resizable width (150-400px) |
| **Tab Bar** | Workspace tabs, support new, close, drag reorder, shows pane count badge when split |
| **Pane Tab Bar** | Secondary tab bar inside each pane in split mode, shows pane title and close button |
| **Terminal Area** | xterm.js rendered terminal, supports horizontal/vertical split, drag to resize |
| **Status Bar** | Bottom info bar, left shows Shell name and working directory, right shows pane count, encoding, and theme toggle |

## Terminal Operations

### Open New Terminal

- Press `Ctrl+T`
- Double-click a project name in the Explorer
- Right-click a project in the Explorer to choose a Shell and create a tab with that project as the working directory
- From menu "Terminal → New Terminal"

### Enter Commands

Type commands directly in the terminal, same as using the system terminal.

### Copy and Paste

- **Copy**: Automatically copies selected text to clipboard, or press `Ctrl+Shift+C`
- **Paste**: Press `Ctrl+Shift+V` or `Ctrl+V`
- **Right-click menu**: Copies when text is selected, pastes when no text is selected

### Close Terminal

- Click the **×** button on the tab
- Press `Ctrl+W`
- From menu "File → Close Tab"

A confirmation dialog will appear when closing.

### Clickable Links

URLs in terminal output are automatically recognized as clickable links.

## Tab Management

### New Tab

Press `Ctrl+T` to create a tab with the default Shell.

Right-click a project in the Explorer to choose one of the auto-detected Shells and create a tab using that project as the working directory.

### Switch Tabs

- Click on a tab
- Press `Ctrl+Tab` to switch to the next tab
- Press `Ctrl+Shift+Tab` to switch to the previous tab
- Press `Ctrl+1~9` to switch to a specific tab position

### Drag Reorder

Tabs support drag reorder. Hold and drag a tab to the target position.

### Split Badge

When a tab contains multiple panes, a blue badge showing the pane count is displayed on the tab for easy identification of split status.

### Close Tab

- Click the **×** button on the tab
- Press `Ctrl+W`

If the tab contains multiple panes, a confirmation will be requested first.

## Split Layout

### Horizontal Split (Left/Right)

- Press `Ctrl+Shift+D`
- From menu "Terminal → Horizontal Split"

The current pane will split into two panes left and right, and the new pane automatically gains focus.

### Vertical Split (Up/Down)

- Press `Ctrl+Shift+Alt+D`
- From menu "Terminal → Vertical Split"

The current pane will split into two panes up and down.

### Resize Panes

Hover the mouse over the divider between panes (4px wide), and drag when the cursor changes to ↔ or ↕.

The divider highlights on hover and drag. Dragging updates the layout in real-time, and automatically normalizes to ensure sizes sum to 100% on mouse release.

### Focus Navigation

Press `Alt+Arrow Keys` to move focus between adjacent panes:

| Shortcut | Function |
|----------|----------|
| `Alt+←` | Focus moves to left pane |
| `Alt+→` | Focus moves to right pane |
| `Alt+↑` | Focus moves to upper pane |
| `Alt+↓` | Focus moves to lower pane |

The focused pane will have a blue border highlight.

### Close Pane

- Press `Alt+Shift+W`
- Click the **×** button in the pane tab bar

If only one pane remains, closing the pane closes the entire tab.

## Drag and Drop

Terminal Manager supports VS Code-style drag and drop operations.

### Drag Pane

Drag pane tabs to reorder within the same tab, or move to other tabs.

### Drag to Edge

When dragging a pane tab to the edge area of a target pane, a split operation is triggered:

| Drop Position | Effect |
|---------------|--------|
| Target pane center | Replace target pane |
| Target pane left | Horizontal split to the left of target |
| Target pane right | Horizontal split to the right of target |
| Target pane top | Vertical split above target |
| Target pane bottom | Vertical split below target |

A direction indicator is displayed during drag to show the position after release.

### Drag to Tab Bar

Dragging a pane tab to the top tab bar extracts that pane into a new independent tab.

## Project Management

### Add Project

1. Click the **＋** button at the top of the sidebar
2. Select a project directory in the system directory selection dialog
3. The project will appear in the sidebar list

### Open Project Terminal

- **Double-click project name**: Opens in a new tab with working directory set to the project directory
- **Click ▶ button**: Same as above

### Delete Project

Hover over the project and click the **✕** button. A confirmation dialog will appear.

Deleting a project does not delete the directory itself, only removes it from the list.

### Sidebar Operations

- **Resize width**: Drag the right edge of the sidebar (min 150px, max 400px)
- **Collapse/Expand**: Click the sidebar icon in the activity bar

## Settings

Press `Ctrl+,` to open the settings dialog, or click the gear icon at the bottom of the activity bar.

### Appearance Settings

| Setting | Description |
|---------|-------------|
| Theme | Dark or light theme with visual preview color blocks. **Takes effect immediately** |

### Terminal Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Default Shell | Choose an auto-detected Shell or enter a custom path | `powershell.exe` (Windows) / `/bin/zsh` (macOS) |
| Default Directory | Default working directory for new terminals | User home directory |
| Font Size | Terminal font size (8-32) | 14 |
| Scrollback | Terminal history lines (100-100000) | 10000 |

> **Note**: Theme changes apply to existing terminals immediately. Shell, directory, font size, and scrollback changes are used immediately by newly created terminals; existing terminals remain unchanged.

### Save Settings

Click the "Save" button after making changes. Press `Esc` or click outside the dialog to cancel.

### Auto-detected Shells

The application automatically detects available shells on startup:

**Windows:**
- PowerShell (always available)
- CMD (detected from `%COMSPEC%` environment variable)
- Git Bash (`C:\Program Files\Git\bin\bash.exe`, requires Git installed)
- WSL (`C:\Windows\System32\wsl.exe`, requires WSL enabled)

**macOS / Linux:**
- Zsh (`/bin/zsh`)
- Bash (`/bin/bash`)
- Sh (`/bin/sh`)
- Fish (`/usr/bin/fish` or `/opt/homebrew/bin/fish`)

Only detected shells and the default shell specified in the configuration file are allowed.

## Keyboard Shortcuts

### Tab Operations

| Shortcut | Function |
|----------|----------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close current pane (closes tab when last pane) |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+1` ~ `Ctrl+9` | Switch to Nth tab |

### Split Operations

| Shortcut | Function |
|----------|----------|
| `Ctrl+Shift+D` | Horizontal split (left/right) |
| `Ctrl+Shift+Alt+D` | Vertical split (up/down) |
| `Alt+Shift+W` | Close current pane |

### Focus Navigation

| Shortcut | Function |
|----------|----------|
| `Alt+←` | Focus left |
| `Alt+→` | Focus right |
| `Alt+↑` | Focus up |
| `Alt+↓` | Focus down |

### Clipboard

| Shortcut | Function |
|----------|----------|
| `Ctrl+Shift+C` | Copy selected text |
| `Ctrl+Shift+V` / `Ctrl+V` | Paste |

### Application

| Shortcut | Function |
|----------|----------|
| `Ctrl+,` | Open settings |
| `Esc` | Close dialog |
| `F11` | Toggle fullscreen |

### Menus

| Menu | Functions |
|------|-----------|
| **File** | New Tab, Close Tab, Settings, Exit |
| **Edit** | Undo, Redo, Cut, Copy, Paste, Delete, Select All |
| **View** | Reload, Force Reload, Developer Tools, Zoom Controls, Fullscreen |
| **Terminal** | New Terminal, Horizontal Split, Vertical Split, Close Pane, Focus Navigation, Tab Switching |
| **Help** | About Dialog |
