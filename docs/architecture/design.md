# Terminal Manager — 技术设计文档

> 一个基于 Electron 的跨平台（Windows / macOS）多终端管理工具，解决多终端窗口混乱和路径切换繁琐的问题。

> 可行性和第一版范围已单独收敛：决策评估见 [可行性分析](../product/feasibility-analysis.md)，开发落地范围见 [MVP 规格](../product/mvp-spec.md)。本文保留为长期技术蓝图，不代表所有功能都进入 MVP。

---

## 1. 项目概述

### 1.1 背景

在日常开发中，经常需要同时打开多个终端会话，分别运行不同的任务。现有痛点：

- **窗口泛滥**：每个终端一个窗口，任务栏被占满，切换困难
- **路径操作繁琐**：每次打开新终端都要手动 `cd` 到项目目录
- **布局无记忆**：关闭应用后，之前打开的标签、分屏布局和工作目录需要手动重建

### 1.2 目标

打造一个轻量级的跨平台桌面终端管理器，具备：

- 在一个窗口内管理多个终端会话（标签页）
- 一键从常用项目目录打开终端
- 自由分屏平铺，同时查看多个终端
- 标签、分屏布局和工作目录持久化，重启后可按记录重新创建终端
- **跨平台支持**：Windows 和 macOS 使用同一套代码库，自动适配各平台的 Shell、快捷键和系统特性

### 1.3 核心价值

```
以前：5 个项目 → 5 个窗口 → 手动 cd 5 次 → 任务栏一团糟
现在：1 个窗口 → 5 个标签 → 一键打开 → 清晰管理
```

### 1.4 实现边界

第一版优先做“终端管理器”，不做“完整终端会话虚拟机”：

- 可以恢复：窗口尺寸、项目列表、标签、分屏布局、每个面板的 shell、启动目录和可选启动命令。
- 不承诺恢复：应用退出前正在运行的进程、交互中的命令、shell 内存状态、滚动缓冲里的全部历史输出。
- 如果未来需要真正保活和恢复运行中会话，应引入 `tmux` / `zellij` / 远程守护进程等会话后端，而不是只依赖 `node-pty`。
- Shell 状态识别默认是 best-effort：可以用于标题、路径辅助和提示，但不能作为可靠的退出码或任务状态来源。

---

## 2. 功能规划

### 功能优先级总览

```
🔴 必须有（没有就不好用）
🟡 应该有（大幅提升体验）
🟢 锦上添花（有了会很酷）
🔵 延展能力（不进入核心闭环）
```

### 2.1 MVP（最小可用版本）

| 优先级 | 功能 | 说明 |
|:---:|------|------|
| 🔴 | 多标签终端 | 在一个窗口内创建/关闭/切换多个终端标签 |
| 🔴 | 自定义 Shell | 支持 cmd / PowerShell / Git Bash / WSL |
| 🔴 | 快速路径打开 | 从项目列表一键在指定目录打开新终端 |
| 🔴 | 基础快捷键 | 新建标签、关闭标签、切换标签 |
| 🔴 | 基础分屏 | 支持左右/上下分屏，满足多任务查看 |
| 🔴 | 布局恢复 | 保存标签、面板布局、shell、cwd、启动命令，重启后重新创建 |
| 🟡 | 终端内容搜索 | 输出内容全文搜索，支持普通文本搜索，正则作为增强 |
| 🟡 | 字体连字 (Ligature) | 支持 Cascadia Code / Fira Code 等编程字体的连字效果 |
| 🟡 | 焦点高亮 | 获得焦点的面板边框高亮，失焦面板略微变暗 |

### 2.2 v1.0（核心功能）

| 优先级 | 功能 | 说明 |
|:---:|------|------|
| 🔴 | 命令面板 (Ctrl+Shift+P) | 快速访问所有功能，支持模糊搜索 |
| 🟡 | 项目管理 | 添加/删除/分组常用项目目录 |
| 🟡 | 布局持久化增强 | 保存窗口、侧边栏、活动标签、焦点面板等 UI 状态 |
| 🟡 | 主题定制 | 字体、字号、配色方案，内置多套主题 |
| 🟡 | 全局热键呼出 | 按一个键随时唤出/隐藏窗口（Quake 控制台风格） |
| 🟡 | 面板标题追踪 | 优先使用终端标题事件，失败时显示自定义标题或启动目录 |
| 🟡 | 智能路径识别 | 终端输出里的文件路径 Ctrl+Click 打开编辑器，URL 点击打开浏览器 |
| 🟢 | 快速重命名面板 | 双击面板标题可以重命名，方便区分多个同类终端 |
| 🟢 | 彩虹标签 | 每个标签自动分配不同颜色，比纯白标签好看也好找 |

### 2.3 v1.5（特色功能）

| 优先级 | 功能 | 说明 |
|:---:|------|------|
| 🟡 | 布局模板 (Workspace) | 预设常用的分屏布局，一键恢复。如"开发环境"= 左编辑器终端 + 右上 Dev Server + 右下 Git |
| 🟡 | 面板拖拽重排 | 用鼠标拖拽面板在布局树中移动位置，不只是调大小 |
| 🟡 | 浮动面板 | 类似 Zellij 的浮窗，可以盖在分屏布局上方，适合临时查看日志 |
| 🟡 | Shell 集成 | 可选增强：通过 OSC 序列或主动脚本提高 cwd、命令开始/结束识别准确度 |
| 🟢 | 后台任务通知 | 依赖 Shell 集成；检测到命令完成时发送桌面通知 |
| 🟢 | 剪贴板历史 | 终端里复制过的内容可以回溯查找 |
| 🟢 | 输入广播 | 同时在多个面板输入相同内容，批量操作多台机器 |
| 🟢 | 面板缩略图预览 | 鼠标悬停在标签上时，显示该标签下所有面板的缩略图布局 |

### 2.4 未来规划

| 优先级 | 功能 | 说明 |
|:---:|------|------|
| 🔵 | 插件系统 | npm 插件生态，支持 panel / theme / middleware 三种插件类型 |
| 🔵 | SSH 连接管理 | 保存 SSH 连接配置，GUI 管理，SFTP 文件传输 |
| 🔵 | 命令片段 | 保存常用命令，一键执行 |
| 🔵 | 终端录制 | 录制终端操作过程 |
| 🔵 | 命令块 UI (Warp 风格) | 每条命令+输出是一个可交互的块，支持折叠、搜索、分享 |
| 🔵 | 远程协作 | 多人共享终端会话（类似 tmate） |
| 🔵 | GPU 加速渲染 | 使用 WebGL 加速终端渲染，提升大输出场景的性能 |
| 🔵 | 真正的会话保活 | 通过 `tmux` / `zellij` / 守护进程恢复退出前仍在运行的进程 |

---

## 3. 技术栈

### 3.1 核心依赖

| 组件 | 技术 | 用途 |
|------|------|------|
| 桌面框架 | **Electron** | 跨平台桌面应用容器 |
| 终端后端 | **node-pty** | 创建和管理伪终端（PTY）进程，跨平台支持 Windows/macOS/Linux |
| 终端前端 | **@xterm/xterm** + **@xterm/addon-fit** | 浏览器端终端模拟器和渲染 |
| UI 层 | **原生 TypeScript + DOM** | 不使用前端框架，直接操作 DOM |
| 构建工具 | **Vite** + **electron-vite** | 开发热更新和打包 |
| 打包分发 | **electron-builder** | 构建安装包（Windows .exe / macOS .dmg） |
| 平台适配 | **自定义 Platform 模块** | 统一封装平台差异（Shell、快捷键、路径、字体） |

### 3.2 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 应用                         │
│                                                         │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │     主进程 (Main)    │  │    渲染进程 (Renderer)    │  │
│  │                     │  │                          │  │
│  │  ┌───────────────┐  │  │  ┌────────────────────┐  │  │
│  │  │   PTY 管理器   │  │  │  │    Pane + xterm    │  │  │
│  │  │               │  │  │  │    (每个面板一个)    │  │  │
│  │  │  node-pty     │  │  │  └────────┬───────────┘  │  │
│  │  │  创建终端进程  │  │  │           │              │  │
│  │  └───────┬───────┘  │  │  ┌────────┴───────────┐  │  │
│  │          │          │  │  │      UI 层          │  │  │
│  │          │ IPC      │  │  │  标签栏 / 侧边栏    │  │  │
│  │          ├──────────────┤  │  项目列表 / 搜索    │  │  │
│  │          │          │  │  └────────────────────┘  │  │
│  │  ┌───────┴───────┐  │  │                          │  │
│  │  │   配置管理器   │  │  └──────────────────────────┘  │
│  │  │  读写 JSON     │  │                               │
│  │  └───────────────┘  │                               │
│  └─────────────────────┘                               │
└─────────────────────────────────────────────────────────┘
         ↕ node-pty                    ↕ IPC (ipcMain/ipcRenderer)
    系统 Shell 进程                用户界面交互
   (pwsh/cmd/bash)
```

### 3.3 为什么选这些技术

**node-pty + xterm.js 组合：**
- 这是目前 Electron 终端模拟的事实标准方案
- VS Code 的内置终端、Hyper 终端都用这套组合
- node-pty 负责跟操作系统 shell 交互，xterm.js 负责渲染
- 支持所有 shell（cmd、PowerShell、Bash、Zsh 等）

**Electron 而非 Tauri：**
- Tauri 的 Rust 后端对接 PTY 需要额外的 crate（portable-pty），生态不如 node-pty 成熟
- Electron 有大量终端应用的参考实现（Hyper、Alacritty 的 Electron 版）
- 开发效率更高，调试更方便

**原生 TypeScript + DOM 而非 React / Vue：**
- UI 层很薄（标签栏、侧边栏、状态栏），90% 的屏幕面积是 xterm.js 在渲染
- VS Code 的内置终端也没有用前端框架，直接操作 DOM
- 减少依赖和包体积，Electron 已经很重了
- 核心逻辑（PTY 管理、布局树、IPC）跟框架无关，是纯 TypeScript

**跨平台可行性：**
- Electron + node-pty + xterm.js 组合天然跨平台，VS Code 内置终端已验证此方案在 Windows/macOS/Linux 上均可工作
- node-pty 底层调用各平台 PTY API（Windows: ConPTY, macOS/Linux: POSIX PTY），上层接口统一
- xterm.js 纯前端渲染，无平台差异
- 主要适配工作集中在 Shell 检测、默认快捷键、路径处理和系统集成，均为配置层面

---

## 4. 核心模块设计

### 4.0 平台适配层（Platform Adapter）

统一封装 Windows 和 macOS 之间的差异，所有平台相关逻辑集中在此模块，其他模块通过此层访问平台信息。

#### 4.0.1 平台检测与工具

```typescript
// src/shared/platform.ts

