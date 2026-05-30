# Terminal Manager MVP 规格

## 1. MVP 目标

MVP 的目标是验证并交付一个稳定可用的“项目型多终端管理器”。

第一版只解决三件事：

1. 在一个桌面窗口内稳定运行多个终端。
2. 能按项目目录快速打开终端。
3. 能保存并重建标签、分屏和工作目录布局。

MVP 不追求完整终端产品体验，也不承诺恢复退出前正在运行的进程。

## 2. 成功标准

MVP 完成时，应满足：

- 应用启动后能看到可交互终端。
- 能创建、切换、关闭多个标签。
- 能在当前标签内做左右/上下分屏。
- 每个 pane 都有独立 PTY 会话。
- 能添加常用项目目录，并从项目目录打开新终端。
- 关闭应用后重新打开，可以重建上次标签、pane 布局、shell、cwd。
- 不存在明显 IPC 任意执行风险。
- Windows 环境完成一次真实打包验证。

## 3. 功能范围

### 3.1 必须实现

| 模块 | 功能 | 验收标准 |
|------|------|----------|
| 应用框架 | Electron + Vite 项目 | `npm run dev` 能启动桌面窗口。 |
| PTY | 创建 shell 进程 | Windows 可启动 PowerShell，macOS 可启动 zsh。 |
| 原生模块 | node-pty rebuild | 开发环境和打包产物中都能加载 node-pty。 |
| 终端渲染 | xterm.js 显示输出 | 能输入命令并看到输出。 |
| IPC | 输入输出转发 | 渲染进程不能直接访问 Node API。 |
| 标签 | 新建/关闭/切换标签 | 每个标签至少包含一个终端 pane。 |
| 分屏 | 左右/上下分屏 | 当前 pane 可拆分为两个独立 pane。 |
| Pane 生命周期 | 关闭 pane | 关闭 pane 时对应 PTY 被销毁。 |
| 项目目录 | 添加/删除项目路径 | 项目数据保存到 JSON。 |
| 快速打开 | 从项目打开终端 | 新终端 cwd 为项目目录。 |
| 布局保存 | 保存标签和布局树 | 保存可序列化数据，不保存运行期 sessionId。 |
| 布局重建 | 重启后重新创建终端 | 按 shell + cwd 重建 PTY。 |
| 基础设置 | 默认 shell、字体大小、主题 | 设置保存后重启仍生效。 |
| 错误兜底 | shell/cwd 不存在 | 给出提示并回退到默认 shell/cwd。 |

### 3.2 可以推迟

- 终端内容搜索。
- 字体连字开关。
- 命令面板。
- 快速打开面板。
- 右键菜单。
- 全局热键。
- 主题编辑器。
- 面板拖拽排序。
- 浮动面板。

这些功能有价值，但不影响 MVP 核心验证。

### 3.3 明确不做

- 恢复退出前正在运行的命令。
- 保存 Shell 内存状态。
- 可靠识别命令开始、结束和退出码。
- SSH 管理。
- 插件系统。
- 远程协作。
- 自动更新。

## 4. 数据模型

### 4.1 配置

```json
{
  "version": "0.1.0",
  "general": {
    "defaultShell": "",
    "defaultCwd": "",
    "fontSize": 14,
    "theme": "dark",
    "scrollback": 10000
  },
  "window": {
    "width": 1200,
    "height": 800,
    "sidebarWidth": 240,
    "sidebarVisible": true
  }
}
```

### 4.2 项目

```json
{
  "projects": [
    {
      "id": "proj_001",
      "name": "terminal-manager",
      "path": "E:\\VibeCoding\\terminal-manager"
    }
  ]
}
```

### 4.3 布局状态

```json
{
  "tabs": [
    {
      "id": "tab_001",
      "title": "terminal-manager",
      "activePaneId": "pane_001",
      "layout": {
        "type": "leaf",
        "paneId": "pane_001"
      },
      "panes": [
        {
          "id": "pane_001",
          "shell": "powershell.exe",
          "cwd": "E:\\VibeCoding\\terminal-manager",
          "projectId": "proj_001"
        }
      ]
    }
  ],
  "activeTabId": "tab_001"
}
```

注意：MVP 默认不自动执行历史 `command` 字段。若未来支持启动命令，需要提供确认机制或安全策略。

## 5. 安全要求

### 5.1 IPC 边界

渲染进程只能通过 preload 暴露的安全 API 调用主进程能力：

- `createTerminal(options)`
- `writeToTerminal(id, data)`
- `resizeTerminal(id, cols, rows)`
- `closeTerminal(id)`
- `listShells()`
- `loadConfig()`
- `saveConfig(config)`
- `loadProjects()`
- `saveProjects(projects)`

主进程必须重复校验参数，不能只信任 preload。

### 5.2 Shell 白名单

`shell` 只能来自：

- 平台适配层检测到的 shell 列表。
- 用户在设置中显式添加并保存的 shell 路径。

不允许渲染进程临时传入任意可执行文件作为 shell。

### 5.3 cwd 校验

创建 PTY 前必须校验：

- cwd 存在。
- cwd 是目录。
- 当前用户有访问权限。

失败时回退到用户主目录，并在 UI 中提示。

### 5.4 自动命令策略

MVP 默认不做自动命令恢复。未来若支持 `command`：

- 从布局恢复时默认不自动执行。
- 用户可为单个 workspace 显式开启。
- 第一次恢复时需要确认。

## 6. 测试要求

MVP 至少覆盖：

| 层级 | 测试内容 |
|------|----------|
| 单元测试 | 布局树 split / close / serialize / deserialize。 |
| 单元测试 | path utils：home 展开、路径规范化、file URI 转换。 |
| 单元测试 | config manager：默认值合并、坏 JSON 容错。 |
| 集成测试 | 创建 PTY 后能收到输出事件。 |
| 手工测试 | Windows PowerShell、CMD、Git Bash、WSL 检测。 |
| 手工测试 | 重启后恢复标签、pane、cwd。 |
| 手工测试 | 打包后 node-pty 正常加载。 |

## 7. 实施顺序

详细阶段文档见 [MVP 分阶段实施计划](../roadmap/implementation-plan.md)。如果本文和阶段文档有冲突，以阶段文档为当前执行范围，以本文为 MVP 总边界。

1. 初始化 Electron + Vite 工程。
2. 接入 xterm.js 静态终端容器。
3. 主进程接入 node-pty。
4. 打通 PTY 输入输出 IPC。
5. 增加平台 shell 检测。
6. 做标签管理。
7. 做最小布局树和分屏。
8. 做项目目录列表。
9. 做配置和布局持久化。
10. 做 Windows 打包验证。

## 8. 退出 MVP 的条件

满足以下条件后，可以进入 v1.0：

- PTY 基础能力稳定。
- 标签和分屏没有明显生命周期泄漏。
- 配置坏文件不会导致应用无法启动。
- Windows 打包产物可运行。
- 常用项目目录打开体验顺畅。
- 布局恢复的边界已写入文档和 UI 提示。

