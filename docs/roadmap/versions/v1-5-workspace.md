# v1.5 工作区能力

## 1. 版本目标

v1.5 的目标是把 Terminal Manager 从“多终端工具”提升为“开发工作区管理器”。

v1.0 解决日常操作效率，v1.5 解决常用开发环境的一键恢复、布局组织、项目分组和工作区复用。

## 2. 版本原则

- 工作区是对已有标签、pane、项目和布局能力的组织，不是新的会话虚拟机。
- 不恢复运行中的进程。
- 不默认自动执行命令，除非用户对某个 workspace 显式确认。
- 不引入 SSH、插件、Shell 集成等 v2.0 能力。

## 3. 功能范围

### 3.1 Workspace 模板

功能：

- 保存当前布局为 workspace 模板。
- 从 workspace 模板创建标签和 pane。
- 模板包含：
  - 名称
  - 描述
  - tabs
  - panes
  - layout
  - shell
  - cwd
  - 可选启动命令，但默认不自动执行

示例：

```yaml
name: Frontend Dev
description: Frontend project layout
tabs:
  - title: App
    layout:
      type: container
      direction: horizontal
      sizes: [60, 40]
      children:
        - type: leaf
          paneId: editor-terminal
        - type: container
          direction: vertical
          sizes: [50, 50]
          children:
            - type: leaf
              paneId: dev-server
            - type: leaf
              paneId: git
    panes:
      - id: editor-terminal
        cwd: "{{projectPath}}"
        shell: default
      - id: dev-server
        cwd: "{{projectPath}}"
        shell: default
        command: "npm run dev"
        autoRun: false
      - id: git
        cwd: "{{projectPath}}"
        shell: default
```

验收：

- 能保存当前布局为模板。
- 能从模板创建工作区。
- 带 command 的 pane 不会默认自动执行。

### 3.2 工作区管理 UI

功能：

- 列出 workspace 模板。
- 新建、重命名、删除模板。
- 从模板启动。
- 导入/导出模板。
- 显示模板中包含几个标签和 pane。

验收：

- 用户可以管理多个模板。
- 删除模板不影响当前已打开终端。

### 3.3 项目增强

功能：

- 项目分组。
- 最近项目。
- 项目搜索。
- 项目别名。
- 项目默认 workspace。

验收：

- 项目很多时仍能快速找到。
- 从项目可以选择默认 workspace 启动。

### 3.4 分割线拖拽调整

功能：

- 支持拖拽分割线调整 pane 比例。
- 调整后保存到布局状态。
- 支持最小尺寸限制。

验收：

- 拖拽后 pane 尺寸变化。
- 重启后比例恢复。
- xterm.js resize 正常。

### 3.5 面板拖拽重排

功能：

- 拖拽 pane 到布局树中其他位置。
- 移动后保持对应 PTY 会话。
- 更新布局树。

验收：

- 拖拽后终端内容不丢失。
- 布局树有效。
- 重启后位置恢复。

### 3.6 面板标题追踪增强

功能：

- 优先使用终端标题事件。
- 支持用户自定义 pane 标题。
- fallback 到 cwd 或 shell 名称。

验收：

- pane 标题更容易区分。
- 用户自定义标题重启后保留。

## 4. 不做内容

v1.5 明确不做：

- Shell 集成驱动的可靠命令完成识别。
- 后台任务通知。
- SSH 管理。
- 插件系统。
- 输入广播。
- 终端录制。
- 命令块 UI。
- 真正会话保活。
- 远程协作。

## 5. 推荐实施顺序

1. Workspace 数据模型。
2. 保存当前布局为模板。
3. 从模板创建工作区。
4. Workspace 管理 UI。
5. 项目分组、搜索、最近项目。
6. 项目默认 workspace。
7. 分割线拖拽调整。
8. 面板标题追踪增强。
9. 面板拖拽重排。
10. v1.5 回归测试和打包验证。

面板拖拽重排复杂度较高，可以放到 v1.5 后半段。

## 6. 测试要求

- Workspace 模板序列化/反序列化测试。
- 从模板创建布局测试。
- command 默认不执行测试。
- 项目分组和搜索测试。
- 分割比例保存和恢复测试。
- 布局树拖拽重排测试。
- 回归测试 v1.0 命令面板、快速打开、终端搜索。

## 7. 验收标准

v1.5 完成时应满足：