export const Platform = {
  isWindows: process.platform === 'win32',
  isMacOS: process.platform === 'darwin',
  isLinux: process.platform === 'linux',

  /** 路径分隔符 */
  pathSep: process.platform === 'win32' ? '\\' : '/',

  /** 修饰键名称（macOS 用 Cmd，Windows 用 Ctrl） */
  get modKey(): 'Cmd' | 'Ctrl' {
    return this.isMacOS ? 'Cmd' : 'Ctrl';
  },

  /** 修饰键的 Electron accelerator 格式 */
  get modKeyAccelerator(): 'CommandOrControl' | 'CmdOrCtrl' {
    return 'CommandOrControl';  // Electron 统一用这个，自动适配平台
  },

  /** 用户主目录 */
  get homeDir(): string {
    return process.env.HOME || process.env.USERPROFILE || '';
  },

  /** 默认 Shell 路径 */
  get defaultShell(): string {
    if (this.isWindows) return 'powershell.exe';
    return process.env.SHELL || '/bin/zsh';
  },
};
```

#### 4.0.2 Shell 检测（按平台）

```typescript
// src/main/shells.ts

interface ShellInfo {
  name: string;         // 显示名称
  path: string;         // 可执行文件路径
  args?: string[];      // 默认启动参数
  isDefault?: boolean;  // 是否为平台默认 Shell
}

/**
 * 检测当前平台可用的 Shell 列表
 */
function detectAvailableShells(): ShellInfo[] {
  if (Platform.isWindows) {
    return detectWindowsShells();
  } else {
    return detectUnixShells();
  }
}

function detectWindowsShells(): ShellInfo[] {
  const shells: ShellInfo[] = [];

  // PowerShell（始终可用，Windows 10+）
  shells.push({
    name: 'PowerShell',
    path: 'powershell.exe',
    isDefault: true,
  });

  // CMD
  shells.push({
    name: 'CMD',
    path: process.env.COMSPEC || 'cmd.exe',
  });

  // Git Bash（检测是否安装）
  const gitBashPath = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (fs.existsSync(gitBashPath)) {
    shells.push({
      name: 'Git Bash',
      path: gitBashPath,
      args: ['--login', '-i'],
    });
  }

  // WSL（检测是否可用）
  const wslPath = 'C:\\Windows\\System32\\wsl.exe';
  if (fs.existsSync(wslPath)) {
    shells.push({
      name: 'WSL',
      path: wslPath,
    });
  }

  return shells;
}

function detectUnixShells(): ShellInfo[] {
  const shells: ShellInfo[] = [];

  // 从 /etc/shells 读取合法 Shell 列表
  const etcShellsPath = '/etc/shells';
  if (fs.existsSync(etcShellsPath)) {
    const content = fs.readFileSync(etcShellsPath, 'utf-8');
    const shellPaths = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    for (const shellPath of shellPaths) {
      const name = path.basename(shellPath);
      shells.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),  // 首字母大写
        path: shellPath,
        isDefault: shellPath === process.env.SHELL,
      });
    }
  } else {
    // fallback：手动检测常见 Shell
    const candidates = [
      { name: 'Zsh', path: '/bin/zsh' },
      { name: 'Bash', path: '/bin/bash' },
      { name: 'Fish', path: '/opt/homebrew/bin/fish' },  // Homebrew macOS
    ];
    for (const c of candidates) {
      if (fs.existsSync(c.path)) {
        shells.push({ ...c, isDefault: c.path === process.env.SHELL });
      }
    }
  }

  return shells;
}
```

#### 4.0.3 路径处理（跨平台）

```typescript
// src/shared/path-utils.ts

import * as nodePath from 'path';

/** 将 ~ 展开为用户主目录 */
export function expandHome(filePath: string): string {
  if (filePath.startsWith('~')) {
    return filePath.replace('~', Platform.homeDir);
  }
  return filePath;
}

