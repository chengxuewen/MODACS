# 项目状态

**最后更新**: 2026-07-01

## 当前阶段

开发阶段（Development） — TypeScript 平台 Slice 1 MVP + Debug 模块已完成，C++/ROS2 源代码待开始。

## 已完成

### 基础设施
- ✅ 11 个 shell 脚本（build, env, pixi, pack, deploy, archive, gen-compile-db 等）
- ✅ `bootstrap.sh` 一键环境搭建（pixi 0.67.2 + Gitee 镜像）
- ✅ `turbo.json` Turborepo 配置（JS monorepo 计划）
- ✅ `version.txt` → 0.1.1.1
- ✅ `changes/changes-0.1.1.txt` 变更日志

### AI 工具链
- ✅ `.agents/rules/` 编码规则（common + cpp + typescript + zh 中文翻译）
- ✅ `.agents/skills/` 技能定义（cpp-coding-standards, cpp-testing, qt-cpp-review, qt-qml, qt-qml-review, qt-qml-docs, qt-qml-profiler, qt-ui-design, qt-cpp-docs, openspec-*）
- ✅ `.opencode/opencode.json` OpenCode 配置
- ✅ `.opencode/agent-guide.md` AI 配置指南（已从 MSRCS 适配为 MODACS 双栈）
- ✅ `.opencode/agent-model-tiers.md` 模型分层体系
- ✅ `AGENTS.md` 项目知识库（296 行）
- ✅ `SKILL.md` 技能注册表

### 文档体系（docs/ 目录，11 份，共 10,860 行）
- ✅ 从 InfoSYS 笔记同步到 `docs/`，Obsidian wikilinks 转为标准 markdown 相对链接
- ✅ YAML frontmatter 已移除
- ✅ 文件名全部英文（MES开发方案.md → MES-Development-Plan.md）
- ✅ 文档清单：
  - MODACS-Overview.md (469 行) — 项目总览
  - MODACS-Platform.md (1740 行) — 平台架构
  - MODACS-Platform-Dev.md (3848 行) — 开发指南 + 代码模板
  - MODACS-Platform-Ref.md (1282 行) — 开源对比
  - MODACS-Cluster.md (698 行) — 集群架构
  - MODACS-AI-Dev.md (776 行) — AI 编码规则
  - MODACS-Vision.md (536 行) — 视频监控产品
  - MODACS-Link.md (558 行) — 中间件抽象层
  - MODACS-Act.md (88 行) — 执行层产品
  - MODACS-Naming.md (366 行) — 命名白皮书
  - MES-Development-Plan.md (499 行) — MES 开发计划

### 记忆系统
- ✅ `.agents/memorys/` 目录创建
- ✅ 4 个记忆文件初始化（status, conventions, decisions, pitfalls）

## 未开始

- ❌ `src/` 目录 — C++/ROS2 源代码
- ❌ `pixi.toml` — pixi 环境配置文件
- ❌ Docker / docker-compose.yml
- ❌ CI/CD（.github/workflows/ 或 GitLab CI）
- ✅ Git commits（43 次提交，Conventional Commits 格式）

## 已就位（2026-06-30 更新）

- ✅ TypeScript 平台代码已存在（43 个 .ts/.tsx 文件：packages/core/, apps/server/, apps/base/, apps/debug/）
- ✅ Debug 模块已完成（apps/debug/，React SPA，7 页面 + stores + components + lib，已通过 QA）
- ✅ TypeScript LSP 已配置（typescript-language-server v5.3.0）
- ✅ C++ 工具链配置已创建（.clangd / .clang-format / .clang-tidy）
- ✅ CodeGraph MCP 已配置并初始化（@colbymchenry/codegraph v1.1.4, 16文件/380节点/850边）
- ✅ CodeGraph MCP 启动脚本（`.opencode/init-mcp-codegraph.mjs`，跨平台 Node.js 脚本）
- ✅ LSP 全套配置（7 个语言服务器：clangd, typescript-language-server, pyright, bash-language-server, rust-analyzer, html-language-server, remark-language-server）
- ✅ LSP 启动包装脚本（`.opencode/init-lsp-wrap.mjs`，首次使用自动安装 LSP 再启动）
- ✅ C++ 工具链配置文件（`.clangd` + `.clang-format` + `.clang-tidy`）
- ✅ AI 工具使用优先级规则（AGENTS.md 中新增章节：codegraph > lsp > ast_grep > grep）
- ✅ ADR-006 架构决策记录（AI 代码智能工具链配置）

## 阻塞项

无当前阻塞项。

## 迭代目标

1. 创建 `pixi.toml` 使 `bootstrap.sh` 可运行
2. 搭建 `src/` 目录结构和第一个 ROS2 包
3. ✅ TypeScript 平台 Slice 1 已完成 — Debug 模块 QA 通过
4. 创建 `pixi.toml` 使 `bootstrap.sh` 可运行
5. 搭建 `src/` 目录结构和第一个 ROS2 包
6. Slice 2 开发（测试框架 + PostgreSQL + Drizzle）
