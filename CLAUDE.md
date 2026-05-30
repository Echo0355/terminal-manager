# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目简介

终端管理器 — 基于 Electron 的跨平台多终端管理工具，支持标签页/分屏布局管理和项目目录快速切换。界面和文档为中文，代码为英文。

## 常用命令

| 用途 | 命令 |
|------|------|
| 开发模式运行 | `npm run dev` |
| 构建 | `npm run build` |
| 类型检查（全部） | `npm run typecheck` |
| 类型检查（主进程+预加载） | `npm run typecheck:node` |
| 类型检查（渲染进程） | `npm run typecheck:web` |
| 运行测试 | `npm run test` |
| 运行测试（监听模式） | `npm run test:watch` |
| 打包安装程序 | `npm run package` |

## 架构

标准 Electron 应用，使用 **electron-vite** 作为构建工具，三进程模型：

- **主进程** (`src/main/index.ts`)：Node.js 进程。通过 `node-pty` 管理 PTY 会话，处理 IPC 通信、应用生命周期、Shell 检测，以及数据持久化（config/projects/layout-state JSON 文件存储在 `%APPDATA%/terminal-manager/`）。
- **预加载脚本** (`src/preload/index.ts`)：桥接层。通过 `contextBridge` 向渲染进程暴露 `window.terminalAPI`。类型声明在 `src/preload/index.d.ts`。
- **渲染进程** (`src/renderer/src/main.ts`)：浏览器进程。所有 UI 为原生 JS 单文件实现（无框架），使用 xterm.js 渲染终端。CSS 内嵌在 `src/renderer/index.html` 中。
- **共享模块** (`src/shared/`)：主进程和渲染进程共用的纯逻辑模块 — 配置类型/校验、项目类型/校验、布局树数据结构。均有对应测试。

### 布局树

分屏布局采用二叉树结构 (`src/shared/layout-tree.ts`)。叶子节点是终端面板，容器节点定义分割方向 (`horizontal`/`vertical`) 和子节点尺寸。操作是不可变的 — 返回新树而非修改原树。此模块是代码库中算法复杂度最高的部分。

### IPC 模式

主进程使用 `ipcMain.handle`（请求/响应）和 `ipcMain.on`（单向通知）。所有 IPC 输入都经过长度限制和类型校验。预加载脚本暴露类型化的 `terminalAPI` 对象；渲染进程只能通过此 API 调用（已开启上下文隔离，禁用 Node 集成）。

### 原生模块

`node-pty` 是原生 C++ 插件。在 Vite 构建中被外部化处理，生产构建中从 ASAR 中解包（在 `electron-builder.yml` 中配置）。

## TypeScript

使用复合项目引用配置：
- `tsconfig.node.json` — 主进程 + 预加载（继承 `@electron-toolkit/tsconfig/tsconfig.node.json`）
- `tsconfig.web.json` — 渲染进程（继承 `@electron-toolkit/tsconfig/tsconfig.web.json`）
- `tsconfig.json` — 根配置，引用上述两个

## 测试

使用 Vitest，node 环境。测试文件与源码并排放置在 `src/shared/` 中。运行单个测试文件：`npx vitest run src/shared/config.test.ts`。

## 核心依赖

- `@xterm/xterm` + 插件 — 渲染进程中的终端模拟器
- `node-pty` — 原生 PTY 绑定，用于创建 Shell 进程
- `electron-vite` — 基于 Vite 的 Electron 三进程构建工具
- `electron-builder` — 打包工具（Windows NSIS 安装程序）
