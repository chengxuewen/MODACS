# 关键架构决策 (ADR)

**最后更新**: 2026-07-01

## ADR-001: 双栈架构 — MSRCS + MODACS

**日期**: 2026-06-29
**状态**: 已决策

**背景**: 项目需要同时维护现有的 C++/Qt/ROS2 远程遥控站（MSRCS）和规划中的 TypeScript/Node.js 多进程 Web 平台（MODACS）。

**决策**: 两个技术栈在同一仓库共存。`.agents/` 规则和技能覆盖两个栈。构建脚本针对 C++/ROS2（colcon/pixi/Ninja），`turbo.json` 针对 JS monorepo。

**理由**: 共享 AI 工具链和项目记忆，避免分散管理。两个栈面向不同场景（MSRCS = 上位机，MODACS = Web 平台）。

---

## ADR-002: 文档从 InfoSYS 笔记同步到仓库

**日期**: 2026-06-29
**状态**: 已决策

**背景**: 11 份架构设计文档原存于 Obsidian 笔记库（`~/Nutstore/Notebooks/文档笔记/项目开发/个人项目/InfoSYS/`），仓库内仅有 1 份（MODACS-AI-Dev.md）。

**决策**: 将全部 11 份文档同步到 `docs/` 目录，进行以下转换：
1. Obsidian `[[wikilinks]]` → 标准 markdown 相对链接 `[text](./file.md)`
2. 移除 YAML frontmatter（tags 数组等 Obsidian 特有元数据）
3. 非英文文件名英文化（`MES开发方案.md` → `MES-Development-Plan.md`）
4. 修复外部笔记引用（`嵌入式学习路线` 标记为外部笔记）

**理由**: 仓库文档应自包含、可在 GitHub/标准 markdown 渲染器中正确显示。Obsidian 笔记库作为编辑源，仓库作为权威副本。

---

## ADR-003: agent-guide.md 从 MSRCS 适配为 MODACS

**日期**: 2026-06-29
**状态**: 已决策

**背景**: `.opencode/agent-guide.md` 和 `agent-model-tiers.md` 原为 MSRCS 项目编写，包含大量 MSRCS 特定内容（ROS2 节点名、QExt/OpenCTK vendor、Change-Id/Gerrit、make.sh、opencode.sh、CodeGraph MCP）。

**决策**: 全面重写 agent-guide.md（965→899 行）：
- 标题和概述改为 MODACS 双栈描述
- `make.sh` → `scripts/build.sh`（MODACS 实际构建入口）
- 移除 CodeGraph MCP（未配置）
- 移除 opencode.sh（不存在）
- 移除 Change-Id/Gerrit 规范（MODACS 用 Conventional Commits）
- 移除 QExt/OpenCTK vendor 引用（MSRCS 特有）
- ROS2 章节泛化（移除特定节点名和通信图）
- MSRCS 特定 bug 表替换为通用构建故障
- 保留通用 AI 工具链内容（插件、agents、team mode、工作流、记忆系统）
- 保留 2 处 "MSRCS" 引用用于区分双栈身份

**理由**: AI 配置文档应反映当前项目实际配置，而非原项目遗留内容。

---

## ADR-004: pixi 作为统一包管理器

**日期**: 项目初始
**状态**: 已决策

**背景**: 项目需要同时管理 C++ 编译器、ROS2 依赖和 Node.js 运行时。

**决策**: 使用 pixi（conda-based）统一管理所有环境。从 Gitee 镜像安装（`gitee.com/chengxuewen-github/pixi`）。通过 pixi-pack 打包为独立 shell 脚本用于离线部署。

**理由**: 单一包管理器简化环境配置，pixi-pack 支持离线部署适合工业场景。Gitee 镜像解决中国网络访问问题。

---

## ADR-005: 基础设施优先（Infrastructure-First）

**日期**: 项目初始
**状态**: 已决策

**背景**: 仓库在编写任何源代码前先提交所有脚手架（脚本、AI 规则、文档）。

**决策**: 所有构建脚本、AI 规则（`.agents/`）、设计文档（`docs/`）在源代码前就位。`src/` 目录预期但尚未创建。

**理由**: 确保开发环境和 AI 工具链在编码开始前完全就绪。AI 规则作为一等项目文件版本管理。


---

## ADR-006: AI 代码智能工具链配置（LSP + CodeGraph + AST + 代理编排）

**日期**: 2026-06-30
**状态**: 已决策

**背景**: 为 OpenCode AI 助手提供结构化代码视图，需要从 LSP、代码图谱、AST 搜索、代理编排四个层面配置工具链。经调研对比 CodeGraph、Serena、Gortex、GitNexus、ChunkHound 等方案后，评估当前项目状态（43 文件，含 Debug 模块，开发阶段）。

**决策**: 采用三层已就位方案，暂不引入额外工具：

1. **LSP 层**：配置 7 个语言服务器（clangd/typescript-language-server/pyright/bash-language-server/rust-analyzer/html-language-server/remark-language-server），提供 `lsp_diagnostics`/`lsp_goto_definition`/`lsp_find_references`/`lsp_rename`/`lsp_symbols` 工具（来自 oh-my-opencode 插件）。`.opencode/init-lsp-wrap.mjs` 提供首次自动安装 + 启动包装。
2. **代码图谱层**：使用 `@colbymchenry/codegraph` v1.1.4 MCP（已配置并初始化，43+ 文件（含 apps/debug/），节点/边数已增长）。单一工具 `codegraph_explore` 返回源码 + 调用链 + 影响范围。零外部依赖，SQLite 存储。
3. **AST 搜索层**：`ast_grep_search` + `ast_grep_replace`（来自 oh-my-opencode 插件，已就位）。
4. **代理编排层**：oh-my-opencode 插件提供 explore/oracle/librarian/metis/momus 等专业代理（已就位）。

**替代方案评估**:
- **Serena**（24K stars, LSP 驱动, MIT）：源代码到位后评估切换，与项目已有 clangd 配置契合
- **Gortex**（687 stars, 混合 BM25+向量+图, Apache 2.0）：代码量超过 ~500 文件时评估，最全能单方案
- **codegraph-ai**（GitHub, 45 工具, Apache 2.0）：比 @colbymchenry/codegraph 功能更全，但当前阶段无需切换
- **GitNexus**（42K stars, PolyForm Noncommercial）：许可证限制，排除
- **Sourcegraph**（企业 SaaS）：成本过高，排除

**后续行动**:
- ~~TypeScript 源代码到位时：在 `opencode.json` 的 `lsp` 中添加 `typescript-language-server`~~（✅ 已于 2026-06-30 完成）
- C++ 源代码到位时：确保 `compile_commands.json` 已生成（`scripts/gen-compile-db.sh`），clangd 自动生效
- 代码量超过 ~500 文件时：评估 codegraph 是否仍够用，考虑切换到 Serena 或 Gortex

**理由**: 项目已进入开发阶段，四层能力已全部就位且零额外成本。避免过早引入复杂工具增加配置维护负担。等源代码规模增长后再按需升级。