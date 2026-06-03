# Terminal Manager Post-MVP 路线图

本文档描述 MVP 12 个阶段完成后的后续开发路线。

MVP 完成后，不建议立刻进入高复杂度功能。正确顺序是：

```text
v0.1.x 稳定期 -> v1.0 核心体验增强 -> v1.5 工作区能力 -> v2.0 高级能力
```

## 1. 文档优先级

后续版本开发时，文档优先级如下：

```text
当前版本文档 > docs/product/mvp-spec.md > docs/product/feasibility-analysis.md > docs/architecture/design.md
```

如果冲突：

- 当前版本文档决定本轮做什么。
- `docs/product/mvp-spec.md` 决定不能破坏哪些 MVP 基础能力。
- `docs/architecture/design.md` 只作为长期参考，不代表必须全部实现。

## 2. 版本路线

| 版本 | 文档 | 目标 |
|------|------|------|
| AI 实施任务书 | [`ai-implementation-backlog.md`](./ai-implementation-backlog.md) | 供 vibe coding / AI 编码使用的详细后续任务拆分。 |
| v0.1.x | 本文第 3 节 | 修 bug、稳定性、内测反馈。 |
| v1.0 | [`versions/v1-core-experience.md`](./versions/v1-core-experience.md) | 把 MVP 从“能用”打磨成“日常主力工具”。 |
| v1.5 | [`versions/v1-5-workspace.md`](./versions/v1-5-workspace.md) | 做工作区、模板、项目组织和布局效率。 |
| v2.0 | [`versions/v2-advanced.md`](./versions/v2-advanced.md) | 做 Shell 集成、SSH、插件、会话保活等高级能力。 |

后续如果直接让 AI 写代码，优先使用 [`ai-implementation-backlog.md`](./ai-implementation-backlog.md)。该文档会把每个后续能力拆到推荐文件、数据结构、IPC、UI、验收标准、测试要求和可复制提示词。

## 3. v0.1.x 稳定期

MVP 12 阶段做完后，先进入 v0.1.x 稳定期。

### 目标

真实使用 2-7 天，优先修稳定性问题，不新增大功能。

### 检查项

- 终端是否会卡死。
- 多标签是否稳定。
- 分屏关闭后是否残留进程。
- 布局恢复是否准确。
- 打包版和开发版行为是否一致。
- 配置损坏时是否能恢复。
- 项目路径不存在时是否有提示。
- Windows / macOS 行为差异。
- CPU 和内存占用是否异常。

### AI 提示词

```text
请进入 v0.1.x 稳定期。

请读取：
- docs/product/mvp-spec.md
- docs/roadmap/post-mvp-roadmap.md
- docs/roadmap/release-checklist.md（如果存在）

要求：
- 不新增大功能
- 按 MVP 成功标准和 release checklist 做一轮检查
- 修复发现的 bug、稳定性问题、资源释放问题
- 重点检查多标签、多 pane、布局恢复、配置损坏、打包后 node-pty 加载
- 修复后运行测试、类型检查和可用的构建命令

不要实现 v1.0/v1.5/v2.0 功能。

完成后总结修复了哪些问题，还有哪些风险。
```

## 4. 后续推进原则

- v1.0 之前不做插件、SSH、远程协作、命令块 UI、真正会话保活。
- v1.5 之前不做 Shell 集成驱动的可靠命令完成通知。
- v2.0 之前不承诺恢复正在运行的进程。
- 每个版本都应该拆成多个小 PR 或小阶段做。
- 每加一个功能，都要保护 MVP 的基础能力不退化。

## 5. 完整顺序建议

```text
1. MVP 12 阶段完成
2. v0.1.x 稳定期
3. v1.0 核心体验增强
4. v1.0.x 修复和小体验优化
5. v1.5 工作区能力
6. v1.5.x 修复和内测
7. v2.0 高级能力评估
8. v2.0 分模块开发
```