- 可以保存当前布局为 workspace。
- 可以从 workspace 恢复多个标签和 pane。
- command 默认不自动执行。
- 可以管理多个 workspace。
- 项目支持搜索、分组、最近项目。
- 可以拖拽分割线调整大小。
- pane 标题更清晰。
- MVP 和 v1.0 能力不退化。

## 8. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| workspace 自动执行命令带来风险 | 误启动服务或危险命令 | 默认不执行，必须用户显式确认。 |
| 模板变量设计过复杂 | 实现拖慢 | v1.5 只支持 `{{projectPath}}` 等少量变量。 |
| 拖拽重排破坏布局树 | 布局恢复失败 | 先写布局树测试，再做 UI 拖拽。 |
| 分割线拖拽导致终端 resize 异常 | UI 错乱 | 拖拽结束后统一 fit 和 resize。 |

## 9. 总 AI 提示词

```text
请开始 v1.5 工作区能力开发。

请读取：
- docs/product/mvp-spec.md
- docs/roadmap/post-mvp-roadmap.md
- docs/roadmap/versions/v1-core-experience.md
- docs/roadmap/versions/v1-5-workspace.md
- docs/architecture/design.md 作为参考

要求：
- 在 MVP 和 v1.0 已稳定的基础上开发
- 不重写终端、标签、pane 基础架构
- 实现 workspace 模板、工作区管理、项目增强、布局拖拽相关能力
- command 默认不自动执行
- 每个子功能完成后运行测试和类型检查
- 不实现 v2.0 功能

请先实现 v1.5 的第一个子功能：Workspace 数据模型和模板保存。
完成后说明改了哪些文件。
```

## 10. 分功能 AI 提示词

### Workspace 数据模型和保存

```text
请实现 v1.5 Workspace 数据模型和“保存当前布局为模板”。

读取 docs/roadmap/versions/v1-5-workspace.md 的 3.1 节。

要求：
- 定义 workspace 模板数据结构
- 支持保存当前 tabs、panes、layout、shell、cwd
- 支持可选 command 字段，但 autoRun 默认 false
- 保存到 workspace 模板文件
- 增加序列化/反序列化测试

不要实现从模板启动，也不要自动执行 command。
```

### 从模板创建工作区

```text
请实现从 Workspace 模板创建工作区。

读取 docs/roadmap/versions/v1-5-workspace.md 的 3.1 节。

要求：
- 读取 workspace 模板
- 创建对应 tabs、panes 和 layout
- 为每个 pane 创建新的 PTY
- cwd 支持 {{projectPath}} 变量
- command 字段默认不执行
- 如果模板引用的路径不存在，要提示并回退

不要实现自动执行命令。
```

### Workspace 管理 UI

```text
请实现 Workspace 管理 UI。

读取 docs/roadmap/versions/v1-5-workspace.md 的 3.2 节。

要求：
- 列出 workspace 模板
- 支持新建、重命名、删除模板
- 支持从模板启动
- 支持导入/导出模板
- 显示模板包含的标签和 pane 数量

不要实现 Shell 集成或后台任务通知。
```

### 项目增强

```text
请实现 v1.5 项目增强。

读取 docs/roadmap/versions/v1-5-workspace.md 的 3.3 节。

要求：
- 支持项目分组
- 支持最近项目
- 支持项目搜索
- 支持项目别名
- 支持给项目设置默认 workspace

保持已有项目数据兼容，必要时做迁移。
```

### 分割线拖拽调整

```text
请实现分割线拖拽调整 pane 大小。

读取 docs/roadmap/versions/v1-5-workspace.md 的 3.4 节，以及 docs/architecture/design.md 的 4.4.4 节。

要求：
- 支持拖拽水平/垂直分割线
- 更新 layout sizes
- 限制最小 pane 尺寸
- 拖拽后 fit xterm 并 resize PTY
- 调整比例保存到布局状态

请先补布局尺寸相关测试，再实现 UI 拖拽。
```

### 面板拖拽重排

```text
请实现面板拖拽重排。

读取 docs/roadmap/versions/v1-5-workspace.md 的 3.5 节。

要求：
- 支持拖拽 pane 到布局树其他位置
- 移动后保持原 PTY 会话和终端内容
- 更新布局树并持久化
- 拖拽结果必须通过布局树有效性校验

不要实现浮动面板。
```

