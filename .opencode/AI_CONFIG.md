# MODACS OpenCode AI 配置使用指南

> 最后更新: 2026-06-29

## 一、架构总览

MODACS（Modular Automation & Control System）是一个双栈机器人控制平台：
1. **C++/Qt/ROS2 侧（MSRCS）**：基于 C++17/Qt5.15/ROS2 Jazzy 的远程遥控站上位机，构建基础设施已就绪
2. **TypeScript/Node.js 侧（平台）**：规划中的多进程 Web 平台（Hono + React + Drizzle + PostgreSQL），规格见 `docs/` 目录

本指南说明 AI agent 如何与 MODACS 开发环境交互。

```
┌─────────────────────────────────────────────────────────┐
│                    OpenCode TUI                         │
├─────────────────────────────────────────────────────────┤
│  插件层                                                 │
│  ┌──────────┬──────────┬─────────────┐                  │
│  │superpowers│   ACP   │ context-mode│                  │
│  └──────────┴──────────┴─────────────┘                  │
├─────────────────────────────────────────────────────────┤
│  编排层: OMO (oh-my-opencode)                           │
│  ┌─────────┬──────────┬────────┬───────┬─────────────┐  │
│  │Sisyphus │Prometheus│ Oracle │ Metis │   Momus     │  │
│  │ (执行)  │  (规划)  │ (咨询) │(评审)  │  (批判)     │  │
│  ├─────────┼──────────┼────────┼───────┼─────────────┤  │
│  │ Atlas   │Librarian │Explore │Hephaestus│Junior    │  │
│  │ (导航)  │  (搜索)  │(探索)  │ (构建)  │ (轻量执行) │  │
│  └─────────┴──────────┴────────┴───────┴─────────────┘  │
├─────────────────────────────────────────────────────────┤
│  工具层: MCP (qt-docs) + LSP (clangd) + Skills + Commands│
├─────────────────────────────────────────────────────────┤
│  上下文层: 4 memory files + ACP 修剪 + context-mode    │
└─────────────────────────────────────────────────────────┘
```

### 配置层次

| 层次 | 文件 | 内容 |
|---|---|---|
| 系统级 | `~/.config/opencode/opencode.jsonc` | API Key、Provider 定义、模型别名 |
| 项目级 | `.opencode/opencode.json` | 插件、MCP、instructions、主模型 |
| 项目级 | `.opencode/oh-my-openagent.jsonc` | Agent 模型分配、fallback、team mode |
| 项目级 | `.agents/memorys/` | 项目记忆 (status/conventions/decisions/pitfalls) |
| 项目级 | `.agents/rules/` | 编码规则 (security/coding-style) |
| 项目级 | `.agents/skills/` | 技能定义 (cpp-coding-standards, cpp-testing) |
| 项目级 | `.agents/skills/` | Qt 官方技能 (qt-cpp-review, qt-qml, ...) |

### 5 层模型体系

| 层级 | 别名 | 主模型 | 降级 1 | 降级 2 | 上下文 |
|---|---|---|---|---|---|
| **premium-max** | 极致推理 | deepseek-v4-pro-max | kimi-k2.6 | minimax-m3 | 1M |
| **premium** | 主力推理 | deepseek-v4-pro | qwen3.7-max | glm-5.1 | 1M |
| **fast** | 极速执行 | deepseek-v4-flash | qwen3.6-flash | doubao-seed-2.0-lite | 128K |
| **vision** | 视觉专家 | doubao-seed-2.0-pro | qwen3.6-plus | gemini-3.5-flash | 128K |
| **lite** | 轻量兜底 | qwen3-32b | qwen3-8b | — | 40K |

> **注意**: 所有模型通过 New API 网关 (192.168.100.47:3000) 统一接入。别名映射在网关侧配置，项目配置文件引用别名而非具体模型名。

---

## 二、插件系统

MODACS 使用 4 个 OpenCode 插件，按职责分层协作：

```
Layer 0 │ model-fallback    │ 模型降级安全网（自动）
Layer 1 │ superpowers       │ 质量门禁（brainstorming, TDD, debug, verification, code-review, finish-branch）
Layer 2 │ oh-my-opencode    │ Agent 编排（sisyphus, prometheus, oracle, momus, atlas, explore/librarian, categories）
Layer 3 │ openspec          │ Spec 文档编辑（openspec-plan agent，代码只读）
```

### 2.1 superpowers — 工作流纪律层

提供结构化开发技能，确保 AI 遵循工程纪律。

**核心技能**:

| 技能 | 用途 | 触发场景 |
|---|---|---|
| `brainstorming` | 创意工作前必须使用 | 新功能、组件、行为变更 |
| `test-driven-development` | TDD 红-绿-重构循环 | 任何功能实现或 bug 修复 |
| `systematic-debugging` | 系统化调试流程 | 任何 bug、测试失败、异常行为 |
| `requesting-code-review` | 代码审查请求 | 完成任务、实现主要功能、合并前 |
| `verification-before-completion` | 完成前验证 | 声称工作完成/修复/通过时 |
| `dispatching-parallel-agents` | 并行 agent 分派 | 2+ 独立任务可并行时 |

