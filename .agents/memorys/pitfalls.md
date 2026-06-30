# 踩坑记录

**最后更新**: 2026-06-30

## 文档同步

### Obsidian wikilinks 在标准 markdown 中不渲染

**问题**: `[[MODACS-Platform]]` 在 GitHub/标准 markdown 渲染器中显示为纯文本，无法点击。

**解决**: 批量转换为 `[MODACS-Platform](./MODACS-Platform.md)` 格式。使用 Python 脚本处理所有 11 份文档，共转换 79 个 wikilinks。

**教训**: 从 Obsidian 笔记库同步文档到仓库时，必须转换 wikilinks。

---

### Obsidian YAML frontmatter 冗余

**问题**: 每份文档头部有 YAML frontmatter（`title`, `tags`, `date`），在仓库中无实际用途且增加噪音。

**解决**: 批量移除所有 11 份文档的 frontmatter（共 112 行）。

---

### 中文文件名兼容性

**问题**: `MES开发方案.md` 在某些工具和 CI 系统中可能引起编码问题。

**解决**: 重命名为 `MES-Development-Plan.md`，同步更新 6 处引用（5 个文档 + AGENTS.md）。

---

## 构建系统

### make.sh 不存在

**问题**: AI_CONFIG.md 原引用 `make.sh` 作为统一构建入口，但 MODACS 仓库中不存在此文件，只有 `scripts/build.sh`。

**解决**: 重写 AI_CONFIG.md 时将所有 `make.sh` 引用改为 `scripts/build.sh`。

**教训**: 从其他项目移植配置文件时，必须验证所有文件路径引用。

---

### pixi.toml 缺失

**问题**: 多个脚本引用 `pixi.toml` 但该文件不存在于仓库中。

**状态**: 未解决 — 需要创建 `pixi.toml` 才能运行 `bootstrap.sh`。（2026-06-30 确认仍不存在）

---

### BUILD_TESTING=OFF

**问题**: `build.sh` 第 257 行显式设置 `BUILD_TESTING=OFF`，测试被禁用。

**注意**: 这是有意为之（脚手架阶段无测试代码），但在开发阶段需要移除此限制。

---

### 硬编码并行度

**问题**: `build.sh` 中 `--parallel-workers 6` 是硬编码值，未根据 CPU 核数动态调整。

**影响**: 在核心数不同的机器上可能导致构建过慢或过载。

---

## AI 配置

### CodeGraph MCP 未配置

**问题**: 原 AI_CONFIG.md 引用 CodeGraph MCP（语义代码索引），但 MODACS 未配置此工具。

**解决**: 从 AI_CONFIG.md 中移除所有 CodeGraph 相关内容（§5.8 整节删除 + §5.6 MCP 表 + §12 配置速查 + §13 故障排除 + §14 快速上手）。

---

### opencode.sh 不存在

**问题**: 原 AI_CONFIG.md §13.6 引用 `opencode.sh` 启动脚本，但 MODACS 中不存在。

**解决**: 删除 §13.6 整节。

---

### MODEL_TIERS.md 状态标注错误

**问题**: AI_CONFIG.md §12 原标注 MODEL_TIERS.md 为"未创建，参考本文档"，但文件实际已存在（256 行）。

**解决**: 更新标注为"已创建"。

---

## 通用

### 仓库零提交

**注意**: 仓库已 `git init` 但零提交，所有文件未跟踪。首次提交时需注意 `.gitignore` 配置（排除 `env/`, `log/`, `data/`, `node_modules/` 等）。

### 缺少 .clang-tidy / .clang-format

**问题**: C++ 编码规则要求使用 clang-format 和 clang-tidy，但项目中无对应配置文件。

**状态**: ✅ 已解决（2026-06-30）— 已创建 `.clangd`（LSP 配置 + C++17 标准 + 命名规则）、`.clang-format`（LLVM 风格 + Qt/ROS2 include 排序）、`.clang-tidy`（bugprone/performance/readability/modernize 检查集）。

---

### TypeScript LSP 未配置

**问题**: TypeScript 源代码已存在（10 个 .ts 文件），但 `opencode.json` 中未配置 TypeScript LSP，`typescript-language-server` 未安装。

**解决**: ✅ 已解决（2026-06-30）— 全局安装 `typescript-language-server` v5.3.0 + `typescript`，在 `opencode.json` 的 `lsp` 中添加 `typescript-language-server` 条目（extensions: ts/tsx/js/jsx）。

---

### CodeGraph MCP 连接失败（nvm 短路）

**问题**: `opencode.json` 中 codegraph MCP 的 command 使用 `&&` 链连接 nvm source 和 npx 执行。当 nvm 未安装时（`[ -s "$NVM_DIR/nvm.sh" ]` 返回 false），`&&` 链短路，`exec npx` 永远不执行，MCP 进程启动后立即退出。

**解决**: ✅ 已解决（2026-06-30）— 创建 `.opencode/init-codegraph-mcp.sh` 包装脚本，自动探测 nvm/brew/直装三种 Node.js 环境。`opencode.json` command 改为 `["bash", ".opencode/init-codegraph-mcp.sh"]`。
