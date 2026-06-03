# Terminal Manager 后续 AI 实施任务书

本文档是后续 vibe coding / AI 编码时使用的详细任务清单。

目标不是评估实现成本，而是把“后面还要做什么”写成 AI 可以直接读取、拆分、实现、测试和验收的规格。每个任务都尽量说明：

- 用户价值
- 功能边界
- 推荐改动位置
- 数据结构和 IPC
- UI 行为
- 验收标准
- 测试要求
- 可复制给 AI 的提示词

## 0. 使用方式

### 0.1 文档优先级

后续 AI 开发时，建议优先读取：

```text
DevDoc/roadmap/ai-implementation-backlog.md
DevDoc/roadmap/post-mvp-roadmap.md
DevDoc/roadmap/versions/*.md
DevDoc/architecture/design.md
AGENTS.md
README_CN.md
docs/KNOWN_LIMITATIONS.md
```

如果文档冲突：

1. 本文档决定“后续要做什么”和“如何拆任务”。
2. `DevDoc/roadmap/versions/*.md` 决定版本范围。
3. `DevDoc/architecture/design.md` 作为长期技术参考，不代表必须立即全部实现。
4. `README_CN.md` 和 `docs/KNOWN_LIMITATIONS.md` 必须在功能变化后同步更新。

### 0.2 AI 开发原则

- 每次只做一个明确任务，不把多个大模块混在一个提交里。
- 新增纯逻辑能力优先放到 `src/shared/` 或可测试的 `src/renderer/src/services/`。
- 涉及主进程能力时，先补类型、校验和 IPC，再接 UI。
- 涉及持久化时，必须考虑旧数据兼容、损坏数据回退和测试。
- 涉及终端输入、自动执行、远程连接、插件执行时，默认安全优先。
- 功能完成后至少运行相关单测；大功能完成后运行 `npm run typecheck` 和 `npm run test`。

## 1. 当前基础状态

根据当前代码结构，项目已经具备以下基础能力：

- Electron 三进程结构：主进程、预加载、渲染进程。
- `node-pty` 终端创建、输入、输出、resize、关闭。
- 多标签、分屏、pane 焦点切换、pane 关闭。
- VS Code 风格分割线拖拽调整尺寸。
- 标签拖拽、pane 拖拽到其他位置或新标签。
- 项目目录列表、添加和删除。
- 设置页：默认 Shell、默认 cwd、字体大小、滚动缓冲、深色/浅色主题。
- Shell 自动检测：Windows 常见 Shell、macOS/Linux 常见 Shell。
- xterm.js WebLinksAddon 基础 URL 链接。
- 右键复制/粘贴菜单、IME 定位处理、滚动条适配。
- Vitest 测试已覆盖一批共享模块、布局、项目、Shell、UI 辅助逻辑。

当前也存在需要优先处理的产品和文档不一致：

- `README_CN.md` 描述“启动后自动打开终端”和“布局恢复”，但 `src/renderer/src/main.ts` 当前没有调用 `restoreLayout()` 或 `addTab()`。
- `src/renderer/src/services/tab-pane-manager.ts` 中 `scheduleSaveLayout()` 是 no-op，并且注释写明“每次启动为空白状态”。
- `data-store.service.ts` 仍保留 `layout-state.json` 读写能力，但渲染进程没有实际保存布局。
- 主题类型目前只有 `dark | light`，后续文档中的 High Contrast 尚未落地。
- 命令面板、快速打开、终端搜索、Workspace 模板、SSH、Shell 集成、会话保活、插件系统仍是后续能力。

因此，后续第一优先级不是直接做花哨功能，而是先把当前承诺和实际行为重新对齐。

## 2. P0：恢复基础承诺和工程护栏

### P0-1 启动流程：恢复布局或创建默认终端

#### 用户价值

用户打开应用后必须立刻可用：

- 如果有有效布局状态，恢复标签、pane、工作目录和分割比例。
- 如果没有有效布局状态，创建一个默认终端。
- 如果恢复失败，给出可理解提示，并回退到一个可用终端。

#### 推荐改动位置

- `src/renderer/src/main.ts`
- `src/renderer/src/services/tab-pane-manager.ts`
- `src/renderer/src/store/state.ts`
- `src/main/services/data-store.service.ts`
- `src/shared/layout-tree.ts`
- `src/shared/layout-tree.test.ts`
- `src/renderer/src/services/tab-pane-manager` 相关测试可新增或拆纯逻辑测试

#### 具体要求

- `main()` 初始化顺序建议：
  1. `loadConfig()`
  2. `loadShells()`
  3. `applyTheme()`
  4. `loadProjects()`
  5. 初始化 resize、drag-drop、IME、window resize
  6. 调用 `restoreLayout()`
  7. 如果 `restoreLayout()` 返回 false，则调用 `addTab()`
  8. 更新 pane count，隐藏 loading
- `restoreLayout()` 失败时不要让应用停在 loading。
- 某个 pane 恢复失败时，不应导致整个应用不可用。
- 恢复时只恢复 shell、cwd、布局结构，不承诺恢复正在运行的进程输出。
- 对不存在的 cwd：
  - 优先回退到默认 cwd。
  - 在终端或通知中提示该 pane 的原 cwd 不存在。
- 恢复后焦点应落到 `activeTabId` 和 `activePaneId` 对应 pane；不存在时回退到第一个可用 pane。

#### 验收标准

- 首次启动无布局文件时自动出现一个可输入的终端。
- 正常关闭后重启，可以恢复标签数量、pane 数量、分割方向、分割比例、cwd、shell。
- 损坏的 `layout-state.json` 不会让应用白屏。
- 布局恢复失败时仍有默认终端可用。

#### 测试要求

- `restoreLayout()` 对空状态返回 false。
- 布局中部分 pane 创建失败时仍恢复其他 pane。
- 旧 paneId 到新 paneId 的 remap 正确。
- 无效布局树回退到单 pane。
- `main()` 启动流程可通过抽出纯函数测试“恢复成功不创建默认终端，恢复失败创建默认终端”。

#### AI 提示词

