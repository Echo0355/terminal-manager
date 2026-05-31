# Terminal Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个基于 Electron 的跨平台多终端管理工具，解决多终端窗口混乱和路径切换繁琐的问题。

**[English](./README.md)** | 中文

## 文档

- [User Guide](./docs/USER_GUIDE.md) | [用户指南](./docs/USER_GUIDE_CN.md)
- [已知限制](./docs/KNOWN_LIMITATIONS.md)
- [更新日志](./docs/CHANGELOG.md)
- [贡献指南](./docs/CONTRIBUTING.md)
- [全部文档](./docs/README.md)

## 功能特性

- **多标签终端**：在一个窗口内管理多个终端会话
- **分屏布局**：支持左右/上下分屏，自由调整大小
- **项目管理**：添加常用项目目录，一键打开终端
- **布局恢复**：重启后自动恢复标签、分屏和工作目录
- **跨平台**：支持 Windows 和 macOS

## 系统要求

- Windows 10 (1809+) 或 macOS 10.15+
- Node.js 20+

## 安装

### 下载安装包

从 [Releases](https://github.com/Echo0355/terminal-manager/releases) 页面下载对应平台的安装包：

- Windows: `Terminal Manager-1.1.2-Setup.exe`

### 从源码构建

```bash
# 克隆项目
git clone https://github.com/Echo0355/terminal-manager.git
cd terminal-manager

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建打包
npm run build
npm run package
```

## 快速开始

### 启动应用

```bash
npm run dev
```

应用启动后会自动打开一个终端窗口。

### 添加项目

1. 点击侧边栏顶部的 **＋** 按钮
2. 在弹出的对话框中选择项目目录
3. 项目会出现在侧边栏列表中

### 从项目打开终端

- **点击项目名称**：在新标签中打开
- **点击 ▶**：在新标签中打开

### 标签操作

| 操作 | 快捷键 |
|------|--------|
| 新建标签 | `Ctrl+T` |
| 关闭标签 | `Ctrl+W` |
| 下一个标签 | `Ctrl+Tab` |
| 上一个标签 | `Ctrl+Shift+Tab` |
| 切换到第N个标签 | `Ctrl+1~9` |

### 分屏操作

| 操作 | 快捷键 |
|------|--------|
| 关闭当前面板 | `Alt+Shift+W` |

### 焦点切换

| 操作 | 快捷键 |
|------|--------|
| 焦点移到左边 | `Alt+←` |
| 焦点移到右边 | `Alt+→` |
| 焦点移到上边 | `Alt+↑` |
| 焦点移到下边 | `Alt+↓` |

### 设置

按 `Ctrl+,` 打开设置对话框，可以配置：

- 默认 Shell（如 `powershell.exe`、`cmd.exe`、`bash`）
- 默认工作目录
- 字体大小（8-32）
- 滚动缓冲行数
- 主题（深色/浅色）

设置保存后需要重启应用生效。

## 布局恢复

应用会自动保存以下状态：

- 所有标签和面板
- 分屏布局结构
- 每个面板的 Shell 和工作目录
- 侧边栏宽度

重启应用后，这些状态会自动恢复。

## 数据存储

应用数据存储在用户目录下：

- **Windows**: `%APPDATA%/terminal-manager/`
- **macOS**: `~/Library/Application Support/terminal-manager/`

包含以下文件：

- `config.json`：应用配置
- `projects.json`：项目列表
- `layout-state.json`：布局状态

## 常见问题

**Q: 终端无法启动？**

A: 请检查：
1. Shell 路径是否正确
2. 工作目录是否存在
3. 系统是否安装了对应的 Shell

**Q: 如何更改默认 Shell？**

A: 按 `Ctrl+,` 打开设置，在"默认 Shell"中输入 Shell 路径，保存后重启应用。

**Q: 布局没有恢复？**

A: 请检查：
1. 应用是否正常关闭（非强制杀死）
2. `layout-state.json` 文件是否存在且内容正常

## 贡献

欢迎贡献！请查看 [贡献指南](./docs/CONTRIBUTING.md) 了解如何参与项目。

### 快速开始

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'feat: 添加某功能'`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。