> **重要**: MODACS 中 `writing-plans`、`executing-plans`、`subagent-driven-development` 技能标记为 ⚠️，因为规划统一走 Prometheus agent，执行统一走 Atlas agent，OMO 原生支持 subagent。请勿手动调用这些技能。

### 2.2 ACP — 动态上下文修剪

自动清理过时工具输出，防止上下文膨胀。

**配置** (`.opencode/acp.jsonc` 或默认启用):
```jsonc
{
  "enabled": true,
  "debug": false,
  "pruneNotification": "off",
  "commands": { "enabled": true },
  "strategies": {
    "deduplication": { "enabled": true },
    "purgeErrors": { "enabled": true }
  }
}
```

> **注意**: ACP v1.2.8 的 `pruneNotification` 仅支持 `off`/`minimal`/`detailed`。`compress` 和 `pruneNotificationType` 键在 v1.2.8 中不存在，使用会导致 "ACP: Invalid config" 报错。

**可用命令**:

| 命令 | 功能 |
|---|---|
| `/acp:stats` | 查看修剪统计 |
| `/acp:sweep` | 手动触发修剪 |
| `/acp:compress` | 压缩上下文 |
| `/acp:decompress` | 解压上下文 |

### 2.3 context-mode — 会话连续性

compact/重启后自动恢复工作状态，防止上下文丢失。

**可用命令**:

| 命令 | 功能 |
|---|---|
| `/ctx:stats` | 查看上下文统计 |
| `/ctx:search` | 搜索已索引内容 |
| `/ctx:doctor` | 诊断 context-mode |
| `/ctx:upgrade` | 升级 context-mode |
| `/ctx:purge` | 清除知识库（不可逆） |

### 2.4 oh-my-opencode (OMO) — Agent 编排核心

整个系统的中枢：模型路由、agent 分发、fallback 链、team mode。

通过 `task()` API 和 category 分发系统，自动将任务路由到合适的 agent 和模型层级。

---

## 三、Agent 体系

### 3.1 Agent 角色表

| Agent | 层级 | 角色 | 使用场景 |
|---|---|---|---|
| **Oracle** | premium-max | 只读咨询专家 | 架构设计、调试难题、复杂逻辑 |
| **Sisyphus** | premium | 主力执行器 | 多步骤任务、计划执行 |
| **Prometheus** | premium | 战略规划顾问 | 需求分析、工作规划、访谈 |
| **Hephaestus** | premium | 构建专家 | C++/Qt 代码实现、CMake 构建任务 |
| **Atlas** | premium | 代码导航 | 代码库探索、结构分析 |
| **Librarian** | fast | 信息检索 | 外部文档搜索、Qt 文档查询 |
| **Explore** | fast | 代码探索 | 代码库内搜索、模式发现 |
| **Metis** | fast | 规划评审 | Prometheus 规划前的 gap 分析 |
| **Momus** | fast | 严格批判 | 工作计划的严格审查 |
| **Sisyphus-Junior** | fast | 轻量执行 | 简单任务、单文件修改 |
| **Multimodal-Looker** | vision | 视觉分析 | 图片、PDF、截图分析 |

### 3.2 Category 分发

通过 `task()` 按 category 自动匹配 agent 和模型：

| Category | 模型层 | 适用场景 |
|---|---|---|
| `visual-engineering` | premium | Qt UI/UX、QML 设计、动画 |
| `ultrabrain` | premium | 高难度逻辑推理、复杂算法 |
| `artistry` | fast | 创造性问题解决 |
| `deep` | premium | 深度自主问题解决 |
| `quick` | fast | 简单修改、单文件变更 |
| `unspecified-high` | premium | 高难度通用任务 |
| `unspecified-low` | fast | 低难度通用任务 |
| `writing` | fast | 文档、技术写作 |

### 3.3 Fallback 机制

每个 agent/category 配置 3 级降级链，模型不可用时自动切换：

```
premium → premium-1 (qwen3.7-max) → premium-2 (glm-5.1)
fast    → fast-1 (qwen3.6-flash)  → fast-2 (doubao-seed-2.0-lite)
```

`runtime_fallback` 全局配置：
- 重试错误码: 402, 429, 500, 502, 503, 504
- 最多 2 次重试
- 冷却 60 秒
- 超时 60 秒

> **重要**: MODACS 使用 agent 级别的 `fallback_models` 配置（在 `oh-my-openagent.jsonc` 中逐 agent 指定），同时启用 `runtime_fallback` 作为全局兜底。

---

## 四、团队模式

### 4.1 概述