/** 规范化路径分隔符 */
export function normalizePath(filePath: string): string {
  return Platform.isWindows
    ? filePath.replace(/\//g, '\\')
    : filePath.replace(/\\/g, '/');
}

/** 判断路径是否为绝对路径（兼容 Windows 盘符和 Unix） */
export function isAbsolute(filePath: string): boolean {
  return nodePath.isAbsolute(filePath);
}

/** 路径拼接（使用平台分隔符） */
export function joinPath(...segments: string[]): string {
  return nodePath.join(...segments);
}

/** file:// URI 转本地路径（OSC 7 使用） */
export function fileUriToPath(uri: string): string {
  if (uri.startsWith('file://')) {
    const pathPart = uri.slice(7);
    // Windows: file:///C:/Users/... → C:\Users\...
    if (Platform.isWindows && pathPart.startsWith('/')) {
      return normalizePath(pathPart.slice(1));
    }
    return normalizePath(decodeURIComponent(pathPart));
  }
  return uri;
}

/** 本地路径转 file:// URI */
export function pathToFileUri(filePath: string): string {
  const normalized = normalizePath(filePath);
  if (Platform.isWindows) {
    return `file:///${normalized.replace(/\\/g, '/')}`;
  }
  return `file://${normalized}`;
}
```

#### 4.0.4 字体配置（按平台）

```typescript
// src/shared/fonts.ts

export function getDefaultFontFamily(): string {
  if (Platform.isMacOS) {
    // macOS 内置等宽字体，Cascadia Code 需用户自行安装
    return 'Menlo, Monaco, Cascadia Code, monospace';
  }
  // Windows 默认
  return 'Cascadia Code, Consolas, monospace';
}
```

### 4.1 PTY 管理器（主进程）

负责创建、管理和销毁终端进程。

```typescript
// 核心接口
interface PtyManager {
  // 创建新的 PTY 进程
  createPty(options: PtyOptions): PtySession;

  // 向 PTY 写入数据（用户输入）
  writeToPty(sessionId: string, data: string): void;

  // 调整终端大小
  resizePty(sessionId: string, cols: number, rows: number): void;

  // 销毁 PTY 进程
  killPty(sessionId: string): void;

  // 获取所有活跃会话
  getActiveSessions(): PtySession[];
}

interface PtyOptions {
  shell: string;        // shell 路径，如 "powershell.exe" 或 "/bin/zsh"
  args?: string[];      // shell 启动参数
  cwd: string;          // 初始工作目录
  command?: string;     // 进入 shell 后自动执行的命令（可选）
  env?: Record<string, string>;  // 环境变量
  cols?: number;        // 列数
  rows?: number;        // 行数
}

interface PtySession {
  id: string;           // 唯一标识
  pty: IPty;            // node-pty 实例
  title: string;        // 标签标题
  cwd: string;          // 启动工作目录；当前目录由 Shell 集成 best-effort 更新
}
```

**关键实现：**

```typescript
import * as pty from 'node-pty';
import { Platform } from '../shared/platform';
import { expandHome, normalizePath } from '../shared/path-utils';

class PtyManagerImpl implements PtyManager {
  private sessions: Map<string, PtySession> = new Map();

  createPty(options: PtyOptions): PtySession {
    const id = generateId();
    const shellPath = resolveShell(options.shell);
    const cwd = normalizePath(expandHome(options.cwd));

    // macOS/Linux 环境变量需要继承 HOME、PATH 等
    const env = Platform.isWindows
      ? { ...process.env, ...options.env }
      : { ...process.env, TERM: 'xterm-256color', ...options.env };

    const shell = pty.spawn(shellPath, options.args || [], {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env,
    });

    // 监听终端输出，发送到渲染进程
    shell.onData((data: string) => {
      // 通过 IPC 发送给对应的 xterm.js 实例
      mainWindow.webContents.send(`pty:data:${id}`, data);
    });

    // 监听终端退出
    shell.onExit(({ exitCode }) => {
      mainWindow.webContents.send(`pty:exit:${id}`, exitCode);
      this.sessions.delete(id);
    });

    if (options.command) {
      shell.write(`${options.command}\r`);
    }

    const session: PtySession = {
      id,
      pty: shell,
      title: path.basename(shellPath) || 'Terminal',  // path.basename 自动处理 / 和 \
      cwd: options.cwd,
    };

    this.sessions.set(id, session);
    return session;
  }
}
```

### 4.2 标签页管理器（渲染进程）

管理终端标签的创建、切换、关闭。

```
标签页状态机：

  [新建] ──创建──→ [活动] ──切换──→ [后台]
                    ↑  │              │
                    │  └──关闭──→ [销毁]
                    │                │
                    └────切换────────┘
```

```typescript
interface Tab {
  id: string;           // 标签唯一 ID，和 PTY session ID 解耦
  title: string;        // 显示标题
  color?: string;       // 标签颜色
  layout: LayoutNode;   // 标签内部分屏布局树
  panes: Map<string, Pane>; // 标签内所有面板运行态实例
  focusedPaneId: string;    // 当前焦点面板
}
```

关系约束：

- `Tab` 是一个工作区容器，可以包含一个或多个 `Pane`。
- `Pane` 是终端面板运行态，拥有一个 `sessionId`、一个 xterm.js 实例和一个 DOM 容器。
- `PtySession` 只存在于主进程，渲染进程只保存 `sessionId` 和面板元数据。
- 持久化时只保存可序列化的 `TabState` / `PaneState`，不保存 `Terminal`、`FitAddon`、`HTMLElement`、`IPty` 等运行态对象。

### 4.3 项目管理器

管理常用项目目录，支持一键打开。

```typescript
interface Project {
  id: string;
  name: string;         // 显示名称
  path: string;         // 项目路径
  group?: string;       // 分组名称
  shell?: string;       // 指定 shell（可选，覆盖默认）
  color?: string;       // 标签颜色标记
}
```

**项目数据存储：**

```json
{
  "projects": [
    {
      "id": "proj_001",
      "name": "Terminal Manager",
      "path": "E:\\VibeCoding\\terminal-manager",
      "group": "开发中",
      "color": "#4CAF50"
    },
    {
      "id": "proj_002",
      "name": "Claude Code",
      "path": "E:\\VibeCoding\\claude-project",
      "group": "AI 工具",
      "color": "#2196F3"
    }
  ]
}
```

### 4.4 分屏布局引擎（Pane Layout Engine）

每个标签内部使用**树形布局**管理面板分割，实现类似 Windows Terminal 的自由分屏效果。每个容器节点可以有多个子节点（N 叉树），支持二分、三列、田字格等多种布局。

#### 4.4.1 布局树结构

```
标签 Tab-1 的布局树：

              Container (H)
              ┌─────┴─────┐
         Leaf (Pane-A)  Container (V)
                         ┌────┴────┐
                    Leaf (Pane-B)  Leaf (Pane-C)

渲染结果：
┌──────────────┬──────────────┐
│              │   Pane-B     │
│   Pane-A     ├──────────────┤
│              │   Pane-C     │
└──────────────┴──────────────┘

说明：
- Container(H) = 水平分割，子节点左右排列
- Container(V) = 垂直分割，子节点上下排列
- Leaf = 叶子节点，包含一个终端实例（PTY + xterm.js）
- 分割方向与父 Container 的方向垂直
```

#### 4.4.2 数据模型

```typescript
// 布局节点 — 树形结构（每个容器可有多个子节点）
type LayoutNode = ContainerNode | LeafNode;

interface ContainerNode {
  type: 'container';
  direction: 'horizontal' | 'vertical';  // 分割方向
  children: LayoutNode[];                 // 子节点（≥2 个）
  sizes: number[];                        // 每个子节点的比例 [50, 50]
}

interface LeafNode {
  type: 'leaf';
  paneId: string;          // 面板唯一 ID
  sessionId: string;       // 对应的 PTY 会话 ID
}

// 面板实例 — 一个叶子节点对应一个面板
interface Pane {
  id: string;              // 面板 ID
  sessionId: string;       // PTY 会话 ID
  terminal: Terminal;      // xterm.js 实例
  fitAddon: FitAddon;      // 自适应插件
  element: HTMLElement;     // DOM 容器
  isFocused: boolean;      // 是否获得焦点
}

// 标签 — 包含布局树和所有面板
interface Tab {
  id: string;
  title: string;
  layout: LayoutNode;      // 布局树根节点
  panes: Map<string, Pane>; // 所有面板实例
  focusedPaneId: string;   // 当前焦点面板 ID
}
```

#### 4.4.3 分屏操作

```typescript
interface PaneManager {
  // 水平分屏：当前面板右边出现新终端
  splitHorizontal(tabId: string, paneId: string, options?: PtyOptions): Pane;

  // 垂直分屏：当前面板下方出现新终端
  splitVertical(tabId: string, paneId: string, options?: PtyOptions): Pane;

  // 关闭面板
  closePane(tabId: string, paneId: string): void;

  // 焦点切换（方向键）
  focusDirection(tabId: string, direction: 'up' | 'down' | 'left' | 'right'): void;

  // 焦点切换（序号）
  focusPane(tabId: string, paneIndex: number): void;

  // 调整分割比例
  resizePane(tabId: string, paneId: string, delta: number): void;

  // 最大化/还原当前面板
  toggleMaximize(tabId: string, paneId: string): void;

  // 均匀分布所有面板
  distributeEvenly(tabId: string): void;
}
```

**分屏流程：**

```
用户按 Ctrl+Shift+E（垂直分屏）：

1. 获取当前焦点面板（Leaf-B）
2. 找到 Leaf-B 的父节点（Container-V）
3. 创建新的 Leaf-D（新 PTY + 新 xterm.js）
4. 因为父节点已经是垂直方向，将 Leaf-D 插入到 Leaf-B 之后
5. 重新计算 sizes：[50, 50] → [33, 33, 34]
6. 渲染新的布局

结果：
┌──────────────┬──────────────┐
│              │   Pane-B     │
│   Pane-A     ├──────────────┤
│              │   Pane-C     │  ← 原有
│              ├──────────────┤
│              │   Pane-D     │  ← 新增
└──────────────┴──────────────┘
```

**方向不同的分屏：**

```
用户在 Pane-B 上按 Ctrl+Shift+D（水平分屏）：

1. 当前父节点是 Container-V（垂直方向）
2. 需要水平分屏，方向不同 → 创建新的 Container-H
3. 将 Leaf-B 替换为 Container-H
4. Container-H 的 children = [Leaf-B, Leaf-E]
5. sizes = [50, 50]

结果：
┌──────────────┬──────────────┬──────────────┐
│              │   Pane-B     │   Pane-E     │
│   Pane-A     ├──────────────┴──────────────┤
│              │          Pane-C             │
└──────────────┴─────────────────────────────┘
```

#### 4.4.4 分割线拖拽调整

```
鼠标悬停在面板边界时，光标变为 ↔ 或 ↕

拖拽流程：
1. mousedown → 识别被拖拽的分割线
2. 找到分割线两侧的叶子节点
3. 计算它们的共同父 Container
4. mousemove → 根据鼠标位置计算新的 sizes 比例
5. 限制最小比例（每个面板至少 10%）
6. mouseup → 应用最终比例，触发 resize 事件
7. 各面板的 xterm.js 重新 fit

实现要点：
- 分割线宽度 4px，hover 时高亮
- 拖拽时用 CSS cursor 标记方向
- 使用 requestAnimationFrame 平滑更新
- 拖拽结束后通知主进程各面板的新 cols/rows
```

```typescript
interface SplitterDrag {
  containerNode: ContainerNode;  // 分割线所在的容器
  leftChildIndex: number;        // 左侧/上侧子节点索引
  rightChildIndex: number;       // 右侧/下侧子节点索引
  startPos: number;              // 鼠标起始位置
  startSizes: number[];          // 初始比例
}
```

#### 4.4.5 焦点管理

```
焦点切换（方向键在面板间移动）：

假设当前焦点在 Pane-C，按 ↑：

┌──────────────┬──────────────┐
│              │   Pane-B ←   │  焦点移到这里
│   Pane-A     ├──────────────┤
│              │   Pane-C     │  ← 当前焦点
└──────────────┴──────────────┘

算法：
1. 找到当前焦点面板在布局树中的位置
2. 根据方向（↑↓←→）在树中查找最近的相邻叶子
3. 水平方向：在 Container(H) 的 children 中左右查找
4. 垂直方向：在 Container(V) 的 children 中上下查找
5. 如果当前容器内没有相邻节点，向上层容器查找
6. 找到目标叶子后，设置焦点，更新高亮边框
```

```typescript
// 焦点查找算法
function findAdjacentPane(
  root: LayoutNode,
  currentPaneId: string,
  direction: 'up' | 'down' | 'left' | 'right'
): LeafNode | null {
  // 1. 找到当前面板的路径（从根到叶子的节点序列）
  const path = findPath(root, currentPaneId);
  if (!path) return null;

  // 2. 沿路径回溯，找到包含目标方向的容器
  for (let i = path.length - 2; i >= 0; i--) {
    const container = path[i] as ContainerNode;
    const childIndex = container.children.indexOf(path[i + 1]);

    // 方向匹配：水平分屏找左右，垂直分屏找上下
    const isHorizontalDir = direction === 'left' || direction === 'right';
    const isHorizontalSplit = container.direction === 'horizontal';

    if (isHorizontalDir === isHorizontalSplit) {
      const targetIndex = (direction === 'left' || direction === 'up')
        ? childIndex - 1
        : childIndex + 1;

      if (targetIndex >= 0 && targetIndex < container.children.length) {
        // 找到目标子树，返回最接近的叶子节点
        return findClosestLeaf(container.children[targetIndex], direction);
      }
    }
  }

  return null; // 没有找到相邻面板
}
```

#### 4.4.6 快捷键

面板操作快捷键使用 `Alt`（macOS 上为 `Option`）键，两个平台保持一致：

| 快捷键 | macOS | 功能 |
|--------|-------|------|
| `Alt + Shift + -` | `⌥ + ⇧ + -` | 水平分屏（左右） |
| `Alt + Shift + =` | `⌥ + ⇧ + =` | 垂直分屏（上下） |
| `Alt + ←/→/↑/↓` | `⌥ + ←/→/↑/↓` | 焦点移到相邻面板 |
| `Alt + Shift + ←/→/↑/↓` | `⌥ + ⇧ + ←/→/↑/↓` | 调整当前面板大小 |
| `Alt + Enter` | `⌥ + ↵` | 最大化/还原当前面板 |
| `Alt + Shift + Z` | `⌥ + ⇧ + Z` | 全部均匀分布 |
| `Alt + Shift + W` | `⌥ + ⇧ + W` | 关闭当前面板 |

> 注：通用操作（标签切换、命令面板等）的快捷键见 §5.3，其中 `Ctrl` 在 macOS 上对应 `Cmd`。

#### 4.4.7 渲染实现

```typescript
// 递归渲染布局树
function renderLayout(node: LayoutNode, container: HTMLElement): void {
  if (node.type === 'leaf') {
    // 叶子节点：挂载 xterm.js 终端
    const pane = paneMap.get(node.paneId);
    container.appendChild(pane.element);
    pane.fitAddon.fit();
    return;
  }

  // 容器节点：创建 flex 布局
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = node.direction === 'horizontal' ? 'row' : 'column';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';

  node.children.forEach((child, index) => {
    const childContainer = document.createElement('div');
    childContainer.style.flex = `${node.sizes[index]}`;
    childContainer.style.minWidth = '100px';   // 最小宽度
    childContainer.style.minHeight = '50px';    // 最小高度
    childContainer.style.position = 'relative';

    renderLayout(child, childContainer);
    wrapper.appendChild(childContainer);

    // 添加分割线（最后一个子节点后面不加）
    if (index < node.children.length - 1) {
      const splitter = createSplitter(node, index);
      wrapper.appendChild(splitter);
    }
  });

  container.appendChild(wrapper);
}

// 创建可拖拽的分割线
function createSplitter(container: ContainerNode, index: number): HTMLElement {
  const splitter = document.createElement('div');
  splitter.className = 'pane-splitter';
  splitter.style.cursor = container.direction === 'horizontal' ? 'col-resize' : 'row-resize';
  splitter.style.width = container.direction === 'horizontal' ? '4px' : '100%';
  splitter.style.height = container.direction === 'horizontal' ? '100%' : '4px';
  splitter.style.backgroundColor = 'transparent';
  splitter.style.transition = 'background-color 0.15s';

  // hover 高亮
  splitter.addEventListener('mouseenter', () => {
    splitter.style.backgroundColor = '#0078d4';
  });
  splitter.addEventListener('mouseleave', () => {
    splitter.style.backgroundColor = 'transparent';
  });

  // 拖拽调整
  splitter.addEventListener('mousedown', (e) => {
    startResize(e, container, index);
  });

  return splitter;
}
```

---

### 4.5 Shell 状态识别

Shell 状态识别分为两层：默认启用的被动识别，以及用户可选开启的主动集成。第一版只把它作为体验增强，不把它作为核心逻辑的可靠依赖。

#### 4.5.1 原理

```
默认方案不注入代码到用户 shell，只从终端事件和输出中解析信息：

1. 标题追踪 → 使用 xterm.js 的 title 事件更新面板标题
2. 目录追踪 → 优先识别 OSC 7；没有时使用启动 cwd 或用户自定义标题
3. 命令开始/结束 → 被动 prompt 检测只能作为弱提示
4. 退出码 → 不从普通输出猜测，只有主动集成可提供可靠退出码
```

#### 4.5.2 实现

```typescript
interface ShellState {
  title?: string;
  cwd?: string;
  commandRunning?: boolean;
  lastExitCode?: number;
  reliability: 'passive' | 'integrated';
}

class ShellStateTracker {
  handleTitle(sessionId: string, title: string): void {
    updatePaneState(sessionId, {
      title,
      reliability: 'passive',
    });
  }

  handleOsc7(sessionId: string, uri: string): void {
    const cwd = fileUriToPath(uri);
    updatePaneState(sessionId, {
      cwd,
      reliability: 'passive',
    });
  }

  handleIntegratedEvent(sessionId: string, event: ShellIntegrationEvent): void {
    updatePaneState(sessionId, {
      cwd: event.cwd,
      commandRunning: event.kind === 'commandStart',
      lastExitCode: event.exitCode,
      reliability: 'integrated',
    });
  }
}
```

#### 4.5.3 用途

| 场景 | 说明 |
|------|------|
| 面板标题 | 优先显示终端标题；没有标题时显示启动目录或用户自定义名称 |
| 状态栏 | 显示 shell、cwd、识别可靠性 |
| 后台通知 | 只在主动集成可用时提供可靠命令完成通知 |
| 路径识别 | 有 cwd 时将相对路径转为绝对路径，否则只处理绝对路径和 URL |

**局限性：** 被动检测不保证准确，不应驱动关键业务逻辑。需要可靠命令生命周期时，应实现可选主动集成，例如 PowerShell profile 片段、bash/zsh precmd/preexec 或 OSC 133 兼容事件，并允许用户关闭。

---

### 4.6 全局热键（Quake Mode）

按一个键随时唤出/隐藏终端窗口，像 Quake 游戏的控制台。

```typescript
// 主进程
import { globalShortcut, app } from 'electron';
import { Platform } from '../shared/platform';

class QuakeMode {
  private isVisible: boolean = true;

  register(hotkey: string) {
    // Electron 的 CommandOrControl 自动适配平台
    globalShortcut.register(hotkey, () => {
      if (this.isVisible) {
        mainWindow.hide();
        // macOS: 隐藏后从 Dock 移除焦点，避免切换应用时自动唤出
        if (Platform.isMacOS) {
          app.hide();
        }
      } else {
        mainWindow.show();
        mainWindow.focus();
        // macOS: 将应用带到最前
        if (Platform.isMacOS) {
          app.show();
        }
      }
      this.isVisible = !this.isVisible;
    });
  }
}
```

**默认热键：** `` CommandOrControl + ` ``（反引号，与 Windows Terminal 一致，macOS 上为 `⌘ + `` `）

**行为：**
- 窗口隐藏时按热键 → 从屏幕顶部滑出，获得焦点
- 窗口显示时按热键 → 滑入顶部隐藏
- 可配置为从鼠标所在显示器弹出

**macOS 特殊处理：**
- macOS 的全局热键需要用户在「系统偏好设置 → 隐私与安全 → 辅助功能」中授权
- 应用首次注册全局热键时，应引导用户完成授权
- 使用 `app.hide()` 而非仅 `mainWindow.hide()`，确保应用不会在 `Cmd+Tab` 列表中保持激活状态

---

### 4.7 命令面板（Command Palette）

```
┌─────────────────────────────────────────────────────┐
│ 🔍 输入命令或搜索...                                  │
├─────────────────────────────────────────────────────┤
│  最近使用                                             │
│    新建标签                    Ctrl+T                 │
│    水平分屏                    Alt+Shift+-            │
│                                                     │
│  标签操作                                             │
│    关闭当前标签                Ctrl+Shift+W           │
│    切换到第 N 个标签           Ctrl+N                 │
│    重命名标签                  -                      │
│                                                     │
│  面板操作                                             │
│    垂直分屏                    Alt+Shift+=            │
│    最大化面板                  Alt+Enter              │
│    均匀分布                    Alt+Shift+Z            │
│                                                     │
│  工作区                                               │
│    保存当前布局为模板           -                      │
│    加载布局模板                -                      │
│                                                     │
│  设置                                                 │
│    打开设置                    Ctrl+,                 │
│    切换主题                    -                      │
│    更改默认 Shell              -                      │
└─────────────────────────────────────────────────────┘
```

**实现：** 模糊搜索所有注册的命令，支持拼音、缩写匹配。

---

### 4.8 布局模板管理器（Workspace Manager）

预设和恢复常用的分屏布局，一键启动整个开发环境。

#### 4.8.1 模板定义

```yaml
# workspaces/full-stack-dev.yaml
name: "全栈开发"
description: "前后端分离开发环境"
icon: "🚀"
autoStart: false  # 是否随应用启动

layout:
  direction: horizontal
  splits:
    - name: "主终端"
      shell: "powershell"
      cwd: "${PROJECT_ROOT}/backend"
      ratio: 40
      color: "#4CAF50"

    - name: "工作区"
      direction: vertical
      ratio: 60
      splits:
        - name: "Dev Server"
          shell: "powershell.exe"
          command: "npm run dev"
          cwd: "${PROJECT_ROOT}/frontend"
          ratio: 50
          color: "#2196F3"

        - name: "Git & Logs"
          shell: "powershell"
          cwd: "${PROJECT_ROOT}"
          ratio: 50
          color: "#FF9800"
```

#### 4.8.2 操作

```typescript
interface WorkspaceManager {
  // 保存当前标签布局为模板
  saveAsTemplate(tabId: string, name: string): WorkspaceTemplate;

  // 从模板创建新标签
  loadTemplate(templateId: string, variables?: Record<string, string>): Tab;

  // 获取所有模板
  getTemplates(): WorkspaceTemplate[];

  // 删除模板
  deleteTemplate(templateId: string): void;

  // 导入/导出模板
  exportTemplate(templateId: string): string;  // 返回 YAML
  importTemplate(yaml: string): WorkspaceTemplate;
}
```

---

### 4.9 浮动面板（Floating Pane）

浮动面板是盖在分屏布局上方的临时面板，不影响底层布局。

```
┌──────────────┬──────────────┐
│              │   Pane-B     │
│   Pane-A     ├──────────────┤
│              │ ┌──────────┐ │
│              │ │ 浮动面板  │ │  ← 悬浮在 Pane-C 上方
│              │ │ 临时日志  │ │
│              │ └──────────┘ │
└──────────────┴──────────────┘
```

**特性：**
- 可拖拽位置，可调整大小
- 始终在最上层
- 按 Esc 或点击外部区域关闭
- 适合临时查看日志、运行一次性命令
- 快捷键：`Ctrl + Shift + F` 打开浮动面板

---

### 4.10 智能功能

#### 4.11.1 后台任务通知

```typescript
class NotificationManager {
  // 注册面板的命令完成监听
  watchForCompletion(paneId: string) {
    // Shell 集成检测到 prompt 重新出现时触发
    onCommandEnd(paneId, (exitCode) => {
      if (!isWindowFocused()) {
        new Notification('命令执行完成', {
          body: `面板 "${getPaneTitle(paneId)}" 的命令已结束 (${exitCode === 0 ? '成功' : '失败'})`,
          icon: getAppIcon(),
        });
      }
    });
  }
}
```

#### 4.11.2 输入广播

同时在多个面板输入相同内容：

```
广播模式开启：
┌──────────────┬──────────────┐
│ $ ls         │ $ ls         │  ← 两个面板同时输入
│              │              │
└──────────────┴──────────────┘

快捷键：Ctrl+Shift+B 开始/停止广播
面板选择：广播前可勾选要参与的面板
```

#### 4.11.3 智能路径识别

```typescript
// 终端输出中的路径匹配
const PATH_PATTERNS = [
  // 绝对路径
  /(?:\/[\w.-]+)+\.\w+/,
  /(?:[A-Z]:\\[\w.-\\]+)+\.\w+/,
  // 相对路径（结合 CWD）
  /(?:[\w.-]+[\\/])+\.\w+/,
  // Git diff 格式
  /diff --git a\/(.+?) b\//,
  // 错误信息中的文件名
  /(?:at|in|from)\s+(.+?):(\d+)/,
];

// 点击处理
terminal.attachCustomKeyEventHandler((e) => {
  if (e.ctrlKey && e.type === 'click') {
    const path = detectPathAtCursor();
    if (path) {
      const absolutePath = resolvePath(path, currentCwd);
      openInEditor(absolutePath);  // 用默认编辑器打开
    }
  }
});
```

---

### 4.11 插件系统（未来）

#### 4.12.1 插件架构

```
┌─────────────────────────────────────────┐
│              插件运行时                   │
│                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Panel    │ │ Theme    │ │Middleware│ │
│  │ 插件     │ │ 插件     │ │ 插件     │ │
│  │          │ │          │ │          │ │
│  │ 自定义   │ │ 自定义   │ │ 拦截和   │ │
│  │ UI 面板  │ │ 配色主题 │ │ 转换数据 │ │
│  └──────────┘ └──────────┘ └──────────┘ │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │          插件 API                 │   │
│  │  - onTerminalData(data)          │   │
│  │  - onPaneCreated(pane)           │   │
│  │  - onCommandExecuted(cmd, exit)  │   │
│  │  - registerPanel(component)      │   │
│  │  - registerTheme(theme)          │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### 4.12.2 插件清单

```json
{
  "name": "terminal-manager-plugin-git-status",
  "version": "1.0.0",
  "tmPlugin": {
    "type": "panel",
    "entry": "./index.js",
    "hooks": ["onPaneCreated", "onTerminalData"],
    "permissions": ["readFileSystem"]
  }
}
```

#### 4.12.3 插件目录

| 类型 | 说明 | 示例 |
|------|------|------|
| `panel` | 自定义 UI 面板 | git 状态面板、Docker 容器管理、数据库浏览器 |
| `theme` | 配色主题 | Dracula、One Dark、Catppuccin、Nord |
| `middleware` | 数据拦截和转换 | 输出过滤、命令别名、自动补全增强 |

---

### 4.12 状态管理（集中式 Store）

渲染进程使用集中式 Store 管理全局状态，不依赖任何前端框架。

#### 4.13.1 Store 实现

```typescript
class Store<T extends object> {
  private state: T;
  private listeners = new Set<(state: T) => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  getState(): T {
    return this.state;
  }

  setState(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(fn => fn(this.state));
  }

  subscribe(fn: (state: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
```

#### 4.13.2 全局状态结构

```typescript
interface AppState {
  // 标签和面板
  tabs: Tab[];
  activeTabId: string;
  focusedPaneId: string;

  // 项目
  projects: Project[];

  // 配置
  config: Config;

  // UI 状态
  sidebarVisible: boolean;
  commandPaletteOpen: boolean;
  quickOpenOpen: boolean;
}

const store = new Store<AppState>({
  tabs: [],
  activeTabId: '',
  focusedPaneId: '',
  projects: [],
  config: defaultConfig,
  sidebarVisible: true,
  commandPaletteOpen: false,
  quickOpenOpen: false,
});
```

#### 4.13.3 组件订阅模式

```typescript
// 标签栏：监听 tabs 和 activeTabId 变化
store.subscribe((state) => {
  tabBar.render(state.tabs, state.activeTabId);
});

// 侧边栏：监听 projects 变化
store.subscribe((state) => {
  sidebar.render(state.projects);
});

// 面板布局：监听 tabs 和 focusedPaneId 变化
store.subscribe((state) => {
  const activeTab = state.tabs.find(t => t.id === state.activeTabId);
  if (activeTab) {
    paneLayout.render(activeTab, state.focusedPaneId);
  }
});

// 状态栏：监听 focusedPaneId 和 config 变化
store.subscribe((state) => {
  const pane = findPane(state.tabs, state.focusedPaneId);
  statusBar.render(pane, state.config);
});
```

#### 4.13.4 事件总线（辅助）

Store 处理持久状态，EventBus 处理瞬时事件（不适合存入状态的通知）：

```typescript
class EventBus {
  private listeners: Map<string, Set<Function>> = new Map();

  on(event: string, fn: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)!.delete(fn);
  }

  emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach(fn => fn(data));
  }
}

const events = new EventBus();

// 瞬时事件示例
events.emit('pane:created', { paneId: 'xxx' });
events.emit('notification', { title: '命令完成', body: '...' });
events.emit('command:executed', { command: 'ls', exitCode: 0 });
```

**Store vs EventBus 的职责划分：**

| 用途 | 用什么 | 示例 |
|------|--------|------|
| 组件需要渲染的数据 | **Store** | tabs、projects、config |
| 一次性通知 | **EventBus** | 面板创建、命令完成、错误 |
| 用户操作触发的命令 | **EventBus** | splitPane、closeTab、openProject |

---

### 4.13 IPC 通信设计

主进程和渲染进程之间的消息协议：

```
渲染进程 → 主进程（请求）：
─────────────────────────────────────────────
pty:create      { shell, cwd }        → 创建新终端
pty:input       { id, data }          → 发送输入
pty:resize      { id, cols, rows }    → 调整大小
pty:kill        { id }                → 关闭终端

pane:split      { tabId, paneId,      → 分屏（创建新终端 + 插入布局树）
                  direction, shell, cwd }
pane:close      { tabId, paneId }     → 关闭面板
pane:focus      { tabId, paneId }     → 切换焦点
pane:resize     { tabId, paneId,      → 调整面板大小
                  newSize }
pane:maximize   { tabId, paneId }     → 最大化/还原
pane:float      { tabId, paneId }     → 切换浮动模式
pane:broadcast  { paneIds, data }     → 输入广播到多个面板

project:add     { name, path, group } → 添加项目
project:remove  { id }                → 删除项目
project:list    {}                    → 获取项目列表
project:open    { id }                → 从项目打开终端

workspace:save    { tabId, name }     → 保存布局为模板
workspace:load    { templateId }      → 加载布局模板
workspace:list    {}                  → 获取模板列表
workspace:delete  { templateId }      → 删除模板

config:get      {}                    → 获取配置
config:set      { key, value }        → 保存配置

window:quake     {}                   → 全局热键呼出/隐藏
window:focus     {}                   → 窗口获得焦点

主进程 → 渲染进程（事件）：
─────────────────────────────────────────────
pty:data        { id, data }          → 终端输出
pty:exit        { id, code }          → 终端退出
pty:title       { id, title }         → 标题变更（shell 会报告）
shell:cwd       { id, path }          → 当前目录变更
shell:cmdStart  { id }                → 命令开始执行
shell:cmdEnd    { id, exitCode }      → 命令执行完成
notify          { title, body }       → 桌面通知
```

---

## 5. UI 设计

### 5.1 主界面布局

**基础视图（单终端）：**

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌───┐                                              ─  □  ✕     │
│ │ ≡ │  Terminal Manager                    [⚙]                   │
│ └───┘                                                          │
├──────────┬──────────────────────────────────────────────────────┤
│          │  [cmd] [PowerShell ▾] [Claude] [+]                   │
│          ├──────────────────────────────────────────────────────┤
│          │                                                      │
│ ★ 收藏   │  PS E:\VibeCoding\terminal-manager>                  │
│          │  > npm run dev                                       │
│ ├ 开发中  │  [12:34:05] Starting development server...          │
│ │ T.Manager│  [12:34:06] Ready on http://localhost:3000          │
│ │ My App  │                                                      │
│ │         │  PS E:\VibeCoding\terminal-manager> █                │
│ ├ AI 工具  │                                                      │
│ │ Claude  │                                                      │
│ │ GPT     │                                                      │
│ │         │                                                      │
│ ├ 运维    │                                                      │
│ │ Server1 │                                                      │
│ │         │                                                      │
│          │                                                      │
│──────────│                                                      │
│ + 添加项目│                                                      │
│          │                                                      │
├──────────┴──────────────────────────────────────────────────────┤
│ PowerShell                                    UTF-8    LF   Ln 1│
└─────────────────────────────────────────────────────────────────┘
```

**分屏视图（多面板平铺）：**

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌───┐                                              ─  □  ✕     │
│ │ ≡ │  Terminal Manager                    [⚙]                   │
│ └───┘                                                          │
├──────────┬──────────────────────────────────────────────────────┤
│          │  [Claude Code] [Dev Server] [+]                      │
│          ├──────────────────────────────────────────────────────┤
│          │  ┌─────────────────┬─────────────────┐               │
│ ★ 收藏   │  │ PS> claude      │ PS> npm run dev │               │
│          │  │ > /help         │ Server ready    │               │
│ ├ 开发中  │  │ > 请帮我检查... │ localhost:3000  │               │
│ │ T.Manager│  │                 │                 │               │
│ │ My App  │  │ █               │ █               │               │
│ ├ AI 工具  │  ├─────────────────┴─────────────────┤               │
│ │ Claude  │  │ PS> git status                    │               │
│ │ GPT     │  │ On branch main                    │               │
│ ├ 运维    │  │ Changes:                          │               │
│ │ Server1 │  │   modified: src/app.ts            │               │
│          │  │ █                                  │               │
│          │  └────────────────────────────────────┘               │
│──────────│                                                      │
│ + 添加项目│                                                      │
├──────────┴──────────────────────────────────────────────────────┤
│ Claude Code ▎ 3 panes                  UTF-8    LF   Ln 12,Col 1│
└─────────────────────────────────────────────────────────────────┘
       上方左右分屏            下方单面板
       (焦点在左上，蓝色高亮边框)
```

**标签页内不同布局组合：**

```
布局 A：左右二分          布局 B：上下二分          布局 C：田字格
┌───────┬───────┐       ┌───────────────┐       ┌───────┬───────┐
│       │       │       │   Terminal 1  │       │   1   │   2   │
│   1   │   2   │       ├───────────────┤       ├───────┼───────┤
│       │       │       │   Terminal 2  │       │   3   │   4   │
└───────┴───────┘       └───────────────┘       └───────┴───────┘

布局 D：左一右二          布局 E：三列等分
┌───────┬───────┐       ┌──────┬──────┬──────┐
│       │   2   │       │      │      │      │
│   1   ├───────┤       │  1   │  2   │  3   │
│       │   3   │       │      │      │      │
└───────┴───────┘       └──────┴──────┴──────┘
```

### 5.2 各区域说明

| 区域 | 功能 |
|------|------|
| **标题栏** | 应用名称、最小化/最大化/关闭、设置入口 |
| **侧边栏** | 项目列表树形结构，支持分组和收藏，点击即打开终端 |
| **标签栏** | 终端标签页，支持拖拽排序、右键菜单、关闭按钮 |
| **终端区** | xterm.js 渲染的终端内容，支持分屏 |
| **状态栏** | 当前 shell 类型、编码、行尾符、光标位置 |

### 5.3 快捷键设计

快捷键使用 Electron 的 `CommandOrControl` 加速器，自动适配平台：Windows 上为 `Ctrl`，macOS 上为 `Cmd`。面板操作使用 `Alt`（macOS 上为 `Option`）。

**标签操作：**

| Windows | macOS | 功能 |
|---------|-------|------|
| `Ctrl + T` | `⌘ + T` | 新建标签 |
| `Ctrl + Shift + W` | `⌘ + ⇧ + W` | 关闭当前标签 |
| `Ctrl + Tab` | `⌘ + Tab` | 切换到下一个标签 |
| `Ctrl + Shift + Tab` | `⌘ + ⇧ + Tab` | 切换到上一个标签 |
| `Ctrl + 1~9` | `⌘ + 1~9` | 切换到第 N 个标签 |

**分屏操作：**

| Windows | macOS | 功能 |
|---------|-------|------|
| `Alt + Shift + -` | `⌥ + ⇧ + -` | 水平分屏（左右） |
| `Alt + Shift + =` | `⌥ + ⇧ + =` | 垂直分屏（上下） |
| `Alt + ←` | `⌥ + ←` | 焦点移到左侧面板 |
| `Alt + →` | `⌥ + →` | 焦点移到右侧面板 |
| `Alt + ↑` | `⌥ + ↑` | 焦点移到上方面板 |
| `Alt + ↓` | `⌥ + ↓` | 焦点移到下方面板 |
| `Alt + Shift + ←` | `⌥ + ⇧ + ←` | 当前面板左边界左移（缩小左邻） |
| `Alt + Shift + →` | `⌥ + ⇧ + →` | 当前面板左边界右移（扩大自身） |
| `Alt + Shift + ↑` | `⌥ + ⇧ + ↑` | 当前面板上边界上移 |
| `Alt + Shift + ↓` | `⌥ + ⇧ + ↓` | 当前面板上边界下移 |
| `Alt + Enter` | `⌥ + ↵` | 最大化/还原当前面板 |
| `Alt + Shift + Z` | `⌥ + ⇧ + Z` | 所有面板均匀分布 |
| `Alt + Shift + W` | `⌥ + ⇧ + W` | 关闭当前面板 |

**通用操作：**

| Windows | macOS | 功能 |
|---------|-------|------|
| `` Ctrl + ` `` | `` ⌘ + ` `` | 全局热键呼出/隐藏窗口（Quake 模式） |
| `Ctrl + P` | `⌘ + P` | 快速打开项目面板 |
| `Ctrl + Shift + P` | `⌘ + ⇧ + P` | 命令面板 |
| `Ctrl + ,` | `⌘ + ,` | 打开设置 |
| `Ctrl + F` | `⌘ + F` | 终端内容搜索 |
| `Ctrl + Shift + F` | `⌘ + ⇧ + F` | 打开浮动面板 |
| `Ctrl + Shift + B` | `⌘ + ⇧ + B` | 开始/停止输入广播 |
| `Ctrl + Shift + S` | `⌘ + ⇧ + S` | 保存当前布局为模板 |

> **快捷键配置化**：所有快捷键在 `config.json` 的 `shortcuts` 字段中定义，用户可自定义。配置文件中使用 `CommandOrControl` 格式，运行时按平台解析。如遇系统快捷键冲突，应用启动时会提示用户修改。

### 5.4 快速打开面板（Ctrl + P）

```
┌─────────────────────────────────────────┐
│ 🔍 输入项目名称或路径搜索...              │
├─────────────────────────────────────────┤
│  ★ Terminal Manager    E:\VibeCoding\.. │
│    Claude Code         E:\VibeCoding\.. │
│    My App              D:\Projects\..   │
│    Server Config       /etc/nginx       │
├─────────────────────────────────────────┤
│  Enter: 打开  Ctrl+Enter: 新窗口打开     │
└─────────────────────────────────────────┘
```

### 5.5 右键菜单

**标签栏右键：**

```
├── 重命名标签
├── 更改标签颜色
├── 复制标签（相同路径新建）
├── 分离到新窗口
└── 关闭标签
    ├── 关闭当前
    ├── 关闭其他
    └── 关闭右侧
```

**终端面板右键（在面板内容区右键）：**

```
├── 水平分屏           ← 当前面板左右分裂
├── 垂直分屏           ← 当前面板上下分裂
├── 最大化面板          ← 当前面板占满整个标签
├── 均匀分布           ← 所有面板等分
├── 关闭面板           ← 关闭当前面板
├── 关闭其他面板        ← 只保留当前面板
├── 复制
├── 粘贴
├── 搜索
└── 清屏
```

---

## 6. 数据结构

### 6.1 配置文件 (config.json)

配置文件使用平台无关的格式。`defaultShell` 和 `defaultCwd` 字段如果为空，则运行时由 `Platform` 模块自动填充平台默认值。快捷键使用 Electron 的 `CommandOrControl` 格式（运行时自动映射为 `Ctrl` 或 `Cmd`）。

```json
{
  "version": "1.0.0",
  "general": {
    "defaultShell": "",
    "defaultCwd": "",
    "fontSize": 14,
    "fontFamily": "",
    "fontLigatures": true,
    "theme": "dark",
    "opacity": 0.95,
    "cursorStyle": "block",
    "cursorBlink": true,
    "scrollback": 10000
  },
  "window": {
    "width": 1200,
    "height": 800,
    "sidebarWidth": 240,
    "sidebarVisible": true,
    "tabBarVisible": true
  },
  "shortcuts": {
    "newTab": "CommandOrControl+T",
    "closeTab": "CommandOrControl+Shift+W",
    "nextTab": "CommandOrControl+Tab",
    "prevTab": "CommandOrControl+Shift+Tab",
    "quickOpen": "CommandOrControl+P",
    "commandPalette": "CommandOrControl+Shift+P",
    "quakeMode": "CommandOrControl+`",
    "splitHorizontal": "Alt+Shift+-",
    "splitVertical": "Alt+Shift+=",
    "focusLeft": "Alt+Left",
    "focusRight": "Alt+Right",
    "focusUp": "Alt+Up",
    "focusDown": "Alt+Down",
    "maximizePane": "Alt+Enter",
    "closePane": "Alt+Shift+W",
    "broadcast": "CommandOrControl+Shift+B",
    "floatingPane": "CommandOrControl+Shift+F"
  },
  "shellIntegration": {
    "enabled": true
  },
  "notifications": {
    "enabled": true,
    "commandCompletion": true,
    "sound": false
  }
}
```

**平台默认值填充规则：**

```typescript
// ConfigManager 加载配置时的默认值处理
function applyPlatformDefaults(config: Config): Config {
  if (!config.general.defaultShell) {
    config.general.defaultShell = Platform.defaultShell;
  }
  if (!config.general.defaultCwd) {
    config.general.defaultCwd = Platform.homeDir;
  }
  if (!config.general.fontFamily) {
    config.general.fontFamily = getDefaultFontFamily();  // 见 §4.0.4
  }
  return config;
}
```

### 6.2 布局状态 (layout-state.json)

布局状态只保存可序列化、可重建的信息。应用重启时，主进程会根据每个 pane 的 `shell`、`cwd`、`command` 重新创建新的 PTY，因此这里不保存运行期 `sessionId`。

```json
{
  "tabs": [
    {
      "id": "tab_001",
      "title": "Dev Server",
      "color": "#4CAF50",
      "activePaneId": "pane_001",
      "layout": {
        "type": "container",
        "direction": "horizontal",
        "sizes": [50, 50],
        "children": [
          {
            "type": "leaf",
            "paneId": "pane_001"
          },
          {
            "type": "container",
            "direction": "vertical",
            "sizes": [50, 50],
            "children": [
              {
                "type": "leaf",
                "paneId": "pane_002"
              },
              {
                "type": "leaf",
                "paneId": "pane_003"
              }
            ]
          }
        ]
      },
      "panes": [
        {
          "id": "pane_001",
          "shell": "powershell.exe",
          "cwd": "E:\\VibeCoding\\terminal-manager",
          "projectId": "proj_001"
        },
        {
          "id": "pane_002",
          "shell": "powershell.exe",
          "cwd": "E:\\VibeCoding\\terminal-manager",
          "command": "npm run dev",
          "projectId": "proj_001"
        },
        {
          "id": "pane_003",
          "shell": "powershell.exe",
          "cwd": "E:\\VibeCoding\\claude-project",
          "projectId": "proj_002"
        }
      ]
    }
  ],
  "activeTabId": "tab_001"
}
```

---

## 7. 项目目录结构

```
terminal-manager/
├── docs/
│   └── design.md                 # 本文档
├── src/
│   ├── main/                     # 主进程代码
│   │   ├── index.ts              # 主进程入口
│   │   ├── pty/
│   │   │   ├── PtyManager.ts     # PTY 管理器核心
│   │   │   └── shells.ts         # Shell 检测和配置
│   │   ├── project/
│   │   │   └── ProjectManager.ts # 项目管理
│   │   ├── workspace/
│   │   │   └── WorkspaceManager.ts # 布局模板管理
│   │   ├── shell-integration/
│   │   │   ├── ShellStateTracker.ts  # Shell 标题、cwd、集成事件追踪
│   │   │   └── integrationEvents.ts  # OSC 7 / OSC 133 等事件解析
│   │   ├── notification/
│   │   │   └── NotificationManager.ts # 桌面通知管理
│   │   ├── hotkey/
│   │   │   └── QuakeMode.ts      # 全局热键管理
│   │   ├── config/
│   │   │   └── ConfigManager.ts  # 配置读写
│   │   └── ipc/
│   │       └── handlers.ts       # IPC 消息处理器
│   ├── renderer/                 # 渲染进程代码（前端）
│   │   ├── index.html            # 入口 HTML
│   │   ├── src/
│   │   │   ├── App.ts            # 应用入口，初始化各模块
│   │   │   ├── components/       # UI 组件（原生 DOM 封装）
│   │   │   │   ├── TabBar.ts     # 标签栏
│   │   │   │   ├── Pane/         # 面板布局引擎
│   │   │   │   │   ├── PaneLayout.ts    # 布局渲染（递归 DOM）
│   │   │   │   │   ├── PaneSplitter.ts  # 可拖拽分割线
│   │   │   │   │   ├── PaneManager.ts   # 面板管理逻辑
│   │   │   │   │   ├── FloatingPane.ts  # 浮动面板
│   │   │   │   │   └── PaneHeader.ts    # 面板标题栏
│   │   │   │   ├── Terminal.ts   # 终端组件（封装 xterm.js）
│   │   │   │   ├── Sidebar.ts    # 侧边栏
│   │   │   │   ├── QuickOpen.ts  # 快速打开面板
│   │   │   │   ├── CommandPalette.ts # 命令面板
│   │   │   │   ├── Workspace.ts  # 布局模板管理
│   │   │   │   ├── StatusBar.ts  # 状态栏
│   │   │   │   ├── Settings.ts   # 设置页面
│   │   │   │   └── Notification.ts # 通知组件
│   │   │   ├── core/             # 核心逻辑
│   │   │   │   ├── Store.ts      # 集中式状态管理（方案 B）
│   │   │   │   ├── EventBus.ts   # 事件总线（瞬时事件）
│   │   │   │   └── IPC.ts        # IPC 通信封装
│   │   │   ├── addons/           # xterm.js 插件
│   │   │   │   ├── linkDetector.ts    # 路径/URL 识别
│   │   │   │   └── commandBlocks.ts   # 命令块化（未来）
│   │   │   └── styles/           # 样式文件
│   │   │       ├── main.css
│   │   │       ├── themes/       # 内置主题
│   │   │       └── animations/   # 动画效果
│   │   └── assets/               # 静态资源
│   └── shared/                   # 主进程和渲染进程共享
│       ├── platform.ts           # 平台检测和适配工具
│       ├── path-utils.ts         # 跨平台路径处理
│       ├── fonts.ts              # 平台默认字体配置
│       ├── types.ts              # 类型定义
│       ├── constants.ts          # 常量
│       └── ipc-channels.ts       # IPC 频道名常量
├── workspaces/                   # 内置布局模板
│   ├── full-stack-dev.yaml
│   ├── frontend-dev.yaml
│   └── dev-ops.yaml
├── plugins/                      # 插件目录（未来）
├── resources/                    # 应用图标等资源
│   ├── icon.ico                  # Windows 图标
│   └── icon.icns                 # macOS 图标
├── package.json
├── tsconfig.json
├── electron-builder.yml          # 打包配置（含 Windows + macOS 目标）
└── vite.config.ts
```

---

## 8. 实现路线图

### 阶段 A：基础框架

```
目标：跑通 Electron + node-pty + xterm.js 基础流程，建立跨平台基础

[ ] 初始化 Electron + Vite 项目
[ ] 实现平台适配层（§4.0）：platform.ts、path-utils.ts、fonts.ts
[ ] 集成 node-pty，在主进程创建 PTY（使用平台适配层的 Shell 检测）
[ ] 集成 xterm.js，在渲染进程显示终端
[ ] 打通 IPC 通信，实现终端输入输出
[ ] 实现基础窗口创建和管理
[ ] 字体连字支持（按平台选择默认字体）
[ ] 终端内容搜索（SearchAddon）
[ ] 在 macOS 上验证 node-pty 编译和基础功能
```

### 阶段 B：多标签 + 分屏系统

```
目标：多标签 + 分屏平铺，核心交互完成

[ ] 标签栏 UI（创建、关闭、切换、拖拽排序）
[ ] 每个标签对应独立的布局树（LayoutNode N 叉树）
[ ] 实现水平分屏（Alt+Shift+-）
[ ] 实现垂直分屏（Alt+Shift+=）
[ ] 分割线拖拽调整面板大小（重点处理最小尺寸和嵌套容器边界）
[ ] 面板焦点切换算法（嵌套容器的焦点查找）
[ ] 面板最大化/还原（Alt+Enter）
[ ] 面板关闭（Alt+Shift+W）
[ ] 面板颜色边框 + 焦点高亮效果
[ ] 快捷键完整实现
[ ] 标签和面板右键菜单
```

### 阶段 C：项目管理 + 命令面板

```
目标：快速切换工作目录，高效访问功能

[ ] 侧边栏 UI 和项目列表
[ ] 项目增删改查
[ ] 点击项目打开新终端（指定 cwd）
[ ] 快速打开面板（Ctrl+P 模糊搜索）
[ ] 命令面板（Ctrl+Shift+P，模糊搜索所有命令）
[ ] 项目数据持久化（JSON 文件）
```

### 阶段 D：体验优化 + 布局持久化

```
目标：完善常用体验，把布局恢复做成稳定闭环，完成跨平台打包

[ ] 布局状态持久化（重启后重新创建标签、面板、shell、cwd、启动命令）
[ ] 面板标题追踪（优先使用终端标题事件，失败时使用自定义标题或启动目录）
[ ] 智能路径识别（Ctrl+Click 打开文件/URL）
[ ] 全局热键呼出（Quake 模式，跨平台适配 macOS 辅助功能权限）
[ ] 设置页面（shell 选择——按平台列出可用 Shell、主题、字体）
[ ] 状态栏信息展示（shell 类型、cwd、编码、识别可靠性）
[ ] 应用打包（electron-builder，配置 Windows .exe + macOS .dmg 双目标）
[ ] macOS 平台验证：快捷键、路径、Shell 列表、Quake 模式
```

### 阶段 E：布局模板 + 高级面板

```
目标：布局模板和高级面板功能

[ ] 布局模板管理器（保存/加载/导入导出 YAML 模板）
[ ] 内置常用布局模板（全栈开发、前端开发、运维监控）
[ ] 浮动面板
[ ] 面板拖拽重排
```

### 阶段 F：高级功能

```
目标：差异化功能，打造独特体验
注：命令块 UI、后台任务通知和可靠退出码依赖更完整的 Shell 集成，可考虑留到 v2.0

[ ] 可选主动 Shell 集成（OSC 7 / OSC 133 / shell profile 片段）
[ ] 后台任务完成通知
[ ] 输入广播（同时在多个面板输入）
[ ] 剪贴板历史
[ ] 彩虹标签
[ ] 面板缩略图预览
[ ] 命令块 UI（Warp 风格，可选，工作量大）
[ ] 应用打包优化（自动更新、安装器）
```

---

## 9. 关键技术细节

### 9.1 node-pty 跨平台注意事项

Shell 检测和路径处理已封装到 `§4.0 平台适配层`，此处列出各平台的底层差异和注意事项：

| 差异项 | Windows | macOS |
|--------|---------|-------|
| PTY 后端 | ConPTY（node-pty 已移除 WinPTY 支持，要求 Windows 10 version 1809 build 18309 或更高） | POSIX PTY (`openpty`) |
| 默认 Shell | `powershell.exe` | `/bin/zsh`（Catalina 起） |
| Shell 路径格式 | `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` | `/bin/zsh` |
| 路径分隔符 | `\` | `/` |
| 用户主目录 | `C:\Users\xxx` | `/Users/xxx` |
| 环境变量 Shell 变量 | `COMSPEC` | `SHELL` |
| node-pty 编译依赖 | Visual Studio Build Tools | Xcode Command Line Tools |

**macOS 特别注意：**

```typescript
// macOS 上 node-pty 需要正确设置 TERM 环境变量
// 否则某些 Shell 命令（如 clear）可能不工作
const env = Platform.isMacOS
  ? { ...process.env, TERM: 'xterm-256color', ...options.env }
  : { ...process.env, ...options.env };

// macOS 的 zsh 配置文件加载顺序与 bash 不同：
// ~/.zshenv → ~/.zprofile → ~/.zshrc → ~/.zlogin
// 自动执行的命令（options.command）应在 Shell 完全初始化后再发送
if (options.command && Platform.isMacOS) {
  // 延迟发送命令，等待 zsh 初始化完成
  setTimeout(() => shell.write(`${options.command}\r`), 100);
} else if (options.command) {
  shell.write(`${options.command}\r`);
}
```

### 9.2 xterm.js 初始化配置

```typescript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { getDefaultFontFamily } from '../shared/fonts';

const terminal = new Terminal({
  fontSize: 14,
  fontFamily: getDefaultFontFamily(),  // 按平台选择默认字体
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    selectionBackground: '#264f78',
  },
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 10000,
});

// 自适应大小插件
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.loadAddon(new WebLinksAddon());
terminal.loadAddon(new SearchAddon());

// 窗口大小变化时自动调整
window.addEventListener('resize', () => fitAddon.fit());
```

### 9.3 IPC 通信安全

```typescript
// 主进程：使用 contextBridge 暴露安全的 API
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('terminalAPI', {
  createTerminal: (options) => ipcRenderer.invoke('pty:create', sanitizePtyOptions(options)),
  writeToTerminal: (id, data) => {
    if (isSessionId(id) && typeof data === 'string') {
      ipcRenderer.send('pty:input', { id, data });
    }
  },
  resizeTerminal: (id, cols, rows) => {
    if (isSessionId(id) && Number.isInteger(cols) && Number.isInteger(rows)) {
      ipcRenderer.send('pty:resize', { id, cols, rows });
    }
  },
  closeTerminal: (id) => {
    if (!isSessionId(id)) return Promise.reject(new Error('Invalid session id'));
    return ipcRenderer.invoke('pty:kill', id);
  },
  onTerminalData: (id, callback) => {
    if (!isSessionId(id) || typeof callback !== 'function') {
      return () => {};
    }
    const channel = `pty:data:${id}`;
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.off(channel, listener);
  },
});
```

主进程也必须做同样的参数校验：`shell` 只能来自已检测或用户显式配置的白名单路径（白名单由 `detectAvailableShells()` 按平台生成，见 §4.0.2），`cwd` 必须存在且可访问，`env` 只合并允许透传的键，避免渲染进程通过 IPC 启动任意危险命令。

### 9.4 错误处理和边界情况

#### PTY 生命周期

```typescript
class PtyManagerImpl {
  createPty(options: PtyOptions): PtySession {
    // 1. 验证 shell 路径是否存在
    if (!fs.existsSync(options.shell)) {
      throw new Error(`Shell 不存在: ${options.shell}`);
    }

    // 2. 验证工作目录是否存在
    let cwd = options.cwd;
    if (!fs.existsSync(cwd)) {
      cwd = getDefaultCwd();  // 回退到默认目录
      log.warn(`目录不存在: ${options.cwd}，回退到 ${cwd}`);
    }

    // 3. 创建 PTY，捕获启动错误
    try {
      const shell = pty.spawn(options.shell, [], { cwd, ... });
    } catch (err) {
      throw new Error(`启动 Shell 失败: ${err.message}`);
    }

    // 4. 监听异常退出
    shell.onExit(({ exitCode, signal }) => {
      if (signal) {
        // 被信号杀死（如 SIGKILL）
        notifyPane(paneId, `进程被终止 (signal: ${signal})`);
      }
      cleanup(paneId);
    });
  }
}
```

#### 面板数量限制

```typescript
const MAX_PANES_PER_TAB = 16;
const MIN_PANE_WIDTH = 100;   // px
const MIN_PANE_HEIGHT = 50;   // px

function canSplit(tab: Tab): { allowed: boolean; reason?: string } {
  if (tab.panes.size >= MAX_PANES_PER_TAB) {
    return { allowed: false, reason: `面板数量已达上限 (${MAX_PANES_PER_TAB})` };
  }
  // 检查当前面板是否太小，无法继续分割
  const pane = tab.panes.get(tab.focusedPaneId);
  if (pane.element.clientWidth < MIN_PANE_WIDTH * 2) {
    return { allowed: false, reason: '面板太小，无法水平分割' };
  }
  return { allowed: true };
}
```

#### 关闭面板时的焦点转移

```typescript
function closePane(tabId: string, paneId: string): void {
  const tab = getTab(tabId);

  // 如果关闭的是焦点面板，先转移焦点
  if (tab.focusedPaneId === paneId) {
    const adjacent = findAdjacentPane(tab.layout, paneId, 'left')
      || findAdjacentPane(tab.layout, paneId, 'right')
      || findAdjacentPane(tab.layout, paneId, 'up')
      || findAdjacentPane(tab.layout, paneId, 'down');

    if (adjacent) {
      store.setState({ focusedPaneId: adjacent.paneId });
    }
  }

  // 如果是最后一个面板，关闭整个标签
  if (tab.panes.size === 1) {
    closeTab(tabId);
    return;
  }

  // 正常关闭：销毁 PTY，从布局树移除，重新渲染
  killPty(paneId);
  removeFromLayout(tab.layout, paneId);
  tab.panes.delete(paneId);
  renderTab(tab);
}
```

#### 配置文件容错

```typescript
class ConfigManager {
  private configPath: string;

  load(): Config {
    try {
      if (!fs.existsSync(this.configPath)) {
        return this.getDefaultConfig();
      }
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return this.mergeWithDefaults(parsed);  // 缺失字段用默认值填充
    } catch (err) {
      log.error('配置文件读取失败，使用默认配置', err);
      return this.getDefaultConfig();
    }
  }

  save(config: Config): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      log.error('配置文件保存失败', err);
      // 不崩溃，静默失败或提示用户
    }
  }

  private mergeWithDefaults(parsed: any): Config {
    const defaults = this.getDefaultConfig();
    return deepMerge(defaults, parsed);  // 已有的保留，缺失的用默认值
  }
}
```

#### 全局错误兜底

```typescript
// 主进程：未捕获异常不崩溃
process.on('uncaughtException', (err) => {
  log.error('未捕获异常:', err);
  // 不退出进程，终端继续运行
});