```text
请实现 P0-1 启动流程修复。

读取：
- DevDoc/roadmap/ai-implementation-backlog.md 的 P0-1
- src/renderer/src/main.ts
- src/renderer/src/services/tab-pane-manager.ts
- src/main/services/data-store.service.ts

要求：
- 应用启动时先尝试 restoreLayout()
- 如果没有有效布局或恢复失败，则自动 addTab()
- 恢复失败不能卡在 loading
- 不恢复运行中的进程，只恢复 shell、cwd、tab、pane、layout
- 补充相关测试
- 完成后运行相关测试和 typecheck
```

### P0-2 重新启用布局保存

#### 用户价值

用户分屏、切换标签、拖拽调整尺寸、关闭 pane、改变侧边栏宽度后，重启应用应保持上一次布局。

#### 推荐改动位置

- `src/renderer/src/services/tab-pane-manager.ts`
- `src/renderer/src/components/layout-render.ts`
- `src/renderer/src/main.ts`
- `src/renderer/src/store/state.ts`
- `src/preload/preload.ts`
- `src/preload/preload.d.ts`
- `src/main/ipc/index.ts`
- `src/main/services/data-store.service.ts`
- `src/shared/layout-tree.ts`

#### 数据格式

建议沿用当前 `LayoutState`：

```ts
interface LayoutState {
  version: '1.0'
  tabs: Array<{
    id: string
    title: string
    activePaneId: string
    layout: LayoutStateNode
    panes: Array<{
      id: string
      shell: string
      cwd: string
      title?: string
    }>
  }>
  activeTabId: string
  windowState?: {
    sidebarWidth: number
    sidebarCollapsed?: boolean
  }
}
```

#### 具体要求

- 将 `scheduleSaveLayout()` 从 no-op 改为 debounce 保存。
- 保存频率建议 debounce 300-800ms，避免拖拽 resize 时频繁写文件。
- 需要保存的动作：
  - 新建标签
  - 关闭标签
  - 切换标签
  - 新建/关闭 pane
  - pane 拖拽重排
  - 分割线拖拽结束
  - 侧边栏宽度变化或折叠状态变化
  - pane 标题变化
- 保存前需要序列化 `Map<string, Pane>`，不能把 xterm 对象写入 JSON。
- 保存空标签时允许 `tabs: []`，但正常启动要回退到默认终端。
- 主进程要校验保存 payload 的基本结构，避免写入明显恶意或过大的数据。
- `clearLayoutState()` 不应在普通退出时默认调用，除非新增“清空布局”功能。

#### 验收标准

- 分屏后重启，分屏仍存在。
- 拖拽分割线后重启，比例保持。
- 多标签重启后顺序保持。
- 删除一个 pane 后重启，不会恢复被删除 pane。
- 关闭所有标签后退出，再启动会创建默认终端。

#### 测试要求

- 序列化函数只输出 JSON 安全字段。
- `LayoutStateNode` 校验覆盖正常、空 children、sizes 长度不匹配、未知 node type。
- debounce 保存可用 fake timer 测试。

#### AI 提示词

```text
请实现 P0-2 布局保存恢复。

读取 DevDoc/roadmap/ai-implementation-backlog.md 的 P0-2。

要求：
- 把 scheduleSaveLayout() 改成真实 debounce 保存
- 保存 tabs、activeTabId、pane shell/cwd/title、layout、sidebarWidth
- 不序列化 xterm/DOM/FitAddon
- 主进程保存前做基本结构校验
- 普通退出不清空 layout-state.json
- 补充序列化、校验和恢复相关测试
```

### P0-3 文档与真实行为同步

#### 用户价值

用户和后续 AI 都能相信文档。

#### 推荐改动位置

- `README_CN.md`
- `README.md`
- `docs/USER_GUIDE_CN.md`
- `docs/USER_GUIDE.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/CHANGELOG.md`
- `DevDoc/roadmap/*.md`

#### 具体要求

- 如果 P0-1/P0-2 完成，保留“布局恢复”描述，并补充“不会恢复正在运行的进程”。
- 如果暂时不恢复布局，README 必须明确当前行为。
- 快捷键表要和 `src/main/windows/menu.ts`、`src/renderer/src/main.ts` 保持一致。
- 版本号、安装包名称和 `package.json` 保持一致。

#### AI 提示词

```text
请同步用户文档和当前代码行为。

要求：
- 检查 README_CN.md、README.md、docs/USER_GUIDE_CN.md、docs/KNOWN_LIMITATIONS.md
- 确保启动行为、布局恢复、快捷键、主题、项目管理描述与代码一致
- 如果布局恢复已实现，说明只恢复布局和 cwd，不恢复运行中的进程
- 如果某功能未实现，不要在 README 中写成已实现
```

### P0-4 跨平台快捷键规范化

#### 用户价值

macOS 用户应使用 Command，Windows 用户使用 Ctrl。文档中的 `CommandOrControl` 应在渲染层也正确工作。

#### 推荐改动位置

- `src/renderer/src/main.ts`
- `src/main/windows/menu.ts`
- 新增 `src/renderer/src/utils/keyboard.ts`
- 新增 `src/renderer/src/utils/keyboard.test.ts`

#### 具体要求

- 抽出 `isCommandOrCtrl(event)`：
  - macOS: `event.metaKey`
  - Windows/Linux: `event.ctrlKey`
  - 测试环境允许传入 platform mock。
- 所有全局快捷键统一使用该 helper。
- 避免终端正在输入时错误拦截普通快捷键。
- 保留终端内常用快捷键：
  - Ctrl+C 在有选区时复制，无选区时发送中断。
  - Ctrl+V/Command+V 粘贴。
  - Ctrl+Shift+C/V 可作为兼容路径。

#### 验收标准

- macOS 上 Command+T 新建标签。
- Windows 上 Ctrl+T 新建标签。
- 终端内 Ctrl+C 无选区仍可中断进程。

#### AI 提示词

```text
请实现跨平台快捷键规范化。

要求：
- 新增 keyboard helper 和测试
- 渲染进程所有 CommandOrControl 快捷键使用 helper
- 不破坏终端内 Ctrl+C/Ctrl+V 行为
- 同步 README 和用户指南中的快捷键描述
```

