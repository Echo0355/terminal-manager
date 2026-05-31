# Changelog

本文件记录 Terminal Manager 的版本更新历史。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [1.0.1] - 2026-05-31

### 新增

- **Claude 快捷按钮**：每个终端面板右上角新增 Claude 图标按钮，点击即可在当前终端执行 `claude` 命令
  - 单面板模式：浮动在终端右上角，hover 时显示
  - 分屏模式：与关闭按钮并列显示在面板标签栏右侧

## [1.0.0] - 2026-05-30

### 新增

- **VSCode 风格拖拽分屏**：支持水平/垂直分割面板，拖拽分割条调整大小
- **面板标签栏**：分屏时每个面板显示独立标签栏，支持拖拽移动
- **项目目录管理**：侧边栏管理常用项目目录，快速切换终端工作目录
- **多标签页支持**：顶部标签栏管理多个终端会话
- **主题系统**：内置深色/浅色主题
- **活动栏与状态栏**：显示当前 Shell 类型、工作目录、面板数量等信息
- **数据持久化**：自动保存配置、项目列表和布局状态到 `%APPDATA%/terminal-manager/`
- **Shell 自动检测**：自动识别 PowerShell、CMD、Git Bash 等终端类型
- **MIT 许可证**

### 技术细节

- 基于 Electron + electron-vite 构建，三进程架构
- 使用 xterm.js 渲染终端，node-pty 管理 Shell 进程
- 分屏布局采用二叉树数据结构，操作不可变
- IPC 通信经过长度限制和类型校验
- 共享模块（config、project、layout-tree）均有完整测试覆盖