process.on('unhandledRejection', (reason) => {
  log.error('未处理的 Promise 拒绝:', reason);
});

// 渲染进程：错误边界
window.onerror = (msg, source, line, col, error) => {
  // 记录错误，不影响其他面板
  log.error(`渲染进程错误: ${msg}`, { source, line, col, error });
  return true;  // 阻止默认行为（弹窗）
};
```

---

### 9.5 性能优化

| 优化点 | 方案 |
|--------|------|
| 终端输出缓冲 | 使用 `requestAnimationFrame` 批量更新，避免逐字符渲染 |
| 后台标签节流 | 非活动标签降低渲染频率，减少 CPU 占用 |
| 滚动缓冲区 | 限制 scrollback 行数（默认 10000），防止内存膨胀 |
| xterm.js 序列化 | 后台标签的数据写入缓冲区，切回时再批量渲染 |

---

## 10. 与其他终端的功能对比

| 功能 | Windows Terminal | Warp | Tabby | **本项目** |
|------|:---:|:---:|:---:|:---:|
| 多标签 | ✅ | ✅ | ✅ | ✅ |
| 分屏 | ✅ | ✅ | ✅ | ✅ |
| 自定义 Shell | ✅ | ✅ | ✅ | ✅ |
| 主题/配色 | ✅ | ✅ | ✅ | ✅ |
| GPU 加速渲染 | ✅ | ✅ | ❌ | ❌ |
| **跨平台（Win + Mac）** | ❌ (仅 Windows) | ✅ (仅 macOS) | ✅ | ✅ |
| **快速项目打开** | ❌ | ❌ | ❌ | ✅ |
| **侧边栏项目管理** | ❌ | ❌ | ❌ | ✅ |
| **命令面板** | ✅ | ✅ | ✅ | ✅ |
| **全局热键 (Quake)** | ✅ | ❌ | ✅ | ✅ |
| **Shell 集成** | 部分 | ✅ | ❌ | ✅ |
| **布局模板** | ❌ | ❌ | ❌ | ✅ |
| **浮动面板** | ❌ | ❌ | ❌ | ✅ |
| **输入广播** | ❌ | ❌ | ❌ | ✅ |
| **布局恢复** | 部分 | ❌ | 部分 | ✅ |
| SSH 管理 | ❌ | ❌ | ✅ | 🔵 |
| AI 命令辅助 | ❌ | ✅ | ❌ | 🔵 |
| 插件系统 | ❌ | ❌ | ❌ | 🔵 |

> **本项目的核心差异化：**
> 1. **跨平台统一** — Windows 和 macOS 同一套代码，自动适配 Shell、快捷键和系统特性
> 2. **项目管理 + 快速打开** — 专注于"快速切换工作目录"这一痛点
> 3. **布局模板** — 一键启动整个开发环境的分屏布局
> 4. **输入广播** — 批量操作多终端，运维利器

---

## 附录 A：测试策略

### 测试范围

| 层级 | 工具 | 覆盖范围 | 优先级 |
|------|------|---------|:------:|
| 单元测试 | **Vitest** | 核心算法和数据结构 | 高 |
| 集成测试 | **Vitest** + mock | 模块间协作 | 中 |
| E2E 测试 | **Playwright** + Electron | 关键用户流程 | 低 |

### 单元测试（重点）

需要覆盖的核心模块：

```
src/renderer/src/core/
├── Store.test.ts       ← 状态订阅、setState 触发更新
└── EventBus.test.ts    ← 事件注册、触发、注销