## 3. P1：日常效率核心能力

### P1-1 命令面板

#### 用户价值

用户不用记快捷键，也不用移动鼠标，就能快速执行主要操作。

#### 推荐改动位置

- 新增 `src/renderer/src/services/command-registry.ts`
- 新增 `src/renderer/src/services/command-palette.ts`
- 新增 `src/renderer/src/services/fuzzy-search.ts`
- 新增测试：
  - `command-registry.test.ts`
  - `fuzzy-search.test.ts`
  - `command-palette.test.ts`（可测纯逻辑）
- `src/renderer/index.html`
- `src/renderer/src/main.ts`
- `src/main/windows/menu.ts`

#### 数据结构

```ts
interface AppCommand {
  id: string
  title: string
  category: 'terminal' | 'tab' | 'pane' | 'project' | 'workspace' | 'settings' | 'help'
  shortcut?: string
  keywords?: string[]
  enabled?: () => boolean
  run: () => void | Promise<void>
}
```

#### 首批命令

- 新建标签
- 关闭当前标签
- 关闭当前 pane
- 左右分屏
- 上下分屏
- 切换到下一个标签
- 切换到上一个标签
- 聚焦左/右/上/下 pane
- 打开设置
- 切换主题
- 切换侧边栏
- 添加项目
- 打开快速打开面板
- 重新加载窗口

#### UI 行为

- 快捷键：`CommandOrControl+Shift+P`
- 居中浮层，不进入设置页。
- 输入框自动聚焦。
- 支持模糊搜索、上下选择、Enter 执行、Esc 关闭。
- 命令不可用时置灰或不显示。
- 关闭后焦点回到打开前的终端 pane。
- 输入法组合输入期间不要误触发 Enter。

#### 验收标准

- 可以通过命令面板新建标签、分屏、打开设置。
- 搜索 `split`、`分屏`、`settings`、`设置` 都能找到对应命令。
- 打开/关闭命令面板不会把终端焦点弄丢。

#### AI 提示词

```text
请实现 P1-1 命令面板。

读取 DevDoc/roadmap/ai-implementation-backlog.md 的 P1-1。

要求：
- 新增命令注册表、模糊搜索和命令面板 UI
- 快捷键 CommandOrControl+Shift+P
- 支持上下选择、Enter 执行、Esc 关闭
- 首批命令覆盖标签、pane、设置、项目和主题
- 命令执行后恢复终端焦点
- 补充 command registry 和 fuzzy search 测试
```

### P1-2 快速打开项目

#### 用户价值

项目多时，用户可以像 VS Code `CommandOrControl+P` 一样快速搜索项目并打开终端。

#### 推荐改动位置

- 新增 `src/renderer/src/services/quick-open.ts`
- 复用 `fuzzy-search.ts`
- `src/renderer/src/services/project-manager.ts`
- `src/renderer/index.html`
- `src/renderer/src/main.ts`

#### UI 行为

- 快捷键：`CommandOrControl+P`
- 搜索项目名称、别名、路径、分组。
- 最近打开项目排在前面。
- Enter 在项目 cwd 中打开新标签。
- 支持 `>` 前缀切换到命令搜索，或提示用户使用命令面板。
- 空状态提供“添加项目”入口。
- 项目路径不存在时提示，并提供“移除项目”或“重新定位”。

#### 验收标准

- 输入项目名片段能找到项目。
- Enter 后新终端 cwd 正确。
- 最近项目优先。
- 空项目列表时不会显示空白浮层。

#### 测试要求

- 搜索排序测试。
- 最近项目排序测试。
- 路径不存在分支测试。

#### AI 提示词

```text
请实现 P1-2 快速打开项目。

要求：
- 快捷键 CommandOrControl+P
- 复用模糊搜索
- 搜索项目名称、路径、后续扩展的 alias/group
- Enter 后用项目 cwd 新建标签
- 支持空状态和路径不存在提示
- 更新最近项目
- 补充搜索和打开逻辑测试
```

### P1-3 终端内容搜索

#### 用户价值

用户可以在当前终端输出历史中搜索错误、文件名、日志关键字。

#### 推荐改动位置

- 安装或确认 `@xterm/addon-search`
- `src/renderer/src/services/tab-pane-manager.ts`
- 新增 `src/renderer/src/services/terminal-search.ts`
- `src/renderer/index.html`
- `src/renderer/src/main.ts`

#### 功能要求

- 快捷键：`CommandOrControl+F`
- 仅搜索当前 focused pane。
- 支持下一个、上一个。
- 支持大小写匹配开关。
- 支持全词匹配开关可选。
- 搜索框关闭后恢复终端焦点。
- pane 切换时搜索 UI 应切换目标或自动关闭。

#### 验收标准

- 能搜索当前 pane 的历史输出。
- 搜索不存在内容时有明确状态。
- 搜索 UI 不遮挡输入区域核心内容。

#### AI 提示词

```text
请实现 P1-3 终端内容搜索。

要求：
- 使用 @xterm/addon-search
- 快捷键 CommandOrControl+F
- 搜索当前 focused pane
- 支持上一个/下一个、大小写开关
- 关闭后恢复终端焦点
- 不做跨 pane 全局搜索
```

### P1-4 快捷键查看和冲突提示

#### 用户价值

用户能知道当前支持哪些快捷键，并发现冲突。

#### 推荐改动位置

- 新增 `src/renderer/src/services/keybindings.ts`
- 新增 `src/renderer/src/services/keybindings.test.ts`
- `src/renderer/src/services/settings.ts`
- `src/renderer/index.html`
- `src/main/windows/menu.ts`

#### 功能要求

- 建立统一快捷键表，供：
  - 菜单
  - 渲染进程 keydown
  - 命令面板显示
  - 设置页展示
  - README 生成或人工同步
- 设置页展示快捷键列表。
- 检测明显冲突：
  - 同一平台同一快捷键绑定多个全局命令。
  - 与终端内保留快捷键冲突。
- v1 可以只查看，不做自定义。

#### 验收标准

- 设置页能看到主要快捷键。
- 命令面板里能显示快捷键。
- 冲突时有提示。

