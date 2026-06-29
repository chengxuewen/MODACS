# 项目状态

**最后更新**: 2026-06-29

## 当前阶段

脚手架阶段（Scaffold） — 构建基础设施和文档已就位，无应用源代码。

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
- ✅ `.opencode/AI_CONFIG.md` AI 配置指南（已从 MSRCS 适配为 MODACS 双栈）
- ✅ `.opencode/MODEL_TIERS.md` 模型分层体系
- ✅ `AGENTS.md` 项目知识库（257 行）
- ✅ `SKILL.md` 技能注册表

### 文档体系（docs/ 目录，11 份，共 10,737 行）
- ✅ 从 InfoSYS 笔记同步到 `docs/`，Obsidian wikilinks 转为标准 markdown 相对链接
- ✅ YAML frontmatter 已移除
- ✅ 文件名全部英文（MES开发方案.md → MES-Development-Plan.md）
- ✅ 文档清单：
  - MODACS-Overview.md (452 行) — 项目总览
  - MODACS-Platform.md (1741 行) — 平台架构
  - MODACS-Platform-Dev.md (3849 行) — 开发指南 + 代码模板
  - MODACS-Platform-Ref.md (1283 行) — 开源对比
  - MODACS-Cluster.md (699 行) — 集群架构
  - MODACS-AI-Dev.md (777 行) — AI 编码规则
  - MODACS-Vision.md (537 行) — 视频监控产品
  - MODACS-Link.md (559 行) — 中间件抽象层
  - MODACS-Act.md (89 行) — 执行层产品
  - MODACS-Naming.md (251 行) — 命名白皮书
  - MES-Development-Plan.md (500 行) — MES 开发计划

### 记忆系统
- ✅ `.agents/memorys/` 目录创建
- ✅ 4 个记忆文件初始化（status, conventions, decisions, pitfalls）

## 未开始

- ❌ `src/` 目录 — C++/ROS2 源代码
- ❌ `pixi.toml` — pixi 环境配置文件
- ❌ TypeScript 平台代码（packages/, tsconfig.json, drizzle.config.ts 等）
- ❌ Docker / docker-compose.yml
- ❌ CI/CD（.github/workflows/ 或 GitLab CI）
- ❌ `.clang-tidy` / `.clang-format`
- ❌ Git commits（仓库已初始化但零提交）

## 阻塞项

无当前阻塞项。

## 迭代目标

1. 创建 `pixi.toml` 使 `bootstrap.sh` 可运行
2. 搭建 `src/` 目录结构和第一个 ROS2 包
3. 启动 TypeScript 平台 Slice 1（见 docs/MODACS-Platform-Dev.md）