src/renderer/src/components/Pane/
├── PaneManager.test.ts ← 分屏、关闭、焦点切换、最大化
├── LayoutTree.test.ts  ← 布局树的增删改查、序列化/反序列化
└── FocusFinder.test.ts ← 焦点查找算法（各种嵌套场景）

src/main/config/
└── ConfigManager.test.ts ← 读写、容错、默认值合并

src/main/shell-integration/
└── ShellStateTracker.test.ts ← 标题追踪、OSC 7 解析、集成事件合并
```

**布局树测试示例：**

```typescript
describe('LayoutTree', () => {
  it('水平分屏：同方向容器追加子节点', () => {
    const tree = makeLeaf('A');
    const result = splitHorizontal(tree, 'A', 'B');
    // root: Container(H) → [Leaf-A, Leaf-B]
    expect(result.type).toBe('container');
    expect(result.direction).toBe('horizontal');
    expect(result.children).toHaveLength(2);
  });

  it('垂直分屏：不同方向时嵌套新容器', () => {
    const tree = makeContainer('h', [makeLeaf('A'), makeLeaf('B')]);
    const result = splitVertical(tree, 'A', 'C');
    // root: Container(H) → [Container(V)→[A,C], B]
    const leftChild = result.children[0];
    expect(leftChild.type).toBe('container');
    expect(leftChild.direction).toBe('vertical');
  });

  it('关闭面板：只剩一个时返回叶子', () => {
    const tree = makeContainer('h', [makeLeaf('A'), makeLeaf('B')]);
    const result = closePane(tree, 'B');
    expect(result.type).toBe('leaf');
    expect(result.paneId).toBe('A');
  });
});
```

**焦点查找测试示例：**

```typescript
describe('FocusFinder', () => {
  //   A | B
  //   -----
  //   C | D
  const grid = makeContainer('h', [
    makeContainer('v', [makeLeaf('A'), makeLeaf('C')]),
    makeContainer('v', [makeLeaf('B'), makeLeaf('D')]),
  ]);

  it('A → right = B', () => {
    expect(findAdjacentPane(grid, 'A', 'right')?.paneId).toBe('B');
  });
  it('A → down = C', () => {
    expect(findAdjacentPane(grid, 'A', 'down')?.paneId).toBe('C');
  });
  it('B → down = D', () => {
    expect(findAdjacentPane(grid, 'B', 'down')?.paneId).toBe('D');
  });
  it('D → left = C', () => {
    expect(findAdjacentPane(grid, 'D', 'left')?.paneId).toBe('C');
  });
  it('A → left = null', () => {
    expect(findAdjacentPane(grid, 'A', 'left')).toBeNull();
  });
});
```

### 集成测试（中等）

```
测试模块间的协作，mock 掉 node-pty 和 xterm.js：