#### AI 提示词

```text
请实现 P1-4 快捷键查看和冲突提示。

要求：
- 新增统一 keybindings 数据源
- 设置页展示快捷键
- 命令面板显示快捷键
- 检测明显冲突
- 先不做快捷键自定义
```

### P1-5 主题和字体增强

#### 用户价值

不同环境下，用户可以获得更舒适和可访问的终端显示。

#### 推荐改动位置

- `src/shared/config.ts`
- `src/shared/config.test.ts`
- `src/main/services/data-store.service.ts`
- `src/renderer/src/types/renderer.types.ts`
- `src/renderer/src/services/settings.ts`
- `src/renderer/src/services/tab-pane-manager.ts`
- `src/renderer/index.html`

#### 数据结构

```ts
type ThemeName = 'dark' | 'light' | 'high-contrast'

interface Config {
  general: {
    defaultShell: string
    defaultCwd: string
    fontSize: number
    fontFamily: string
    lineHeight: number
    theme: ThemeName
    scrollback: number
  }
}
```

#### 功能要求

- 增加 High Contrast 主题。
- 字体族可设置，默认值保持跨平台合理：
  - Windows: `Cascadia Code, Consolas, Microsoft YaHei, monospace`
  - macOS: `Menlo, Monaco, SF Mono, monospace`
- 字体大小保留 8-32 限制。
- 行高建议 1.0-2.0。
- 设置保存后：
  - 主题即时应用到所有终端。
  - 字体大小/字体族/行高尽量即时应用到所有终端，并触发 fit。
  - 如果某项只能对新终端生效，UI 要说明。
- 配置损坏时回退默认值。

#### 验收标准

- 三套主题可切换。
- 字体族、字号、行高重启后保留。
- 已打开终端不出现明显错位。

#### AI 提示词

```text
请实现 P1-5 主题和字体增强。

要求：
- 配置增加 fontFamily、lineHeight、high-contrast 主题
- 更新 shared/config 和 data-store 校验
- 设置页可编辑字体族、字号、行高、主题
- 保存后应用到已有终端并 fit
- 补充配置校验测试
```

### P1-6 智能路径和 URL 识别增强

#### 用户价值

终端输出中的链接、文件路径、错误堆栈可以直接打开。

#### 推荐改动位置

- `src/main/ipc/index.ts`
- `src/preload/preload.ts`
- `src/preload/preload.d.ts`
- `src/renderer/src/services/terminal-links.ts`
- `src/renderer/src/services/tab-pane-manager.ts`
- `src/shared/path-links.ts`
- `src/shared/path-links.test.ts`

#### 功能要求

- URL：
  - 当前 WebLinksAddon 已支持基础 URL，后续要补安全控制。
  - 只允许 `http:`、`https:`、`mailto:` 等安全协议。
- 文件路径：
  - 支持 macOS/Linux 绝对路径：`/Users/a/app/src/main.ts:10:2`
  - 支持 Windows 绝对路径：`C:\Users\a\app\src\main.ts:10`
  - 支持相对路径时，基于 pane 当前 cwd 解析。
  - 支持行列号解析。
  - Ctrl/Command+Click 打开，普通点击不触发本地文件打开。
- 主进程能力：
  - `shell.openPath(filePath)` 打开文件。
  - 可选支持“在编辑器中打开”，先读取环境变量 `EDITOR` 或提供设置项。
  - 打开前校验路径存在，失败返回错误给渲染层。
- 安全：
  - 不允许打开超长路径。
  - 不允许 renderer 直接访问 Node fs。
  - 不把敏感路径写入不必要日志。

#### 验收标准

- 终端输出 `/tmp/a.txt:3` 可 Ctrl/Command+Click 打开。
- Windows 路径可识别。
- URL 仍可打开默认浏览器。
- 不存在路径有提示，不影响终端输出。

#### AI 提示词

```text
请实现 P1-6 智能路径和 URL 识别增强。

要求：
- 新增 path link 解析纯函数和测试
- 支持 macOS/Linux/Windows 路径、相对路径、行列号
- renderer 只通过 preload IPC 请求打开文件
- 主进程校验路径存在后 shell.openPath
- 本地文件必须 Ctrl/Command+Click 才打开
- URL 协议做安全白名单
```

## 4. P2：Workspace 和项目组织

### P2-1 Workspace 数据模型

#### 用户价值

用户可以把一组标签、pane、cwd、shell、启动命令保存成可复用模板。

#### 推荐改动位置

- 新增 `src/shared/workspace.ts`
- 新增 `src/shared/workspace.test.ts`
- `src/main/services/data-store.service.ts`
- `src/preload/preload.ts`
- `src/preload/preload.d.ts`
- `src/renderer/src/types/renderer.types.ts`

#### 数据结构

```ts
interface WorkspaceTemplate {
  version: '1.0'
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  variables?: WorkspaceVariableDefinition[]
  tabs: WorkspaceTabTemplate[]
}

interface WorkspaceTabTemplate {
  id: string
  title: string
  activePaneId?: string
  layout: LayoutStateNode
  panes: WorkspacePaneTemplate[]
}

interface WorkspacePaneTemplate {
  id: string
  title?: string
  shell?: string
  cwd: string
  command?: string
  autoRun: false
}

interface WorkspaceVariableDefinition {
  name: string
  label: string
  defaultValue?: string
  required: boolean
}
```

#### 存储

- `workspaces.json` 存储用户所有模板。
- 模板导入/导出使用 `.terminal-manager-workspace.json`。
- 数据损坏时返回空列表并提示，不要覆盖原文件；可备份为 `.corrupt.<timestamp>.json`。

#### 安全默认

- `command` 可以保存，但 `autoRun` 默认必须是 false。
- 导入模板时如果包含 `autoRun: true`，要降级为 false 或要求用户确认。
- 启动命令展示给用户确认后才能执行。

#### 验收标准

- 可以保存和读取 workspace 模板。
- 损坏数据不会导致应用启动失败。
- command 默认不自动执行。

#### AI 提示词

