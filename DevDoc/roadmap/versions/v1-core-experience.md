# v1.0 核心体验增强

## 1. 版本目标

v1.0 的目标是把 MVP 从“能用”变成“日常主力工具”。

MVP 已经具备终端、多标签、分屏、项目目录、布局恢复、设置、测试和打包。v1.0 不重写基础架构，而是在这些能力上补齐高频体验。

## 2. 版本原则

- 保持稳定优先。
- 不破坏 MVP 的布局恢复和 PTY 生命周期。
- 每个功能都要能单独关闭或不影响终端核心能力。
- 不做 v1.5 工作区模板。
- 不做 v2.0 Shell 集成、SSH、插件、会话保活。

## 3. 功能范围

### 3.1 命令面板

快捷键：

```text
CommandOrControl+Shift+P
```

功能：

- 搜索并执行应用命令。
- 支持模糊搜索。
- 支持键盘上下选择。
- 支持 Enter 执行。
- 支持 Esc 关闭。

首批命令：

- 新建标签。
- 关闭当前标签。
- 左右分屏。
- 上下分屏。
- 关闭当前 pane。
- 打开设置。
- 打开项目。
- 重新加载布局。

验收：

- 不用鼠标也能执行主要操作。
- 命令面板打开和关闭不会影响终端输入焦点。

### 3.2 快速打开面板

快捷键：

```text
CommandOrControl+P
```

功能：

- 搜索项目目录。
- Enter 后在项目 cwd 打开新终端。
- 支持最近项目优先。
- 支持空状态提示。

验收：

- 输入项目名片段能找到项目。
- 打开后新终端 cwd 正确。

### 3.3 终端内容搜索

功能：

- 搜索当前 pane 的终端输出。
- 支持下一个/上一个匹配。
- 支持大小写开关可选。
- 使用 xterm.js SearchAddon。

验收：

- 能搜索当前 pane 的历史输出。
- 搜索 UI 关闭后终端输入恢复正常。

### 3.4 Shell 检测增强

功能：

Windows：

- PowerShell 5。
- PowerShell 7 `pwsh`。
- CMD。
- Git Bash。
- WSL。

macOS：

- `$SHELL`。
- `/bin/zsh`。
- `/bin/bash`。
- Homebrew fish 可选。

验收：

- 设置页能列出可用 shell。
- 不存在的 shell 不显示。
- shell 选择保存后新终端生效。

### 3.5 主题和字体增强

功能：

- 内置至少 3 套主题：
  - Dark
  - Light
  - High Contrast
- 字体族设置。
- 字体大小设置。
- 行高可选。

验收：

- 主题切换后新旧终端显示一致。
- 字体设置重启后保留。

### 3.6 快捷键查看和基础管理

功能：

- 设置页展示当前快捷键。
- 检查明显快捷键冲突。
- v1.0 可以只支持查看，不强制支持自定义。

验收：

- 用户能看到主要快捷键。
- 冲突时有提示。

### 3.7 智能路径和 URL 识别

功能：

- URL 可点击打开默认浏览器。
- 文件路径可 Ctrl+Click 打开系统默认应用或编辑器。
- Windows 和 macOS 路径格式都要处理。

验收：

- `https://example.com` 可打开。
- 本地文件路径可识别。
- 识别失败不影响终端输出。

## 4. 不做内容

v1.0 明确不做：

- 工作区模板。
- 浮动面板。
- 面板拖拽重排。
- 输入广播。
- Shell 集成。
- 后台任务完成通知。
- SSH 管理。
- 插件系统。
- 终端录制。
- 命令块 UI。
- 真正会话保活。

## 5. 推荐实施顺序

1. 命令面板。
2. 快速打开面板。
3. 终端内容搜索。
4. Shell 检测增强。
5. 主题和字体增强。
6. 快捷键查看和冲突提示。
7. 智能路径和 URL 识别。
8. v1.0 回归测试和打包验证。

## 6. 测试要求

- 命令注册和执行单元测试。
- 模糊搜索测试。
- 项目快速打开测试。
- Shell 检测 mock 测试。
- 主题配置读写测试。
- 路径识别测试。
- 回归测试 MVP 多标签、分屏、布局恢复。

## 7. 验收标准

v1.0 完成时应满足：