团队模式通过 `team_*` 工具集实现多 agent 并行协作。Lead 协调任务分配，Members 并行执行独立子任务。

### 4.2 配置

```jsonc
// oh-my-openagent.jsonc
"team_mode": {
  "enabled": true,
  "tmux_visualization": true,
  "max_parallel_members": 4
}
```

### 4.3 使用方式

**创建团队**:
```
"用团队模式分析 X"  → AI 自动创建团队并分派任务
```

**手动创建**:
```
team_create → team_task_create → team_send_message → team_status
```

**团队结构**:
- **Lead**: 协调者（Sisyphus），分配任务、汇总结果
- **Members**: 并行执行独立子任务（按 category 自动匹配 agent）
- 最多 4 个并行成员

### 4.4 完整命令参考

| 命令 | 功能 |
|---|---|
| `team_create` | 创建团队运行 |
| `team_task_create` | 创建团队任务 |
| `team_task_update` | 更新任务状态/所有者 |
| `team_send_message` | 向成员发送消息 |
| `team_status` | 查看团队运行状态 |
| `team_delete` | 删除已完成团队 |
| `team_list` | 列出所有团队 |
| `team_shutdown_request` | 请求关闭成员 |
| `team_approve_shutdown` | 批准关闭请求 |
| `team_reject_shutdown` | 拒绝关闭请求 |

### 4.5 适用场景

| 场景 | 团队配置 |
|---|---|
| 多模块代码调研 | 2-3 个 explore + 1 个 oracle |
| 多文件 C++ 重构 | 按模块分派 member |
| 对比分析 | 每个 member 负责一个方案 |
| Qt 代码审查 | reviewer + security-reviewer + QA |
| 并行搜索 | 多个 librarian/explore 并行搜索 |

### 4.6 注意事项

- 团队任务必须**相互独立**（无共享状态）
- Lead 负责最终汇总，不参与并行执行
- 每个 member 使用自己的 agent session
- tmux 可视化需 tmux 已安装
- 团队完成后用 `team_delete` 清理

---

## 五、命令参考

### 5.1 Superpowers 命令

| 命令 | 功能 |
|---|---|
| `/start-work` | 从 Prometheus 计划启动 Sisyphus 执行 |
| `/review-work` | 启动 5 路并行审查（Oracle×2 + QA + Context Mining） |
| `/refactor` | 智能重构（LSP + AST-grep + 架构分析） |
| `/ralph-loop` | 启动自引用开发循环 |
| `/hyperplan` | 对抗性多 agent 规划（5 个敌对 reviewer） |
| `/handoff` | 创建详细上下文摘要供新会话继续 |

### 5.2 OMO 命令

| 命令 | 功能 | 使用场景 |
|---|---|---|
| `/fallback-status` | 查看模型 fallback 状态 | 排查模型不可用问题 |
| `task(category="...")` | 按 category 分派子 agent | 隔离上下文执行子任务 |
| `task(subagent_type="...")` | 按 agent 类型分派 | 直接指定 explore/librarian |
| `task(run_in_background=true)` | 后台并行执行 | 5+ 独立查询并行 |
| `task(task_id="...")` | 继续已有任务 | 多轮对话同一 agent |

**Category 速查**:

| Category | 模型层 | 用途 |
|---|---|---|
| `quick` | fast | 简单修改、单文件变更 |
| `deep` | premium | 深度自主问题解决 |
| `visual-engineering` | premium | Qt UI/UX、QML 设计 |
| `ultrabrain` | premium | 高难度逻辑推理 |
| `unspecified-high` | premium | 高难度通用任务 |
| `unspecified-low` | fast | 低难度通用任务 |
| `writing` | fast | 文档写作 |
| `artistry` | fast | 创造性问题解决 |

### 5.3 ACP 命令

| 命令 | 功能 |
|---|---|
| `/acp:stats` | 查看修剪统计 |
| `/acp:sweep` | 手动触发修剪 |
| `/acp:compress` | 压缩上下文 |
| `/acp:decompress` | 解压上下文 |

### 5.4 context-mode 命令

| 命令 | 功能 |
|---|---|
| `/ctx:stats` | 查看上下文统计 |
| `/ctx:search` | 搜索已索引内容 |
| `/ctx:doctor` | 诊断 context-mode |
| `/ctx:upgrade` | 升级 context-mode |
| `/ctx:purge` | 清除知识库（不可逆） |

### 5.5 内建命令

| 命令 | 功能 |
|---|---|
| `/playwright` | 浏览器自动化 |
| `/frontend-ui-ux` | 前端 UI/UX 设计 |
| `/git-master` | Git 操作专家 |
| `/debugging` | 系统化调试 |
| `/security-review` | 安全审查 |
| `/remove-ai-slops` | 移除 AI 代码异味 |
| `/visual-qa` | 视觉质量检查 |
| `/team-mode` | 团队模式文档 |

