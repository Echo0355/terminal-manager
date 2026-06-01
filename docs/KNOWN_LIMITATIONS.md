# Known Limitations | 已知限制

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

本文档记录 Terminal Manager 的当前已知限制和注意事项。

## 平台支持

- **仅支持 Windows 和 macOS**：暂不提供 Linux 安装包
- **Windows 10 1809+**：旧版本 Windows 10 可能存在兼容性问题

## 终端功能

- **无 tmux/screen 集成**：应用内置分屏功能，不依赖外部终端复用器
- **Shell 自动检测**：仅检测常见 Shell（PowerShell、CMD、Git Bash、WSL、Zsh、Bash、Sh、Fish），自定义 Shell 需手动在设置中配置路径
- **无 SSH 管理**：暂不支持内置 SSH 连接管理，需通过终端手动连接

## 布局系统

- **分屏层级**：理论上无限制，但过多嵌套层级可能影响性能和使用体验
- **布局持久化**：仅在正常退出时保存布局，强制杀死进程可能导致布局丢失

## 数据存储

- **无云同步**：配置和项目数据仅存储在本地，不支持跨设备同步
- **无导入/导出**：暂不支持配置的导入和导出功能

## 已知问题

- **xterm 滚动条**：在某些 DPI 缩放设置下，终端滚动条宽度可能与容器不完全匹配
- **macOS 权限**：首次运行可能需要在系统偏好设置中授予辅助功能权限