```text
请实现 P2-1 Workspace 数据模型。

要求：
- 新增 shared/workspace.ts 和测试
- 定义 WorkspaceTemplate、TabTemplate、PaneTemplate
- 数据校验、默认值、损坏数据回退
- 主进程增加 workspaces.json 读写
- preload 暴露 list/create/update/delete workspace 的类型化 API
- command 默认 autoRun false
```

### P2-2 保存当前布局为 Workspace 模板

#### 用户价值

用户把当前调好的开发布局保存下来，后续一键复用。

#### 推荐改动位置

- `src/renderer/src/services/workspace-manager.ts`
- `src/renderer/src/services/tab-pane-manager.ts`
- `src/renderer/src/services/command-registry.ts`
- `src/renderer/index.html`

#### 功能要求

- 命令面板增加“保存当前布局为 Workspace”。
- 弹窗输入：
  - 名称
  - 描述
  - 是否包含 pane 自定义标题
  - 是否为每个 pane 填写启动命令
- 保存内容：
  - 当前所有 tabs 或仅当前 tab，可让用户选择。
  - 每个 pane 的 cwd、shell、title。
  - layout tree 和 sizes。
  - 不保存 sessionId。
  - 不保存终端输出历史。
- 如果当前没有终端，禁止保存并提示。

#### 验收标准

- 保存后 workspace 列表可见。
- 保存出的模板不包含 xterm、DOM、sessionId。
- 模板可导出为 JSON。

#### AI 提示词

```text
请实现 P2-2 保存当前布局为 Workspace 模板。

要求：
- 从当前 tabs/panes/layout 序列化为 WorkspaceTemplate
- 不保存 sessionId、终端输出、DOM、xterm 对象
- 提供 UI 输入名称和描述
- 命令面板增加入口
- 保存后 workspaces.json 可读取
- 补充序列化测试
```

### P2-3 从 Workspace 创建工作区

#### 用户价值

用户选择模板后，自动创建一组标签和 pane，进入对应目录。

#### 推荐改动位置

- `src/renderer/src/services/workspace-manager.ts`
- `src/renderer/src/services/tab-pane-manager.ts`
- `src/renderer/src/services/project-manager.ts`
- `src/renderer/index.html`

#### 功能要求

- 从模板创建新的 tabs 和 panes。
- 支持变量替换：
  - `{{projectPath}}`
  - `{{projectName}}`
  - `{{home}}`
  - 用户自定义变量可后续扩展。
- 如果模板需要 `projectPath`，启动时要求选择项目。
- 对不存在 cwd：
  - 提示用户。
  - 允许跳过该 pane、回退默认 cwd 或重新选择目录。
- `command` 不自动执行：
  - pane 创建后可以显示“运行启动命令”按钮。
  - 用户确认后才把命令写入终端。
- 创建失败时尽量保留已创建成功的 pane，并提示失败项。

#### 验收标准

- 选择模板后创建出对应标签和分屏。
- `{{projectPath}}` 替换正确。
- 带 command 的 pane 不会自动执行。

#### AI 提示词

```text
请实现 P2-3 从 Workspace 创建工作区。

要求：
- 读取 WorkspaceTemplate 创建 tabs/panes/layout
- 支持 {{projectPath}}、{{projectName}}、{{home}} 变量
- command 默认不自动执行，只提供用户确认入口
- cwd 不存在时给出跳过/回退/重新选择
- 创建失败不能导致整个应用白屏
- 补充变量替换和模板启动测试
```

### P2-4 Workspace 管理 UI

#### 用户价值

用户可以维护多个模板，而不是只能通过文件编辑。

#### 推荐改动位置

- 新增 `src/renderer/src/services/workspace-manager.ts`
- 新增 `src/renderer/src/services/workspace-manager.test.ts`
- `src/renderer/index.html`
- `src/renderer/src/store/state.ts`
- `src/renderer/src/services/command-registry.ts`

#### 功能要求

- 侧边栏新增 Workspace 区域或设置页新增 Workspace tab。
- 列表显示：
  - 名称
  - 描述
  - tab 数
  - pane 数
  - 更新时间
- 操作：
  - 启动
  - 重命名
  - 删除
  - 复制
  - 导入
  - 导出
  - 设为项目默认 workspace
- 删除模板不影响当前已经打开的终端。
- 导入模板时展示风险提示，尤其是 command 字段。

#### 验收标准

- 可以管理多个模板。
- 导入导出 JSON 后仍能启动。
- 删除模板不会关闭任何现有 pane。

#### AI 提示词

```text
请实现 P2-4 Workspace 管理 UI。

要求：
- 列出 workspace 模板和 tab/pane 数量
- 支持启动、重命名、删除、复制、导入、导出
- 导入时校验并展示 command 风险提示
- 删除模板不影响当前终端
- 补充管理逻辑测试
```

### P2-5 项目增强：分组、别名、最近项目、默认 Workspace

#### 用户价值

项目多时，用户仍能快速找到和启动正确环境。

#### 推荐改动位置

- `src/shared/project.ts`
- `src/shared/project.test.ts`
- `src/main/services/data-store.service.ts`
- `src/renderer/src/services/project-manager.ts`
- `src/renderer/src/services/quick-open.ts`
- `src/renderer/index.html`

#### 数据结构

```ts
interface Project {
  id: string
  name: string
  path: string
  alias?: string
  group?: string
  defaultWorkspaceId?: string
  lastOpenedAt?: string
  openCount?: number
}
```

#### 功能要求

- 兼容旧项目数据：旧数据没有字段时自动补默认值。
- 项目右键菜单增加：
  - 重命名显示名
  - 设置别名
  - 设置分组
  - 设置默认 Workspace
  - 在 Finder/Explorer 中打开
  - 复制路径
  - 移除项目
- 快速打开搜索 alias、group、path。
- 最近项目根据 `lastOpenedAt` 和 `openCount` 排序。
- 从项目启动时：
  - 如果有默认 Workspace，询问直接启动 Workspace 还是普通终端。
  - 可在设置里配置“项目默认行为”。

#### 验收标准

- 旧 `projects.json` 能正常加载。
- 项目可按分组显示。
- 快速打开能搜索 alias。
- 默认 Workspace 能被项目使用。