### 5.6 MCP 工具

MODACS 配置的 MCP 服务器：

| 名称 | 端点 | 用途 |
|---|---|---|
| `qt-docs` | `https://qt-docs-mcp.qt.io/mcp` | Qt 官方文档 API 查询（Qt6 文档） |
| LSP (clangd) | 内置 | C++ 代码补全、诊断、导航 |

> **提示**: `qt-docs` MCP 用于查询 Qt API 文档。对于 C++ 代码分析和导航，使用 clangd LSP。

---

## 六、工作流模式

### 6.1 七阶段工作流管道（MODACS 标准流程）

所有变更遵循以下管道：

```
1.EXPLORE → 2.SPECIFY → 3.PLAN → 4.BUILD → 5.VERIFY → 6.ARCHIVE → 7.FINISH
(superpwrs  (openspec)   (OMO)     (OMO)    (superpwrs   (项目约定)  (superpwrs)
 + OMO)                                      + OMO)
```

| # | 阶段 | 触发 | 关键组件 | 产出 |
|---|------|------|----------|------|
| 1 | **Explore** | 需求到达 | brainstorming + explore(×2-5) + librarian | 需求理解、代码调研 |
| 2 | **Specify** | Explore 完成 | openspec-plan agent（代码只读） | spec 文档 |
| 3 | **Plan** | Spec 通过 | prometheus → metis → momus | `.sisyphus/plans/*.md` |
| 4 | **Build** | Plan 确认 | atlas → sisyphus-junior + categories（并行） | 代码变更 |
| 5 | **Verify** | Build 完成 | lsp + build + test + oracle + code-review + verification | 质量门禁通过 |
| 6 | **Archive** | Verify 通过 | 更新 changes/, decisions.md, pitfalls.md, status.md | 变更记录 |
| 7 | **Finish** | Archive 完成 | finishing-a-development-branch → 用户确认提交 | PR/merge |

**简化规则**: 简单 bug 修复（<3 步）可跳过阶段 2-3，直接从 Explore → Build。

### 6.2 新功能开发工作流

```
用户需求
  │
  ▼
[1. EXPLORE] brainstorming → explore(×2-5) + librarian
  │
  ▼
[2. SPECIFY] openspec-plan agent → spec 文档
  │
  ▼
[3. PLAN] Prometheus 访谈 → metis gap 分析 → momus 批判 → plan
  │
  ▼
[4. BUILD] Atlas 导航 → Sisyphus-Junior + categories 并行执行
  │
  ▼
[5. VERIFY] lsp 诊断 → scripts/build.sh 构建 → colcon test → code-review
  │
  ▼
[6. ARCHIVE] changes/ + decisions.md + pitfalls.md + status.md
  │
  ▼
[7. FINISH] finishing-a-development-branch → 用户确认提交
```

### 6.3 Bug 修复工作流

```
Bug 报告
  │
  ▼
systematic-debugging → explore 定位根因
  │
  ▼
quick fix → verify (lsp + build)
  │
  ▼
archive (简化) → finish
```

### 6.4 架构重构工作流

```
重构需求
  │
  ▼
brainstorming → openspec-plan(spec) → prometheus+oracle(plan)
  │
  ▼
cat=deep(build) → 强化 verify → archive(含 ADR) → finish
```

### 6.5 C++ / Qt 开发工作流

```
C++ 功能需求
  │
  ▼
explore 现有代码模式 → brainstorming 设计
  │
  ▼
openspec-plan 编写 spec
  │
  ▼
Prometheus 规划 → 标记并行 wave
  │
  ▼
Atlas 导航 → Sisyphus-Junior 实现:
  ├── .h 头文件（接口设计）
  ├── .cpp 实现（RAII、智能指针）
  └── CMakeLists.txt（ament_cmake）
  │
  ▼
Verify: lsp clangd → scripts/build.sh build → 无诊断错误
  │
  ▼
qt-cpp-review 审查 → archive → finish
```

---

## 七、Qt 技能使用指南

> **范围说明**: 以下 Qt 技能适用于 MODACS 的 C++/Qt 侧（MSRCS 远程遥控站），不适用于规划中的 TypeScript/Node.js 平台侧。

MODACS 安装了 7 个 Qt 官方技能，目录 `.agents/skills/`：

### 7.1 技能总览

| 技能 | 文件名 | 用途 | 触发场景 |
|---|---|---|---|
| `qt-cpp-review` | qt-cpp-review.md | Qt C++ 代码审查 | 提交前审查 Qt 代码 |
| `qt-cpp-docs` | qt-cpp-docs.md | Qt C++ 文档生成 | 为 C++ 源码生成 Markdown 文档 |
| `qt-ui-design` | qt-ui-design.md | Qt UI 设计指导 | 设计或审查 UI 布局 |
| `qt-qml` | qt-qml.md | QML 编码最佳实践 | 编写或修改 QML 代码 |
| `qt-qml-review` | qt-qml-review.md | QML 代码审查 | 提交前审查 QML 代码 |
| `qt-qml-docs` | qt-qml-docs.md | QML 文档生成 | 为 QML 组件生成文档 |
| `qt-qml-profiler` | qt-qml-profiler.md | QML 性能剖析 | 调查 UI 卡顿/帧率问题 |