- PTY 创建 → 触发 IPC → 渲染进程收到数据
- 项目列表变更 → 侧边栏重新渲染
- 配置变更 → 终端主题更新
- Shell 状态追踪检测到标题或 cwd 变化 → 状态栏更新显示
```

### E2E 测试（低优先级）

```
只覆盖关键流程，不追求全覆盖：

1. 启动应用 → 看到终端界面
2. Ctrl+T（macOS: ⌘+T）→ 新标签出现
3. 从侧边栏点击项目 → 新终端在对应目录打开
4. 分屏 → 两个面板都显示终端
5. 关闭应用 → 重新打开 → 布局恢复
```

### 跨平台测试要点

```
平台适配层需要单独测试，确保各平台行为一致：

src/shared/
├── platform.test.ts       ← 平台检测、默认值
├── path-utils.test.ts     ← expandHome、normalizePath、fileUriToPath（两个平台的路径格式）
└── fonts.test.ts          ← 默认字体 fallback 链

src/main/
├── shells/
│   └── shells.test.ts     ← Shell 列表检测（mock 不同平台的 fs.existsSync）

跨平台集成测试（需在 macOS 上执行）：
- macOS 上默认 Shell 为 zsh
- macOS 路径使用 / 分隔
- macOS 快捷键使用 Cmd 前缀
- Quake 模式的 macOS 辅助功能权限处理
```

---

## 附录 B：参考资源

- [node-pty 文档](https://github.com/microsoft/node-pty)
- [xterm.js 文档](https://xtermjs.org/)
- [Electron 文档](https://www.electronjs.org/)
- [Hyper 终端源码](https://github.com/vercel/hyper) — Electron 终端的经典参考实现
- [VS Code 终端源码](https://github.com/microsoft/vscode) — 复杂终端管理的参考

## 附录 C：快速启动命令参考

### 开发环境

```bash
# 初始化项目（使用 vanilla-ts 模板，不引入前端框架）
npm create @electron-vite@latest terminal-manager -- --template vanilla-ts

