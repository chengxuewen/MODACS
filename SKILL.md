# Skills

本项目通过 **superpowers 插件** 和 **项目专属技能** 两层提供 AI 辅助能力。

## 关系说明

- **Rules** (`.agents/rules/`) — 定义标准、约定和检查清单，告诉 AI *做什么*
- **Skills** (`.agents/skills/`) — 提供深入、可操作的参考材料，告诉 AI *怎么做*

Rules 中通过 `See skill: <name>` 引用 Skills，形成 "规则约束 → 技能实现" 的层级。

> 📖 完整工作流见 [AGENTS.md](../AGENTS.md) 的 PLUGIN WORKFLOW 章节。

## Superpowers 技能

通过 `.opencode/opencode.json` 加载，来自 `superpowers@git+https://github.com/obra/superpowers.git`。

> ⚠️ **与 OMO 职责分离**: superpowers 负责质量门禁，OMO 负责编排执行。标记为「OMO 替代」的 skill 应避免使用，统一走 OMO 对应能力。

| 技能 | 用途 | 状态 | 说明 |
|------|------|------|------|
| `brainstorming` | 需求探讨与设计方案 | ✅ 启用 | OMO 无对应能力 |
| `systematic-debugging` | 系统性调试 | ✅ 启用 | OMO 无专职调试 agent |
| `test-driven-development` | TDD 工作流 | ✅ 启用 | 补充项目 `cpp-testing` skill |
| `verification-before-completion` | 完成前验证 | ✅ 启用 | 阶段 5 最终确认 |
| `requesting-code-review` | 发起代码审查 | ✅ 启用 | 代码审查流程 |
| `receiving-code-review` | 处理审查反馈 | ✅ 启用 | 处理审查反馈 |
| `finishing-a-development-branch` | 完成开发分支 | ✅ 启用 | 阶段 7 收尾 |
| `using-git-worktrees` | Git Worktree 隔离 | ✅ 启用 | 大规模 feature 隔离 |
| `dispatching-parallel-agents` | 调度并行代理 | ✅ 启用 | 与 OMO 互补 |
| `writing-skills` | 编写新技能 | ✅ 启用 | — |
| `writing-plans` | 编写实施计划 | ⚠️ OMO 替代 | 规划统一走 prometheus |
| `executing-plans` | 执行实施计划 | ⚠️ OMO 替代 | 执行统一走 atlas |
| `subagent-driven-development` | 子代理驱动开发 | ⚠️ OMO 替代 | OMO 原生支持 |

## 项目专属技能

位于 `.agents/skills/`，为 C++ 项目提供语言特定的深度参考：

| 技能 | 文件 | 内容 |
|------|------|------|
| `cpp-coding-standards` | `cpp-coding-standards.md` | 现代 C++ 编码规范、RAII、命名、格式化、安全性、性能优化 |
| `cpp-testing` | `cpp-testing.md` | GoogleTest/GMock 测试模式、TDD 工作流、覆盖率与 Sanitizer 集成 |

## 代理（Agents）

位于 `~/.claude/agents/`，可在工作中按需调用：

| 代理 | 用途 |
|------|------|
| `planner` | 复杂功能实现规划 |
| `architect` | 系统架构决策 |
| `tdd-guide` | 测试驱动开发指导 |
| `code-reviewer` | 代码审查 |
| `security-reviewer` | 安全分析 |
| `build-error-resolver` | 构建错误修复 |

## 使用方式

AI 助手会自动匹配适用的技能并加载。也可在对话中指定：

```
使用 cpp-testing 技能帮我编写设备连接测试
```

## 添加新技能

1. 在 `.agents/skills/` 下创建 `<name>.md`
2. 在本文档的「项目专属技能」表格中添加条目
3. 在对应的规则文件中添加 `See skill: <name>` 引用