### 7.2 qt-cpp-review 使用要点

进行 Qt C++ 代码审查时加载此技能。覆盖 60+ 规则和 6 路并行分析：

- **Model/View 契约**: QAbstractItemModel 接口实现完整性
- **所有权管理**: 父对象设置、智能指针使用
- **线程安全**: QObject 跨线程信号槽、QMetaMethod::invoke
- **API 正确性**: Qt 命名规范、参数类型
- **错误处理**: 返回值检查、异常安全
- **性能**: 隐式共享、QString 优化、容器选择

> **提示**: 该技能是只读的，不会修改代码。审查结果覆盖高置信度问题（>80/100）。

### 7.3 qt-ui-design 使用要点

设计 Qt UI 时加载此技能。关注点：

- 排版层次和一致性
- 色彩方案和可访问性（WCAG 对比度）
- 响应式布局和伸缩策略
- 导航模式和信息架构

### 7.4 qt-qml / qt-qml-review 使用要点

当修改 `.qml` 文件时加载 `qt-qml` 技能。当审查 QML 代码时加载 `qt-qml-review` 技能。

覆盖内容：
- 绑定表达式优化（避免不必要的重新求值）
- 布局锚点策略
- 状态和过渡设计
- 重复项和模型委托
- 加载器策略

### 7.5 MCP 集成: qt-docs

`qt-docs` MCP 服务器提供 Qt 官方文档 API 查询。使用方式：

```javascript
// 搜索 Qt API
qt-docs_qt_documentation_search({ query: "QWindow", module: "qtgui" })

// 读取文档页面
qt-docs_qt_documentation_read({ file: "qwindow.html" })
```

> **注意**: qt-docs MCP 当前指向 Qt6 文档，而 MODACS C++ 侧使用 Qt5.15。API 的概念和模式相似，但请留意版本差异。

---

## 八、ROS2 工具链集成

### 8.1 ROS2 Jazzy 环境

MODACS C++/Qt 侧基于 ROS2 Jazzy (Ubuntu 24.04)。关键概念：

- **节点 (Node)**: 各功能模块作为 ROS2 节点运行
- **主题 (Topic)**: 进程间通信通道，用于消息发布/订阅
- **服务 (Service)**: 请求-响应通信
- **参数 (Parameter)**: 运行时配置。通过 `rclcpp::Node::set_parameter` / `get_parameter` 管理
- **QoS 配置**: 根据通信场景选择合适的 QoS 策略（可靠性、持久性等）

### 8.2 通信模式

ROS2 节点通过 DDS 中间件进行进程间通信：

```
┌──────────────────┐         ROS2 DDS          ┌──────────────────┐
│  Node A          │◄────── topics ────────────│  Node B          │
│  (publisher)     │         (pub/sub)         │  (subscriber)    │
└──────────────────┘                            └──────────────────┘
        │                                                │
        ▼                                                ▼
┌──────────────────┐                            ┌──────────────────┐
│  Service Server  │◄────────── services ───────│  Service Client  │
│  (request handler)│                           │  (request caller)│
└──────────────────┘                            └──────────────────┘
```

### 8.3 colcon 构建命令

```bash
# 构建特定包
colcon build --packages-select <pkg>

# 构建包及其依赖
colcon build --packages-up-to <pkg>

# 运行测试
colcon test --packages-select <pkg>
colcon test-result --verbose

# 跳过已构建的包
colcon build --packages-select <pkg> --packages-skip-build-finished
```

> **注意**: AI 代理应使用 `scripts/build.sh` 统一构建入口，禁止直接调用 `colcon build`。参见下方 pixi 环境章节。

### 8.4 ament_cmake 约定

每个 ROS2 包必须有 `package.xml` 和 `CMakeLists.txt`：

```cmake
# CMakeLists.txt (ament_cmake 格式)
cmake_minimum_required(VERSION 3.16)
project(my_package)

# 必须使用 ament 函数
ament_target_dependencies(target_name
  "rclcpp"
  "std_msgs"
)

# 不是 target_link_libraries(... PRIVATE ...)  -- 与 ament 冲突
```

> **教训**: `ament_target_dependencies` 内部使用纯签名，不能与 `target_link_libraries(... PRIVATE ...)` 的关键字签名混用。纯 rosidl 消息包不导出 CMake library target，应通过 `ament_target_dependencies` 消费。

### 8.5 线程安全

