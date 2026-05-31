# Contributing Guide | 贡献指南

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

欢迎为 Terminal Manager 做出贡献！以下是参与项目的方式。

## 报告问题

1. 在 [Issues](https://github.com/Echo0355/terminal-manager/issues) 页面搜索是否已有相同问题
2. 如果没有，创建新 Issue 并包含：
   - 清晰的问题标题和描述
   - 复现步骤
   - 预期行为与实际行为
   - 系统信息（操作系统、Node.js 版本、npm 版本）
   - 相关日志或截图

## 提交 Pull Request

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature-name`
3. 提交更改：`git commit -m 'feat: 添加某功能'`
4. 推送分支：`git push origin feature/your-feature-name`
5. 创建 Pull Request

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

| 前缀 | 用途 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | 修复 bug |
| `docs:` | 文档更新 |
| `style:` | 代码格式调整（不影响功能） |
| `refactor:` | 重构 |
| `test:` | 测试相关 |
| `chore:` | 构建/工具链更新 |

## 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/Echo0355/terminal-manager.git
cd terminal-manager

# 安装依赖
npm install

# 启动开发模式
npm run dev

# 运行测试
npm run test

# 类型检查
npm run typecheck
```

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

## 代码审查

- 所有 PR 需要通过 CI 检查
- 共享模块（`src/shared/`）的更改必须包含测试
- 保持代码注释为中文
- 遵循现有代码风格

## 行为准则

参与本项目即表示您同意遵守以下准则：

- 尊重所有参与者
- 接受建设性批评
- 专注于对社区最有利的事情
- 对他人表示同理心