#### AI 提示词

```text
请实现 P2-5 项目增强。

要求：
- Project 增加 alias、group、defaultWorkspaceId、lastOpenedAt、openCount
- 旧数据兼容
- 项目 UI 支持编辑名称/别名/分组/默认 Workspace
- 快速打开支持搜索新增字段并按最近使用排序
- 打开项目时更新 lastOpenedAt/openCount
- 补充 project 校验和迁移测试
```

## 5. P3：布局和终端交互增强

### P3-1 pane 标题管理

#### 用户价值

多 pane 时，用户能区分哪个 pane 是 dev server、git、test、logs。

#### 推荐改动位置

- `src/renderer/src/components/tab-chrome.ts`
- `src/renderer/src/services/tab-pane-manager.ts`
- `src/renderer/src/components/terminal-context-menu.ts`
- `src/renderer/index.html`

#### 功能要求

- pane 右键菜单增加“重命名面板”。
- pane 标题优先级：
  1. 用户自定义标题
  2. Shell title 事件
  3. cwd basename
  4. shell name
  5. `终端 N`
- 保存布局和 workspace 时保存自定义标题。
- 支持清除自定义标题，恢复自动标题。

#### 验收标准

- 分屏标签栏显示自定义 pane 标题。
- 重启后标题保留。
- 清除标题后恢复自动标题。

#### AI 提示词

```text
请实现 P3-1 pane 标题管理。

要求：
- pane 右键菜单支持重命名和清除标题
- 标题保存到 layout-state 和 workspace
- 显示优先级为用户标题、Shell title、cwd、shell、默认终端名
- 补充标题选择逻辑测试
```

### P3-2 拖拽布局补充验收和测试

#### 用户价值

现有拖拽能力需要更可靠，避免复杂布局下丢 pane 或布局树损坏。

#### 推荐改动位置

- `src/renderer/src/services/drag-drop.ts`
- `src/renderer/src/services/layout-ops.ts`
- `src/renderer/src/services/layout-ops.test.ts`
- `src/shared/layout-tree.ts`
- `src/shared/layout-tree.test.ts`

#### 功能要求

- 给所有布局变更操作增加布局树校验。
- 同 tab 内 pane 移动：
  - 移动到自身应 no-op。
  - 移动到兄弟 pane 上下左右应保持所有 pane 存在。
- 跨 tab 移动：
  - 源 tab 最后一个 pane 不允许移动到新 tab，除非语义是移动整个 tab。
  - 目标 tab 布局更新后保持有效。
- 拖到 tab bar 新建标签时保持 sessionId 和输出内容。
- 出现异常时回滚到拖拽前布局。

#### 验收标准

- 随机拖拽 20 次后所有 pane 仍可输入。
- 布局保存恢复后 pane 数量一致。
- 测试覆盖复杂嵌套布局移动。

#### AI 提示词

```text
请增强 P3-2 拖拽布局可靠性。

要求：
- 为布局树新增 validateLayout/collectLeafIds 一致性校验
- movePaneToTab/movePaneToNewTab 操作失败时回滚
- 补充同 tab、跨 tab、拖到新 tab、复杂嵌套布局测试
- 不重写拖拽 UI，只增强可靠性和测试
```

### P3-3 终端会话状态和关闭策略

#### 用户价值

关闭正在运行的任务前，用户应该得到更准确的提醒。

#### 推荐改动位置

- `src/main/ipc/index.ts`
- `src/renderer/src/services/tab-close-policy.ts`
- `src/renderer/src/services/tab-pane-manager.ts`
- `src/renderer/src/components/terminal-context-menu.ts`

#### 功能要求

- 主进程维护每个 PTY 的基础状态：
  - createdAt
  - lastInputAt
  - lastOutputAt
  - exited
  - exitCode
- 渲染层关闭 tab/pane 时：
  - 多 pane 必须确认。
  - 最近有输出或未退出进程时确认。
  - 已退出 pane 可以直接关闭。
- UI 显示 exited 状态，可提供“重新启动 pane”。

#### 验收标准

- 关闭正在运行的 pane 有确认。
- 已退出 pane 关闭不打扰。
- 关闭 tab 时提示包含 pane 数量。

#### AI 提示词

```text
请实现 P3-3 终端会话状态和关闭策略增强。

要求：
- 主进程维护 PTY createdAt/lastInputAt/lastOutputAt/exited/exitCode
- preload 暴露查询 session 状态 API
- 关闭 pane/tab 时根据状态决定是否确认
- 已退出 pane 可直接关闭，并支持重新启动
- 补充 close policy 测试
```

### P3-4 命令片段和常用任务

#### 用户价值

用户可以保存常用命令，减少重复输入。此能力适合 AI/开发工作流，但必须避免自动危险执行。

#### 推荐改动位置

- 新增 `src/shared/snippet.ts`
- 新增 `src/shared/snippet.test.ts`
- `src/main/services/data-store.service.ts`
- `src/preload/preload.ts`
- `src/renderer/src/services/command-snippets.ts`
- `src/renderer/src/components/terminal-context-menu.ts`

#### 数据结构

```ts
interface CommandSnippet {
  id: string
  title: string
  command: string
  description?: string
  group?: string
  cwdMode: 'current-pane' | 'project-root' | 'custom'
  customCwd?: string
  confirmBeforeRun: true
}
```

#### 功能要求

- 新增命令片段管理 UI。
- 可从命令面板搜索片段。
- 执行时默认先填入终端，不自动回车。
- 用户可选择“填入”或“确认后运行”。
- 多行命令运行前必须二次确认。

#### 验收标准

- 能保存、编辑、删除命令片段。
- 命令面板能找到片段。
- 默认不会自动执行危险命令。

#### AI 提示词

```text
请实现 P3-4 命令片段。

要求：
- 新增 CommandSnippet 数据模型和 snippets.json
- UI 支持保存/编辑/删除/搜索片段
- 命令面板可执行片段
- 默认只填入当前 pane，不自动回车
- 多行命令和确认运行需要二次确认
- 补充数据校验测试
```

## 6. P4：Shell 集成和通知