ROS2 节点中的跨线程操作：

```cpp
// 正确的跨线程通信：QueuedConnection + qRegisterMetaType
qRegisterMetaType<uint64_t>("uint64_t");
QObject::connect(this, &MyClass::signalData,
                 this, &MyClass::slotOnData,
                 Qt::QueuedConnection);

// 服务调用（避免 spin_until_future_complete 与 spin_once 冲突）
auto future = client->async_send_request(request);
while (rclcpp::ok() && !future.wait_for(100ms) == std::future_status::ready) {
  rclcpp::spin_some(node);
}
```

---

## 九、pixi 环境配置

### 9.1 环境管理

MODACS 使用 pixi（conda-based）管理 C++ 编译器、ROS2 依赖和 Node.js 运行时环境：

```bash
# 首次安装
./bootstrap.sh          # 安装 pixi 0.67.2 + 初始化环境

# 进入环境
source scripts/env-source.sh   # source pixi 环境
scripts/env-shell.sh           # 进入 pixi shell
```

### 9.2 构建入口

所有构建通过 `scripts/build.sh` 统一入口：

```bash
# AI 代理应使用 scripts/build.sh，禁止直接调用 colcon build

bash scripts/build.sh                                         # 完整构建（colcon + Ninja, RelWithDebInfo）
bash scripts/build.sh --debug                                 # Debug 构建
bash scripts/build.sh --packages select <pkg>                 # 指定包
bash scripts/build.sh --clean-cache true                      # 清理 CMake 缓存 + 重建
bash scripts/build.sh --preserve-3rdparty true                # 清理时保留 3rdparty 目录
```

### 9.3 构建流水线

`scripts/` 下脚本按功能前缀分组：

| 脚本 | 用途 |
|---|---|
| `scripts/build.sh` | 纯编译（colcon + Ninja, `--merge-install`, `BUILD_TESTING=OFF`） |
| `scripts/pack.sh` | 环境打包（pixi-pack + npm tar） |
| `scripts/archive.sh` | 发布归档（tar.gz，排除 env/log/data/node_modules） |
| `scripts/install.sh` | 从打包档案安装 |
| `scripts/env-source.sh` | source pixi + ROS2 环境 |
| `scripts/env-shell.sh` | 进入 pixi shell |
| `scripts/env-fastdds.sh` | Fast-DDS + SHM 共享内存环境配置 |
| `scripts/gen-compile-db.sh` | 合并 colcon 编译片段生成 compile_commands.json |

### 9.4 构建加速

MODACS 配置了多重构建加速：

- **ccache**: CMake 自动发现，缓存编译产物
- **并行编译**: `--parallel-workers 6` + CPU 核数自动匹配
- **3rdparty 保留**: `build.sh` 在清理构建时备份/恢复 `3rdparty` 及其他 vendor 目录
- **LSP 集成**: `gen-compile-db.sh` 合并 colcon 构建片段生成 `compile_commands.json`（非 CMake 原生生成）

> **预期效果**: 首次构建 ~2min，增量构建 ~30s。

### 9.5 pixi 常见问题

| 问题 | 解决方案 |
|---|---|
| `could not find pixi.toml` | 使用 `--manifest-path` 参数 |
| pixi 和系统 glib 冲突 | 统一使用 pixi 版本的 glib |
| macOS SDK sysroot 缺失 | 设置 `SDKROOT="$(xcrun --show-sdk-path)"` |
| 运行时 lib 找不到 | 确保 source `activate.sh` + `local_setup.bash` |

---

## 十、记忆系统

### 10.1 文件结构

项目记忆存放在 `.agents/memorys/`，按职责拆分 4 个文件。

OpenCode 已配置自动加载全部 4 个文件（通过 `opencode.json` 的 `instructions` 字段）。

| 文件 | 用途 | 更新时机 |
|---|---|---|
| `status.md` | 项目状态、迭代目标、阻塞项 | 状态变更 |
| `conventions.md` | 编码约定、命名规范、工具链 | 约定变更 |
| `decisions.md` | 关键架构决策 (ADR) | 重大决策后 |
| `pitfalls.md` | 踩坑记录及解决方案 | 遇到并解决问题后 |

### 10.2 更新规则

重要变更后必须更新对应记忆文件：

```
完成阶段 6 (Archive) 时:
  └─ changes/changes-<version>.txt  ← 新增变更条目
  └─ decisions.md                    ← 新 ADR
  └─ pitfalls.md                     ← 新踩坑
  └─ status.md                       ← 状态更新
  └─ conventions.md                   ← 约定变更（如有）
```

### 10.3 文档放置规则

