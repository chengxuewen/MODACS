# 关键架构决策 (ADR)

**最后更新**: 2026-06-29

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

## ADR-003: AI_CONFIG.md 从 MSRCS 适配为 MODACS

**日期**: 2026-06-29
**状态**: 已决策

**背景**: `.opencode/AI_CONFIG.md` 和 `MODEL_TIERS.md` 原为 MSRCS 项目编写，包含大量 MSRCS 特定内容（ROS2 节点名、QExt/OpenCTK vendor、Change-Id/Gerrit、make.sh、opencode.sh、CodeGraph MCP）。

**决策**: 全面重写 AI_CONFIG.md（965→899 行）：
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
