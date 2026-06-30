# 编码约定

**最后更新**: 2026-06-30

## 命名规范

### 通用
- 文件：`kebab-case`（如 `work-order.ts`）
- 类/接口/类型：`PascalCase`
- 函数/变量：`camelCase`
- 常量：`UPPER_SNAKE_CASE`
- 布尔变量：`is`/`has`/`should`/`can` 前缀

### TypeScript 平台
- DB schema：`{module}_{table}`（如 `mes_work_orders`）
- API 路径：`/api/{collection}:{action}`（非 REST 风格）
  - ✅ `/api/work-orders:list` `/api/work-orders:create` `/api/work-orders:get?id=123`
- 自定义 hooks：`camelCase` + `use` 前缀

### C++
- 类型/类：`PascalCase`
- 函数/方法：`snake_case` 或 `camelCase`（跟随项目约定）
- 常量：`kPascalCase` 或 `UPPER_SNAKE_CASE`
- 命名空间：`lowercase`
- 成员变量：`snake_case_`（尾部下划线）或 `m_` 前缀

## 技术栈约束

### TypeScript 平台（MODACS）
- 运行时：Node.js 24 LTS（❌ 禁止 Bun 专有 API）
- 包管理：pnpm workspaces（❌ 禁止 npm/yarn/bun install）
- Web 框架：Hono ^4（❌ 禁止 Express/Fastify/Koa）
- ORM：Drizzle ^0.36（❌ 禁止 Prisma/Sequelize/TypeORM）
- 数据库：PostgreSQL 16+（❌ 禁止 SQLite/MySQL）
- 前端：React 19 + shadcn/ui + Tailwind CSS v4
- 状态：Zustand ^5（❌ 禁止 Redux/Jotai）
- 数据获取：TanStack Query ^5（❌ 禁止 SWR）
- 构建：esbuild（❌ 禁止 webpack/rollup）
- 测试：vitest + Playwright（❌ 禁止 Jest）
- 验证：Zod ^3
- UDS 传输：undici ^7（❌ 禁止 node-fetch/axios）

### C++/Qt/ROS2（MSRCS 侧）
- 标准：C++17
- Qt：5.15（技能文件针对 Qt6，项目使用 5.15，注意版本差异）
- ROS2：Jazzy
- 构建：colcon + Ninja，`--merge-install`，`BUILD_TESTING=OFF`
- LSP：clangd（通过 `scripts/gen-compile-db.sh` 生成 compile_commands.json）

## 架构约束

- **多进程**：Base 进程（Node.js）通过 fork 管理插件子进程
- **通信**：JSON-RPC 2.0 over UDS（Unix Domain Sockets）— 仅 JSON
- **允许模式**：req/rep（UDS 上的 HTTP POST）、pub/sub（fan-out）、streaming（SSE + Zenoh v2）
- **禁止**：ZMQ, NNG, gRPC streams, Redis, 跨节点透明 RPC
- **插件**：独立子进程，禁止直接访问数据库（通过 RPC 到 base）
- **UI 隔离**：3 层 — UIAdapter 接口 → 平台复合组件 → Field Interface 注册表
- **模块代码**：仅从 `@modacs/ui` 导入，禁止直接导入 `shadcn/ui` 或 `@radix-ui/*`

## 文件组织

- 200-400 行典型，800 最大
- 函数 <50 行
- 嵌套最多 4 层（使用提前返回）
- 多个小文件 > 少量大文件
- 不可变性：始终创建新对象，不修改现有对象（关键）

## 文档约定

- 文档放置在 `docs/`（架构与设计文档）
- 变更日志在 `changes/`（按版本分文件，非 CHANGELOG.md）
- 版本号在 `version.txt`（非 CMakeLists.txt 或 package.xml）
- 代码交互问答倾向使用中文
- 禁止 AI 自动 git commit

## Git 约定

- 分支命名：`feat/`, `fix/`, `chore/` 前缀
- 提交信息：Conventional Commits 格式（`feat:` `fix:` `chore:` `docs:`）
- 仓库当前零提交，所有文件未跟踪

## AI 工具使用优先级

> 详细说明见 [AGENTS.md](../../AGENTS.md) 的「AI 工具使用优先级」章节。

| 任务场景 | 首选工具 | 回退方案 |
|----------|---------|----------|
| 代码理解/导航/架构分析 | `codegraph_explore` | grep + read |
| 符号定义查找 | `lsp_goto_definition` | `codegraph_explore` |
| 符号引用查找 | `lsp_find_references` | `codegraph_explore` |
| 符号重命名 | `lsp_rename` | 手动 sed/edit |
| 结构化代码搜索 | `ast_grep_search` | grep |
| 代码诊断/类型检查 | `lsp_diagnostics` | build 命令 |
| 文档大纲/符号列表 | `lsp_symbols` | grep function/class |

**规则**：
- 调用 `codegraph_explore` 前无需先 grep 或 read — 一次调用即可返回源码 + 调用链 + 影响范围
- 仅当 codegraph 报告未索引（无 `.codegraph/` 目录）或返回结果不足时，才回退到 grep/read
- 编辑文件后，若 codegraph 返回过期警告（⚠️ banner），对警告中列出的文件使用 read 确认最新内容
- `lsp_*` 工具仅对已配置 LSP 的语言生效（当前：C++/clangd, TypeScript, Python, Bash, Rust, HTML, Markdown）
- 对 codegraph 不索引的内容（配置文件、文档、非代码文件），直接使用 read/grep