| 文档类型 | 位置 | 受众 |
|---|---|---|
| 项目知识库、工作流指令 | `AGENTS.md` | AI/Agent |
| 项目记忆 | `.agents/memorys/` | AI/Agent |
| 编码规则 | `.agents/rules/` | AI/Agent |
| 技能定义 | `.agents/skills/` | AI/Agent |
| 架构与设计文档 | `docs/` | AI/Agent + 人类用户 |
| 用户参考文档 | `docs/helps/` | 人类用户 |
| 变更日志 | `changes/` | 人类用户 |

> **`docs/` 目录**: 包含 MODACS 平台架构、开发指南、集群设计、产品定义等 11 份文档。详见 `AGENTS.md` WHERE TO LOOK 表。

> **禁令**: 不得在 `docs/helps/` 中创建工作流、AI 指令、Agent 协作类文档。此类文档放 `AGENTS.md` 或 `.agents/`。

---

## 十一、最佳实践

### 11.1 模型选择策略

| 任务类型 | 推荐模型层 | Agent/Category |
|---|---|---|
| 架构设计、复杂调试 | premium-max | Oracle |
| 多步骤实现、计划执行 | premium | Sisyphus, deep |
| 代码搜索、文档查询 | fast | Librarian, Explore, quick |
| 图片/PDF 分析 | vision | Multimodal-Looker |
| 简单修改、单文件 | fast | Sisyphus-Junior, quick |
| Qt C++ 代码审查 | premium | qt-cpp-review skill |
| QML 性能分析 | premium | qt-qml-profiler skill |

### 11.2 上下文管理

1. **ACP 自动修剪** — `pruneNotification: "off"` 静默运行，不干扰输入框
2. **compact 后自动恢复** — context-mode 自动重建状态
3. **用 explore/librarian 代替直接 grep** — 分派后台 agent 并行搜索
4. **分派独立子任务** — 用 `task(run_in_background=true)` 隔离上下文，子 agent 完成后自动清理
5. **手动修剪** — `/acp:sweep` 或 `/acp:compress` 在长会话中主动压缩

### 11.3 并行执行

1. **独立任务用 `task(run_in_background=true)`** — 最多 8 个并行后台任务
2. **团队模式用于多角度分析** — 每个 member 独立研究
3. **Prometheus 计划中标记并行 wave** — 最大化吞吐
4. **硬件要求** — 12 核 CPU 以上可承载高并发

### 11.4 C++ / Qt 开发最佳实践

1. **RAII 优先**: 使用智能指针（`std::unique_ptr`、`std::shared_ptr`）管理资源，避免裸 `new`/`delete`
2. **信号槽安全**: 跨线程通信使用 `Qt::QueuedConnection`，注册自定义类型到 Qt MetaType
3. **CMake 规范**: 使用 `ament_cmake` 格式，每个包独立 `CMakeLists.txt` + `package.xml`
4. **禁止 Q_FOREACH**: 使用 range-based for（定义 `QT_NO_FOREACH`）
5. **禁止 Java 风格迭代器**: 使用 STL 迭代器
6. **禁止 QScopedPointer/QSharedPointer**: 使用 `std::unique_ptr`/`std::shared_ptr`

> **完整规范**: 参见 `AGENTS.md` 中 C++ Anti-Patterns 和 Qt Anti-Patterns 部分。

### 11.5 Git 约定

1. **分支命名**: `feat/`, `fix/`, `chore/` 前缀
2. **提交信息**: Conventional Commits 格式（`feat:` `fix:` `chore:` `docs:`）
3. **归属**: 通过 `~/.claude/settings.json` 全局禁用 AI 归属
4. **禁止**: AI 自动 git commit 或修改 `version.txt`
5. **提交前**: 须征得用户同意

> **项目状态**: MODACS 仓库已初始化但暂无 git commit，所有文件处于未跟踪状态。使用标准 Conventional Commits 格式。

### 11.6 文档编写风格

- 代码交互问答倾向使用中文
- 禁止 AI 自动 git commit
- 提交前须征得用户同意
- changes 格式: 按 `修复`/`优化`/`新增` 分节，每条以 `- [<version>]` 开头

---

## 十二、配置文件速查

| 文件 | 路径 | 用途 |
|---|---|---|
| 项目配置 | `.opencode/opencode.json` | 插件、MCP、instructions、主模型、LSP |
| OMO 配置 | `.opencode/oh-my-openagent.jsonc` | Agent 模型、fallback、team mode |
| 系统配置 | `~/.config/opencode/opencode.jsonc` | API Key、Provider、模型别名 |
| TUI 配置 | `~/.config/opencode/tui.json` | 桌面通知（attention.enabled） |
| 模型层级 | `MODEL_TIERS.md` | 5 层模型映射参考（已创建） |
| 记忆文件 | `.agents/memorys/*.md` | status/conventions/decisions/pitfalls |
| 规则文件 | `.agents/rules/*.md` | 编码风格、安全规则 |
| Qt 技能 | `.agents/skills/qt-*.md` | Qt C++/QML 开发技能 |
| 项目知识库 | `AGENTS.md` | 项目结构、工作流、命令 |
| 构建入口 | `scripts/build.sh` | 统一构建命令（colcon + Ninja） |
| 环境初始化 | `bootstrap.sh` | 一键安装 pixi + 依赖 |
| 变更日志 | `changes/changes-<version>.txt` | 版本变更记录 |
| 版本文件 | `version.txt` | 语义化版本（当前 0.1.1.1） |

