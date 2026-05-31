# CLAUDE.md

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目简介

Terminal Manager — 基于 Electron 的跨平台多终端管理工具，支持标签页/分屏布局管理和项目目录快速切换。界面和文档为中文，代码为英文。

## 许可证

本项目采用 MIT 许可证开源。详情请参阅 [LICENSE](LICENSE) 文件。

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

- **主进程** (`src/main/`)：Node.js 进程，按职责拆分为多个模块：
  - `index.ts` — 应用入口、生命周期管理、IPC 注册
  - `pty-ipc.ts` — PTY 会话管理和终端相关 IPC 处理
  - `shell-detector.ts` — Shell 环境检测（PowerShell/CMD/Git Bash 等）
  - `data-store.ts` — 数据持久化（config/projects/layout-state JSON 存储在 `%APPDATA%/terminal-manager/`）
  - `window.ts` — 窗口创建和管理
  - `menu.ts` — 应用菜单配置
- **预加载脚本** (`src/preload/index.ts`)：桥接层。通过 `contextBridge` 向渲染进程暴露 `window.terminalAPI`。类型声明在 `src/preload/index.d.ts`。
- **渲染进程** (`src/renderer/src/`)：浏览器进程，原生 JS 实现（无框架），按功能拆分为多个模块：
  - `main.ts` — 渲染进程入口，初始化各模块
  - `tab-pane-manager.ts` — 标签页和面板的核心管理逻辑
  - `tab-chrome.ts` — 标签栏 UI 渲染（VSCode 风格标签页）
  - `layout-render.ts` — 分屏布局的 DOM 渲染
  - `layout-ops.ts` — 布局操作逻辑（分割、关闭、调整大小）
  - `drag-drop.ts` — 拖拽交互（标签拖拽、分屏拖拽）
  - `project-manager.ts` — 项目目录管理 UI
  - `settings.ts` — 设置面板 UI
  - `state.ts` — 渲染进程全局状态管理
  - `types.ts` — 渲染进程类型定义
  - `ui-utils.ts` — UI 工具函数
  - CSS 内嵌在 `index.html` 中
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

使用 Vitest，node 环境。测试文件与源码并排放置，命名为 `<模块名>.test.ts`。

| 目录 | 说明 |
|------|------|
| `src/shared/` | 共享模块测试（config、project、layout-tree） |
| `src/main/` | 主进程模块测试（shell-detector 等） |
| `src/renderer/src/` | 渲染进程模块测试（layout-ops、tab-chrome 等） |

运行单个测试文件：`npx vitest run src/shared/config.test.ts`

## 编码规范

### 注释

- 代码注释使用中文，与界面和文档语言保持一致
- 文件顶部添加模块说明注释，描述该文件的职责
- 公开的函数、类、接口必须添加 JSDoc 注释（`@param`、`@returns` 等）
- 内部逻辑中的非显而易见步骤，添加行内注释说明意图
- 不要写无意义的废话注释（如 `// 获取名称` 对 `getName()` 的注释）

### 测试

- 写完功能代码后，必须为其编写对应的测试
- 测试文件与源码并排放置，命名为 `<模块名>.test.ts`
- 使用 Vitest 框架，node 环境
- 测试应覆盖：正常路径、边界条件、异常输入
- 纯逻辑模块（`src/shared/`）的新功能必须有测试才能合入
- 运行单个测试：`npx vitest run <测试文件路径>`

## 核心依赖

- `@xterm/xterm` + 插件 — 渲染进程中的终端模拟器
- `node-pty` — 原生 PTY 绑定，用于创建 Shell 进程
- `electron-vite` — 基于 Vite 的 Electron 三进程构建工具
- `electron-builder` — 打包工具（Windows NSIS 安装程序）

## 贡献指南

详见 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)。