### P4-1 OSC 7 cwd 识别

#### 用户价值

当前 pane cwd 可以随着 `cd` 自动变化，项目路径、状态栏、相对路径打开更准确。

#### 推荐改动位置

- `src/main/services/shell-integration.service.ts`
- `src/renderer/src/services/tab-pane-manager.ts`
- `src/renderer/src/store/state.ts`
- `src/shared/config.ts`
- `src/renderer/src/services/settings.ts`

#### 功能要求

- 设置增加 Shell 集成开关，默认关闭或 beta。
- 支持解析 OSC 7：
  - `\x1b]7;file://host/path\x07`
  - `\x1b]7;file://host/path\x1b\\`
- 更新 pane.cwd 和状态栏。
- 不支持时自动降级，不影响终端输出。
- 不自动修改用户 shell profile。

#### 验收标准

- 支持的 shell 中 `cd` 后状态栏 cwd 更新。
- 不支持 OSC 7 的 shell 不报错。
- 可关闭 Shell 集成。

#### AI 提示词

```text
请实现 P4-1 OSC 7 cwd 识别。

要求：
- 增加 Shell 集成设置开关
- 解析 OSC 7 并更新 pane.cwd/status
- 不修改用户 shell profile
- 不支持时自动降级
- 补充 OSC 7 parser 测试
```

### P4-2 OSC 133 命令生命周期识别

#### 用户价值

为后台任务通知、命令块 UI、运行状态提供基础。

#### 功能要求

- 解析命令开始、命令结束、退出码。
- 状态是 best-effort，不承诺 100% 准确。
- 每个 pane 维护：
  - currentCommand
  - commandStartedAt
  - lastCommandFinishedAt
  - lastExitCode
  - isCommandRunning
- TUI 程序、全屏程序、未知序列不应破坏普通输出。

#### AI 提示词

```text
请实现 P4-2 OSC 133 命令生命周期 best-effort 识别。

要求：
- 解析命令开始/结束/退出码
- 每个 pane 维护运行状态
- 设置中标注 beta/best-effort
- 不支持时降级
- 补充 parser 和状态机测试
```

### P4-3 后台任务完成通知

#### 用户价值

长任务完成时，用户不用一直盯着终端。

#### 功能要求

- 依赖 P4-2。
- 设置项：
  - 启用通知
  - 最小时长阈值，默认 10 秒
  - 是否显示命令内容，默认简洁模式
- 触发条件：
  - app 在后台，或 pane/tab 失焦。
  - 命令运行超过阈值。
- 通知内容：
  - workspace/project 名称
  - pane 标题
  - 成功/失败
  - 可选命令摘要
- 点击通知聚焦对应 pane。

#### AI 提示词

```text
请实现 P4-3 后台任务完成通知。

要求：
- 依赖 Shell 集成命令生命周期
- 仅对超过阈值的后台/失焦命令通知
- 设置可关闭，默认简洁内容
- 点击通知聚焦对应 pane
- 不泄露敏感命令，或提供隐藏命令内容选项
```

## 7. P5：远程连接和会话保活

### P5-1 SSH 配置管理

#### 用户价值

用户可以从 UI 管理常用 SSH 连接。

#### 数据结构

```ts
interface SshProfile {
  id: string
  name: string
  host: string
  port: number
  username?: string
  group?: string
  identityFile?: string
  extraArgs?: string[]
}
```

#### 安全要求

- 不明文保存密码。
- 优先使用系统 `ssh`、ssh-agent 和系统密钥。
- 不把用户名、host、key path 以外的敏感内容写入日志。
- extraArgs 要做白名单或明显提示。

#### 功能要求

- SSH 列表、添加、编辑、删除。
- 从 profile 打开 SSH 终端，本质是创建本地 shell 并执行 `ssh ...`，或直接以系统 ssh 为 PTY 命令。
- 连接失败给出错误提示。
- 支持按分组搜索。

#### AI 提示词

```text
请实现 P5-1 SSH 配置管理第一版。

要求：
- 新增 SshProfile 数据模型和 ssh-profiles.json
- UI 支持增删改查和分组搜索
- 使用系统 ssh 打开连接
- 不保存密码，不记录敏感信息
- 连接失败有提示
- 补充数据校验测试
```

### P5-2 tmux / zellij 会话保活

#### 用户价值

应用关闭后任务继续运行，重启后可重新连接。

#### 推荐方案

优先集成现有 multiplexer：

- macOS/Linux：tmux 或 zellij。
- Windows：优先 WSL 内 tmux，Windows 原生先标注限制。

#### 功能要求

- 设置中启用“会话保活实验模式”。
- 检测 tmux/zellij 是否存在。
- 创建 session：
  - workspaceId/tabId/paneId 映射到 multiplexer session/window/pane。
- 应用退出时不 kill 后端 session。
- 应用重启后列出可 reconnect 的 session。
- 未开启时保持当前 PTY 行为。

#### 验收标准

- 开启后运行长命令，关闭应用，命令继续运行。
- 重启后可以重新连接并看到任务状态。
- 关闭实验模式后行为回到普通终端。

#### AI 提示词

```text
请做 P5-2 tmux/zellij 会话保活技术验证。

要求：
- 先检测 tmux 和 zellij 可用性
- 实现一个最小 reconnect 原型
- 应用退出不 kill 后端 session
- 重启后能列出并重新连接
- 未开启实验模式保持现有 PTY 行为
- 输出已知限制到 docs/KNOWN_LIMITATIONS.md
```

## 8. P6：插件、导入导出和同步

### P6-1 配置导入导出和备份

#### 用户价值

用户可以备份、迁移、分享配置。

#### 范围

- 导出：
  - config
  - projects
  - workspaces
  - snippets
  - ssh profiles，但默认不导出敏感路径或需要确认
- 导入：
  - 覆盖
  - 合并
  - 预览差异
- 自动备份：
  - 每次导入前备份当前数据。
  - 数据损坏时保留 corrupt 文件。

#### AI 提示词