# 安装核心依赖
cd terminal-manager
npm install node-pty @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xterm/addon-search

# 开发运行
npm run dev
```

### 跨平台编译依赖

```bash
# Windows：需要 Visual Studio Build Tools（node-pty 原生模块编译）
# 推荐：Visual Studio Installer → "使用 C++ 的桌面开发" 工作负载
# 同时确认安装 Windows SDK 和 Spectre-mitigated libraries
# 不再建议依赖过时的 windows-build-tools 全局安装方式

# macOS：需要 Xcode Command Line Tools
xcode-select --install
```

### 打包

```bash
# 构建当前平台的安装包
npm run build

# 明确指定目标平台（需要在对应平台上执行，或使用 CI/CD）
npx electron-builder --win    # Windows .exe + .nsis
npx electron-builder --mac    # macOS .dmg + .zip

# 使用 GitHub Actions 自动构建双平台（推荐）
# 参见 .github/workflows/build.yml
```

### electron-builder 跨平台配置示例

```yaml
# electron-builder.yml
appId: com.terminal-manager.app
productName: Terminal Manager

mac:
  category: public.app-category.developer-tools
  target:
    - dmg
    - zip
  icon: resources/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false

win:
  target:
    - nsis
    - portable
  icon: resources/icon.ico

npmRebuild: true  # 自动 rebuild node-pty 等原生模块
```