---

## 十三、故障排除

### 13.1 常见问题

| 问题 | 解决方案 |
|---|---|
| 模型返回 503 | 自动 fallback 到下一级，无需手动干预 |
| 上下文过长 | `/acp:compress` 或等待 ACP 自动修剪 |
| compact 后丢失状态 | context-mode 自动恢复，检查 `/ctx:stats` |
| LSP clangd 不工作 | 检查 `scripts/gen-compile-db.sh` 是否已运行，`compile_commands.json` 是否存在 |
| 团队模式 member 失败 | Lead 自动重试或降级为直接执行 |
| colcon 构建失败 | 检查 `package.xml` 依赖声明是否完整 |
| CMake 缓存残留 | `bash scripts/build.sh --clean-cache true` |
| 3rdparty 目录被误删 | `bash scripts/build.sh --preserve-3rdparty true --clean-cache true` |
| pixi 环境未加载 | `source scripts/env-source.sh` 加载 ROS2 + pixi 环境 |

### 13.2 MODACS 构建故障

| 问题 | 原因 | 解决 |
|---|---|---|
| `target_link_libraries PRIVATE` 报错 | 关键字签名与 `ament_target_dependencies` 冲突 | 移除 `PRIVATE` 关键字，改用 ament 函数 |
| rosidl 消息包 target 找不到 | 纯 rosidl 包不导出 CMake target | 用 `ament_target_dependencies` 消费 |
| `uint64_t` 在 Qt 信号中失败 | 未注册到 Qt MetaType | 添加 `qRegisterMetaType<uint64_t>("uint64_t")` |
| CMake 列表 `;` 展开异常 | 未加引号保护 | 加双引号：`"-DCMAKE_PREFIX_PATH=${PREFIX}"` |
| macOS OpenSSL 编译缺 string.h | SDKROOT 未设置 | `export SDKROOT="$(xcrun --show-sdk-path)"` |
| pnpm 严格模式传递依赖不可见 | 未显式声明 react/react-dom | 添加到 `dependencies` |
| `BUILD_TESTING` 仍为 ON | CMake 缓存残留 | `bash scripts/build.sh --clean-cache true`（默认 `BUILD_TESTING=OFF`） |
| `compile_commands.json` 缺失 | 未运行 gen-compile-db.sh | 执行 `bash scripts/gen-compile-db.sh` |
| 3rdparty 目录在 clean build 后丢失 | `build.sh` 清理时未保留 | 使用 `--preserve-3rdparty true` 参数 |

### 13.3 Fallback 状态检查

```bash
# 检查模型 fallback 状态
/fallback-status

# 查看当前使用的模型
/ctx:stats
```

### 13.4 LSP / clangd 诊断

```bash
# 检查 LSP 是否工作
# 观察 OpenCode TUI 错误面板

# 手动生成 compile_commands.json
./scripts/gen-compile-db.sh

# 验证 compile_commands.json 存在
ls -la compile_commands.json
```

### 13.5 构建日志分析

```bash
# 构建日志在 build/ 目录
# 每包日志: build/<pkg>/log.log

# colcon 详细日志
colcon build --event-handlers console_direct+ --packages-select <pkg>

# 查看 ccache 命中率
ccache --show-stats
```

---

## 十四、快速上手

```bash
# 1. 启动 OpenCode
opencode

# 2. 日常开发
"帮我实现 X 功能"                              # → Prometheus 规划 → Sisyphus 执行
/start-work                                    # 从计划开始执行
/review-work                                   # 审查已完成工作

# 3. C++ / Qt 开发
"分析这段 Qt 代码"                             # → Oracle 分析
task(category="quick", subagent_type="explore"  # 并行探索 Qt 代码模式
  run_in_background=true, prompt="查找...")

# 4. 构建验证
"构建项目"                                     # → 使用 scripts/build.sh
"运行包测试"                                    # → colcon test

# 5. 上下文管理
/acp:stats                                     # 查看修剪统计
/acp:compress                                  # 手动压缩
/ctx:stats                                     # 查看上下文统计

# 6. 团队模式
"用团队模式分析 A、B、C 三个方案"               # 自动创建团队并行分析

# 7. Qt API 查询
"查一下 QWindow::fromWinId 的用法"             # → qt-docs MCP

# 8. 查看项目记忆
"查看项目当前状态"                              # → .agents/memorys/status.md
"项目有哪些踩坑记录"                            # → .agents/memorys/pitfalls.md
```