```text
请实现 P6-1 配置导入导出和备份。

要求：
- 支持导出 config/projects/workspaces/snippets
- 导入时支持覆盖或合并
- 导入前自动备份当前数据
- 损坏数据不覆盖原文件
- SSH 敏感字段默认不导出或需要确认
```

### P6-2 插件系统技术设计和最小插件

#### 用户价值

后续可以扩展主题、命令和工作流。

#### 先做设计，不直接开放任意代码执行

插件系统风险很高，第一版只建议支持“声明式插件”：

- 主题插件：只提供颜色 JSON。
- 命令插件：只提供命令片段，不执行 JS。
- Workspace 模板插件：只提供模板 JSON。

#### manifest

```json
{
  "id": "example.theme.dark-plus",
  "name": "Dark Plus",
  "version": "1.0.0",
  "type": "theme",
  "permissions": [],
  "entry": "theme.json"
}
```

#### AI 提示词

```text
请为 P6-2 插件系统做技术设计并实现声明式最小插件。

要求：
- 不加载任意远程 JS
- 先支持 theme/snippet/workspace-template 三类声明式插件中的一种
- 设计 manifest、权限、启用/禁用、错误隔离
- 插件错误不能影响终端核心能力
- 输出设计文档到 DevDoc/architecture/plugin-system.md
```

## 9. P7：体验、质量和发布

### P7-1 空状态、错误状态和引导

#### 功能要求

- 首次启动显示可用终端，不用单独 landing page。
- 侧边栏项目为空时提供添加项目按钮。
- Workspace 为空时提供保存当前布局入口。
- 终端创建失败时提供：
  - 检查 shell 路径
  - 选择其他 shell
  - 打开设置
  - 使用默认 shell 重试
- 路径不存在时提供重新选择目录。

#### AI 提示词

```text
请完善 P7-1 空状态和错误状态。

要求：
- 项目、workspace、终端失败、路径不存在都有可操作提示
- 不做营销 landing page
- 错误提示包含下一步动作
- 补充关键 UI 状态测试
```

### P7-2 可访问性和键盘操作

#### 功能要求

- 命令面板、快速打开、设置页、确认弹窗支持键盘完整操作。
- 弹窗打开时 focus trap。
- Esc 关闭顶层弹窗。
- ARIA label 覆盖 icon-only 按钮。
- 高对比主题满足基本可读性。

#### AI 提示词

```text
请完善 P7-2 可访问性和键盘操作。

要求：
- 弹窗 focus trap
- icon-only 按钮补 aria-label/title
- 命令面板和快速打开可纯键盘使用
- 高对比主题文字可读
- 补充可测试的 keyboard/focus 逻辑
```

### P7-3 自动更新和发布检查

#### 功能要求

- 发布前 checklist：
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
  - `npm run package:dir`
  - Windows/macOS smoke test
- 自动更新可后续集成 `electron-updater`。
- 更新日志从 PR 或手写条目维护。
- GitHub Actions 发布产物版本号必须和 `package.json` 一致。

#### AI 提示词

```text
请完善 P7-3 发布检查文档和自动化。

要求：
- 新增 release checklist
- 检查 package.json、README 安装包名称、CHANGELOG 版本一致
- CI 中运行 typecheck/test/build
- package:dir 作为本地 smoke test 指南
- 暂不强制实现 electron-updater，可写设计和后续任务
```

## 10. 总体推荐实施顺序

建议后续按以下顺序推进。这个顺序不是因为复杂度，而是为了让每个后续能力站在稳定基础上：

1. P0-1 启动流程：恢复布局或创建默认终端。
2. P0-2 重新启用布局保存。
3. P0-4 跨平台快捷键规范化。
4. P1-1 命令面板。
5. P1-2 快速打开项目。
6. P1-3 终端内容搜索。
7. P1-4 快捷键查看和冲突提示。
8. P1-5 主题和字体增强。
9. P1-6 智能路径和 URL 识别增强。
10. P2-1 Workspace 数据模型。
11. P2-2 保存当前布局为 Workspace 模板。
12. P2-3 从 Workspace 创建工作区。
13. P2-4 Workspace 管理 UI。
14. P2-5 项目增强。
15. P3-1 pane 标题管理。
16. P3-2 拖拽布局补充验收和测试。
17. P3-3 终端会话状态和关闭策略。
18. P3-4 命令片段和常用任务。
19. P4-1 OSC 7 cwd 识别。
20. P4-2 OSC 133 命令生命周期识别。
21. P4-3 后台任务完成通知。
22. P5-1 SSH 配置管理。
23. P5-2 tmux / zellij 会话保活。
24. P6-1 配置导入导出和备份。
25. P6-2 插件系统技术设计和声明式最小插件。
26. P7-1 空状态、错误状态和引导。
27. P7-2 可访问性和键盘操作。
28. P7-3 自动更新和发布检查。
29. P0-3 文档与真实行为同步应贯穿每个功能完成后。

## 11. 单次 AI 任务通用模板

每次交给 AI 写代码时，可以使用下面模板：

```text
请实现 <任务编号和名称>。

请读取：
- AGENTS.md
- DevDoc/roadmap/ai-implementation-backlog.md 中的 <任务编号>
- 与任务相关的源码文件

要求：
- 严格按该任务范围实现，不顺手做其他大功能
- 遵守现有 Electron 三进程架构
- 主进程 IPC 输入必须校验
- renderer 不能直接使用 Node API
- 新增纯逻辑必须有 Vitest 测试
- 涉及持久化必须兼容旧数据和损坏数据
- 涉及自动执行命令、SSH、插件时必须默认安全
- 完成后运行相关测试；如果可行，运行 npm run typecheck 和 npm run test

完成后请说明：
- 改了哪些文件
- 实现了哪些行为
- 运行了哪些验证
- 还有哪些已知限制
```

## 12. 功能完成定义

一个功能只有同时满足以下条件，才算完成：

- 用户路径可走通。
- 异常路径有提示或回退。
- 数据结构有校验。
- 旧数据兼容。
- 至少有相关测试。
- README/用户指南/已知限制已同步。
- 不破坏多标签、分屏、PTY 生命周期、设置、项目列表。
- 打包版不会因为原生模块、路径或 IPC 改动无法启动。