- 命令面板可用。
- 快速打开项目可用。
- 当前终端搜索可用。
- Shell 检测比 MVP 更完整。
- 主题和字体设置可用。
- 快捷键可查看。
- URL / 文件路径识别可用。
- MVP 所有成功标准仍然通过。
- 打包产物仍能运行终端。

## 8. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 命令面板抢终端焦点 | 终端输入体验变差 | 打开面板时暂停终端输入，关闭后恢复焦点。 |
| 搜索大缓冲区卡顿 | UI 卡顿 | 使用 xterm addon，限制搜索范围或节流。 |
| 路径识别误判 | 打开错误文件 | Ctrl+Click 才触发，并做路径存在校验。 |
| Shell 检测不完整 | 用户找不到 shell | 支持用户手动添加 shell 路径。 |

## 9. 总 AI 提示词

```text
请开始 v1.0 核心体验增强开发。

请读取：
- docs/product/mvp-spec.md
- docs/roadmap/post-mvp-roadmap.md
- docs/roadmap/versions/v1-core-experience.md
- docs/architecture/design.md 作为参考

优先级：
当前文档 > docs/product/mvp-spec.md > docs/product/feasibility-analysis.md > docs/architecture/design.md

要求：
- 不重写 MVP 架构
- 保持多标签、分屏、布局恢复、项目目录和打包能力不退化
- 按文档顺序实现 v1.0 功能
- 每次只实现一个子功能并运行验证
- 不实现 v1.5/v2.0 功能

请先实现 v1.0 的第一个子功能：命令面板。
完成后运行测试、类型检查和可用构建命令，并说明改了哪些文件。
```

## 10. 分功能 AI 提示词

### 命令面板

```text
请实现 v1.0 命令面板。

读取 docs/roadmap/versions/v1-core-experience.md 的 3.1 节。

要求：
- 快捷键 CommandOrControl+Shift+P
- 支持模糊搜索命令
- 支持键盘上下选择、Enter 执行、Esc 关闭
- 首批命令包括新建标签、关闭标签、左右分屏、上下分屏、关闭 pane、打开设置
- 打开和关闭命令面板后，终端焦点恢复正常

不要实现快速打开项目、终端搜索或其他 v1.0 功能。
```

### 快速打开面板

```text
请实现 v1.0 快速打开面板。

读取 docs/roadmap/versions/v1-core-experience.md 的 3.2 节。

要求：
- 快捷键 CommandOrControl+P
- 搜索项目列表
- Enter 后按项目 cwd 打开新终端
- 支持空状态提示
- 不影响已有项目管理和布局恢复

不要实现命令面板以外的新功能，也不要做工作区模板。
```

### 终端内容搜索

```text
请实现 v1.0 终端内容搜索。

读取 docs/roadmap/versions/v1-core-experience.md 的 3.3 节。

要求：
- 使用 xterm.js SearchAddon
- 搜索当前 focused pane
- 支持上一个/下一个匹配
- 搜索 UI 关闭后终端输入恢复

不要实现全局跨 pane 搜索。
```

### Shell 检测增强

```text
请增强 Shell 检测。

读取 docs/roadmap/versions/v1-core-experience.md 的 3.4 节。

要求：
- Windows 检测 PowerShell、pwsh、CMD、Git Bash、WSL
- macOS 检测 $SHELL、zsh、bash
- 不显示不存在的 shell
- 设置页可选择检测到的 shell
- 保存后新终端生效

请补充 shell 检测的单元测试或 mock 测试。
```

### 主题和字体增强

```text
请实现 v1.0 主题和字体增强。

读取 docs/roadmap/versions/v1-core-experience.md 的 3.5 节。

要求：
- 内置 Dark、Light、High Contrast 三套主题
- 支持字体族和字体大小设置
- 设置重启后保留
- 应用到新终端，能安全应用到现有终端则一起做

不要做复杂主题编辑器。
```

### 智能路径和 URL 识别

```text
请实现 v1.0 智能路径和 URL 识别。

读取 docs/roadmap/versions/v1-core-experience.md 的 3.7 节。

要求：
- URL 可点击打开默认浏览器
- 文件路径支持 Ctrl+Click 打开
- 打开前校验本地文件是否存在
- Windows 和 macOS 路径格式都要考虑
- 识别失败不能影响终端输出

不要做 Shell 集成或命令块 UI。
```

