# 踩坑记录

**最后更新**: 2026-07-01

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

**问题**: agent-guide.md 原引用 `make.sh` 作为统一构建入口，但 MODACS 仓库中不存在此文件，只有 `scripts/build.sh`。

**解决**: 重写 agent-guide.md 时将所有 `make.sh` 引用改为 `scripts/build.sh`。

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

**问题**: 原 agent-guide.md 引用 CodeGraph MCP（语义代码索引），但 MODACS 未配置此工具。

**解决**: ✅ 已解决 — CodeGraph MCP 后来重新配置。现在通过 `.opencode/init-mcp-codegraph.mjs`（跨平台 Node.js 脚本）启动，替代了旧的 bash 脚本。

---

### opencode.sh 不存在

**问题**: 原 agent-guide.md §13.6 引用 `opencode.sh` 启动脚本，但 MODACS 中不存在。

**解决**: 删除 §13.6 整节。

---

### agent-model-tiers.md 状态标注错误

**问题**: agent-guide.md §12 原标注 agent-model-tiers.md 为"未创建，参考本文档"，但文件实际已存在（256 行）。

**解决**: 更新标注为"已创建"。

---

## 通用

### 仓库零提交

**已解决**: ✅ 仓库现有 43 次提交（Conventional Commits 格式）。apps/debug/ 仍为未跟踪状态。

### 缺少 .clang-tidy / .clang-format

**问题**: C++ 编码规则要求使用 clang-format 和 clang-tidy，但项目中无对应配置文件。

**状态**: ✅ 已解决（2026-06-30）— 已创建 `.clangd`（LSP 配置 + C++17 标准 + 命名规则）、`.clang-format`（LLVM 风格 + Qt/ROS2 include 排序）、`.clang-tidy`（bugprone/performance/readability/modernize 检查集）。

---

### TypeScript LSP 未配置

**问题**: TypeScript 源代码已存在（43 个 .ts/.tsx 文件），但 `opencode.json` 中未配置 TypeScript LSP，`typescript-language-server` 未安装。

**解决**: ✅ 已解决（2026-06-30）— 全局安装 `typescript-language-server` v5.3.0 + `typescript`，在 `opencode.json` 的 `lsp` 中添加 `typescript-language-server` 条目（extensions: ts/tsx/js/jsx）。

---

### CodeGraph MCP 连接失败（nvm 短路）

**问题**: `opencode.json` 中 codegraph MCP 的 command 使用 `&&` 链连接 nvm source 和 npx 执行。当 nvm 未安装时（`[ -s "$NVM_DIR/nvm.sh" ]` 返回 false），`&&` 链短路，`exec npx` 永远不执行，MCP 进程启动后立即退出。

**解决**: ✅ 已解决（2026-07-01）— 创建 `.opencode/init-mcp-codegraph.mjs`（跨平台 Node.js 脚本，替代旧的 bash 版 init-codegraph-mcp.sh）。

---

### Playwright MCP 错误 32000（chromium 预检查崩溃）

**问题**: `init-mcp-playwright.mjs` 中 `npx playwright install --dry-run chromium` 在 pnpm strict node_modules 下失败 — `playwright` CLI 未提升到根 `.bin/`（`playwright-mcp` 二进制存在但 `playwright` CLI 缺失）。execSync 抛出未捕获异常，脚本在 MCP 服务器启动前退出 → OpenCode 错误 32000。

**解决**: ✅ 已解决（2026-07-01）— 移除 chromium 预检查/安装步骤。`--isolated` 模式在工具调用时按需启动浏览器，无需服务器启动时预装。

---

### pnpm strict node_modules 不提升 CLI

**问题**: pnpm 的 strict node_modules 策略不将依赖包的 CLI 提升到根 `.bin/`。`@playwright/mcp` 的 `playwright-mcp` 二进制存在，但 `playwright` CLI（来自 `playwright` 包）不在根 `.bin/`。

**影响**: 任何通过 `npx <package-name>` 调用依赖包 CLI的脚本都可能失败。

**解决**: 使用 `npx --package=<pkg> <cmd>` 或直接引用 `node_modules/<pkg>/bin/<cmd>` 路径。
