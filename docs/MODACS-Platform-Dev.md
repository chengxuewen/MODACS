# MODACS 平台开发计划

> 本文是平台开发的实操指南。采用**垂直切片（Vertical Slice）**策略：
> 每个阶段产出可演示、可验证的端到端功能，而非孤立的技术层。
> 架构设计见 [MODACS-Platform](./MODACS-Platform.md)，集群扩展见 [MODACS-Cluster](./MODACS-Cluster.md)，开源参考见 [MODACS-Platform-Ref](./MODACS-Platform-Ref.md)。

---

## 0. 技术选型确认

| 层面         | 选型                                    | 理由                                   |
| ---------- | ------------------------------------- | ------------------------------------ |
| **运行时**    | Node.js 24 LTS                        | 15 年生产验证，长运行稳定；用 tsx 开发 + esbuild 构建 |
| **Web 框架** | Hono + @hono/node-server              | 轻量，运行时无关，不绑 ORM                      |
| **ORM**    | Drizzle                               | TS 原生类型安全，零运行时开销                     |
| **数据库**    | PostgreSQL                            | 所有模块共享，schema 隔离                     |
| **前端**     | React 19 + TanStack Router + Tailwind | 动态路由注册，Carbon 组件可移植                  |
| **状态管理**   | Zustand                               | 轻量，偏好/用户/模块列表                        |
| **数据请求**   | TanStack Query                        | 缓存、失效、乐观更新                           |
| **表单校验**   | Zod                                   | 与 Drizzle + Field Interface 配合       |
| **拓扑排序**   | @hapi/topo                            | 模块两阶段加载依赖排序                          |
| **容器隔离**   | Podman（可选）                            | daemonless，仅 Vision/Act 使用           |
|            |                                       |                                      |

### pnpm workspace 依赖清单

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "modules/*"
```

```json
// package.json (根)
{
  "name": "modacs",
  "scripts": {
    "dev": "pnpm --filter @modacs/core dev",
    "build": "pnpm run build:core && pnpm run build:ui",
    "build:core": "esbuild --bundle --platform=node packages/core/src/index.ts --outfile dist/modacs",
    "test": "pnpm test"
  }
}
```

```json
// packages/core/package.json
{
  "name": "@modacs/core",
  "dependencies": {
    "hono": "^4",
    "drizzle-orm": "^0.36",
    "drizzle-kit": "^0.28",
    "postgres": "^3",
    "zod": "^3",
    "@hapi/topo": "^6",
    "jsonwebtoken": "^9",
    "bcrypt": "^5",
    "eventemitter3": "^5",
    "undici": "^7",
    "@mcap/core": "^1",
    "ws": "^8"
  }
}
```

```json
// packages/ui/package.json
{
  "name": "@modacs/ui",
  "dependencies": {
    "react": "^19",
    "@tanstack/react-router": "^1",
    "@tanstack/react-query": "^5",
    "@tanstack/react-table": "^8",
    "react-hook-form": "^7",
    "@hookform/resolvers": "^3",
    "zustand": "^5",
    "tailwindcss": "^4",
    "lucide-react": "^0.4",
    "react-rnd": "^10",
    "sonner": "^1",
    "@radix-ui/react-dialog": "^1",
    "@radix-ui/react-select": "^2",
    "@radix-ui/react-dropdown-menu": "^2",
    "@radix-ui/react-tooltip": "^1",
    "@radix-ui/react-popover": "^1",
    "@radix-ui/react-tabs": "^1",
    "@radix-ui/react-checkbox": "^1",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2"
  }
}
```

---

## 1. 开发路线：垂直切片（Vertical Slice）

### 1.1 为什么不用水平分层

传统"水平分层"开发（先做数据库层 → 服务层 → API 层 → UI 层）在 Solo 开发中有三个致命缺陷：

1. **反馈循环极长**：前 3 个月只对着终端和 JSON，没有可点击的界面 → 士气风险极高
2. **架构假设验证太晚**：多进程 UDS JSON-RPC 是 MODACS 区别于所有现有方案的核心创新。如果延迟 / 稳定性 / 调试体验有问题，地基就是裂的，应该在第 2 周就发现
3. **集成风险累积**：各部分独立开发到最后拼装，Week 20 才发现问题，返工成本不可接受

### 1.2 垂直切片方案

每个 Slice 产出**可演示、可验证的端到端功能**，而不只是一个"层"。

```
Slice 1 ─── 架构探针（Week 1-2）          ← ~500 行代码验证核心架构
  验证 UDS JSON-RPC 延迟 + MCAP 录制回放 + Foxglove 实时调试 + 多进程稳定性

Slice 2 ─── 数据层 + 认证（Week 3-4）      ← 第一次"有意义的 API"
  Postgres + Drizzle + Collection 基类 + JWT 认证 + 多进程数据访问

Slice 3 ─── 第一个 UI（Week 5-7）          ← 第一次"看到东西"
  UI Adapter → shadcn/ui → Login → Admin 布局 → 动态路由 → CRUD 表格

Slice 4 ─── MES 业务模块（Week 8-12）      ← 第一次"真实业务"
  Carbon MES 提取 → 6-8 个 Collection → FormBuilder → 完整两表联动

Slice 5 ─── 工作流 + ACL（Week 13-14）     ← 完整 MVP
  DAG 流程引擎 + 中断恢复 + 可视化编辑器 + RBAC 权限
```

**总计：14 周（约 3.5 个月）**

> 桌面窗口模式（原 Step 11）和 Podman + Vision 集成（原 Step 12）推迟到 v2。

### 1.3 与旧计划（水平分层）对比

| 维度      | 旧：水平分层 12 Step | 新：垂直切片 5 Slice |
| ------- | :------------: | :------------: |
| 首次看到 UI |    Week 12     |   **Week 5**   |
| 架构核心验证  |     Week 4     |   **Week 2**   |
| 首次业务功能  |    Week 16     |   **Week 8**   |
| 端到端集成验证 |    Week 20     |  **Week 12**   |
| 每个阶段可演示 |   ❌ 前 11 周不能   | ✅ 每 2 周一个 Demo |
| 集成返工风险  |       高        |       低        |
| 总周数     |      21 周      |    **14 周**    |

### 1.4 旧 Step → 新 Slice 映射

现有第 2 节中详细的 Step 代码保留为**实现参考**，以下映射说明各 Slice 对应哪些 Step：

| Slice | 涵盖旧 Step | 说明 |
|-------|:---|------|
| Slice 1 | Step 1（骨架）+ Step 3（ProcessManager/RPC/Recorder） | 简化版，只做 echo RPC + MCAP 验证 |
| Slice 2 | Step 4（Drizzle）+ Step 8（JWT） | 子进程通过 RPC 访问 DB |
| Slice 3 | Step 2（Plugin 基类）+ Step 9（Admin UI） | 首次引入 UI Adapter + shadcn/ui |
| Slice 4 | Step 5（Resource Manager）+ Step 10（MES 提取） | MES 模块作为第一个真实业务插件 |
| Slice 5 | Step 6（Field Interface）+ Step 7（工作流） | Field Interface 只在需要自定义控件时才做 |
| **v2** | Step 11（桌面模式）+ Step 12（Podman/Zenoh） | 推迟 |

### 1.5 Demo Checklist 原则

每个 Slice 结尾必须产出 Demo Checklist，不是"代码写完了"，而是**以下操作用键盘/鼠标能走通**：

- **可运行**：一个命令启动（`pnpm dev`）
- **可录制**：所有操作自动生成 .mcap 文件
- **可回放**：Foxglove 打开 .mcap，能看到完整操作时间线
- **可演示**：给非技术人员看界面，对方能理解在做什么

拒绝"假绿灯"：`console.log("test pass")`不算验证通过。必须实际运行、实际录制、实际回放。

### 1.6 Slice 1：架构探针（Week 1-2）

**目标**：用 ≤500 行代码验证 MODACS 三个核心架构假设。

**实现内容**：

```
packages/server/
├── src/
│   ├── main.ts              # Hono Server + 启动入口
│   ├── app.ts               # 组装
│   ├── process-manager.ts   # child_process.fork + 异常重启（借鉴 procwire）
│   ├── rpc/
│   │   ├── protocol.ts      # JSON-RPC 2.0 自建（~50 行）
│   │   ├── transport.ts     # UDS 传输层（undici Agent，借鉴 node-ipc-jsonrpc）
│   │   └── hub.ts           # RPC Hub（Proxy 代理 + 录制 + 事件广播）
│   ├── recorder.ts          # MCAP 旁路录制器
│   └── foxglove-bridge.ts   # Foxglove WebSocket 实时调试（~150 行）
packages/base/
├── src/
│   └── index.ts             # Base 插件（echo 方法 + Hono JSON-RPC Server）
tests/
├── spike/
    └── e2e.test.ts          # 端到端验证
```

**关键决策**：

- JSON-RPC 2.0 协议全自建（~50 行），零依赖 — 不引入 jayson / node-jsonrpc 等库
- UDS 传输层：`undici` Agent（Node.js 内置 fetch 不支持 UDS，需 `connect: { socketPath }`）
- 不做 Plugin 基类、不做 PluginManager、不做 Collection — 只有裸的 echo RPC
- 不做 HTTP 路由 /api/** — 只有 /rpc/echo 一条路径
- ProcessManager 只监控 1 个子进程（base）
- 借鉴 node-ipc-jsonrpc：auto-reconnect with backoff + request timeout
- 借鉴 procwire：ProcessManager restart policies + graceful shutdown 顺序
- 借鉴 ROS2 rosbag2：Recorder 作为中间件、旁路录制、零侵入
- Foxglove Bridge：与 Recorder 共享 Event Bus，WebSocket 推送到 Foxglove App 实时查看
- Drizzle 完全不做 — Slice 2 才引入

**Demo Checklist**：

- [ ] `pnpm dev` 一键启动 → 终端输出 `[modacs] Server started on http://localhost:3000`
- [ ] `curl -X POST http://localhost:3000/rpc/echo -d '{"jsonrpc":"2.0","method":"echo","params":["hello"],"id":1}'` → 返回 `{"jsonrpc":"2.0","result":"hello from base","id":1}`
- [ ] 关闭 base 子进程（`kill <base-pid>`） → 终端输出 `[process-manager] base (pid=XXX) exited, restarting in 1s...` → 再次 curl 成功
- [ ] 查看 `data/recordings/` → 有 `.mcap` 文件生成
- [ ] Foxglove 打开 `.mcap` → 看到 `request/echo` 和 `response/echo` 两个 topic，带 timestamp + direction 字段
- [ ] 录制文件包含正确的 JSON payload（不是二进制 blob）
- [ ] `MODACS_DEBUG=1 pnpm dev` → 终端输出 `[foxglove-bridge] Live debug at ws://127.0.0.1:8765`
- [ ] Foxglove App → Open connection → `ws://127.0.0.1:8765` → 实时看到 RPC 调用弹出
- [ ] Foxglove Plot 面板 → 选中 `rpc.response` → 显示 RPC 延迟实时折线图
- [ ] `pnpm test:e2e` 运行端到端测试 → 全部通过（启动 server → 发 RPC → 杀子进程 → 重启验证 → 检查 .mcap → 检查 WebSocket 实时消息）

**通过标准**：

```
UDS 延迟        < 50μs（实测）            设计目标 ~20μs
子进程稳定性     连续 4h 无异常退出         基础验证
MCAP 格式       Foxglove 可正确解析        格式正确
WebSocket 实时   Foxglove App 实时收到 RPC  延迟 < 10ms（本地回环）
```

### 1.7 Slice 2：数据层 + 认证（Week 3-4）

**目标**：多进程下基于 RPC 的数据库访问 + JWT 认证链路验证。

**实现内容**：

```
packages/server/src/
├── db/
│   ├── index.ts             # Postgres + Drizzle 初始化
│   └── schema.ts            # users 表 schema
├── collections/
│   └── user.collection.ts   # Collection 基类 + users CRUD
├── middleware/
│   └── auth.ts              # JWT 中间件
packages/base/src/
├── db-proxy.ts              # 通过 RPC 调用 base 进程的 DB（子进程不直连 DB）
新增文件：
packages/server/src/
├── drizzle.config.ts
├── migrations/
```

**关键决策**：

- **用 Postgres**：子进程通过 UDS RPC 访问 DB（不直连）；`docker compose up -d db` 一行启动；Drizzle 方言后期可切换，但 MODACS 是平台而非工具，需要并发写、RLS、并行查询、在线备份等 PG 原生能力；Carbon 从 Supabase（PG）迁移数据模型零成本
- **子进程不直连 DB**：所有 DB 访问通过 UDS RPC 转发到 base 进程；测试"RPC 延迟对 CRUD 的影响"
- JWT 做成 Hono middleware，token 通过 HTTP Header 和 RPC context 双重传递
- Collection 基类做最小可用版本：`defineCollection({ name, fields })` → 自动生成 `list / get / create / update / delete`

**Demo Checklist**：

- [ ] `pnpm db:migrate` → Postgres 中创建 `modacs` 数据库和 users 表（`\dt` 可查看）
- [ ] `curl -X POST /api/auth/register -d '{"username":"admin","password":"123456"}'` → 返回 user 对象（密码 bcrypt 哈希）
- [ ] `curl -X POST /api/auth/login -d '{"username":"admin","password":"123456"}'` → 返回 `{ token: "eyJ...", user: {...} }`
- [ ] `curl -H "Authorization: Bearer <token>" /api/users:list` → 返回用户列表（含分页）
- [ ] `curl -H "Authorization: Bearer <token>" /api/users:create -d '{...}'` → 创建成功
- [ ] `curl /api/users:list`（无 token） → 401 Unauthorized
- [ ] 子进程中的 `db.users.list()` 调用走 UDS RPC → response 数据正确
- [ ] 所有 DB CRUD 操作录制在 `.mcap` → Foxglove 可见 RPC + SQL 执行时间线
- [ ] `pnpm test:e2e` → auth flow + CRUD flow 端到端通过

**通过标准**：

```
RPC CRUD 延迟   < 1ms / 操作         可接受（企业应用毫秒级即可）
JWT 链路        子进程能正确获取用户身份  认证不泄漏
Collection API  定义 1 个 Collection   后续可扩展
```

### 1.8 Slice 3：第一个 UI（Week 5-7）

**目标**：UI 三层隔离架构验证 + 前后端全链路打通。第一次"看到东西"。

**实现内容**：

```
packages/ui/
├── src/
│   ├── adapter/               # UIAdapter 接口定义
│   │   ├── types.ts           # Props 类型（Button, Input, Select, Modal, etc.）
│   │   └── ui-adapter.ts      # 抽象接口
│   ├── components/
│   │   ├── ui/                # shadcn/ui 组件（npx shadcn@latest add）
│   │   ├── composite/         # 平台复合组件
│   │   │   ├── data-table.tsx # TanStack Table 封装
│   │   │   ├── form-builder.tsx # RHF + Zod
│   │   │   └── detail-panel.tsx
│   │   └── layout/
│   │       ├── admin-layout.tsx  # 侧边栏 + 顶栏 + 内容区
│   │       ├── sidebar.tsx
│   │       └── header.tsx
│   ├── pages/
│   │   ├── login.tsx
│   │   └── collection/
│   │       └── list.tsx          # 动态 Collection CRUD 页面
│   ├── router.tsx               # TanStack Router 配置
│   └── main.tsx                 # Vite 入口
├── index.html
├── vite.config.ts
└── tailwind.config.ts
```

**关键决策**：

- UI Adapter 先只定义 ~12 个基础组件（Button, Input, Select, Modal, Drawer, Tabs, Tooltip, Toast, Checkbox, DatePicker, Dropdown, Popover）
- 复合组件先只做 3 个（DataTable, FormBuilder, DetailPanel），够用即可
- Login 页面用 shadcn/ui 直接写（不经过 adapter，因为这是平台内置页，不属于模块）
- Collection 列表页作为动态路由 → 验证"插件 manifest → 菜单 → 路由 → 数据"全链路
- Week 5 重心在 UI Adapter + shadcn 搭建，Week 6-7 做页面和前后端对接

**Demo Checklist**：

- [ ] `pnpm dev` → 前端 Vite 启动在 localhost:5173，后端在 localhost:3000
- [ ] 打开浏览器 → 看到登录页（shadcn/ui 风格，不是浏览器默认表单）
- [ ] 输入账号密码 → 登录 → token 存储 → 跳转到 Admin 布局
- [ ] Admin 布局 → 左侧有侧边栏，顶部有用户头像 + 退出按钮
- [ ] 侧边栏菜单从插件 manifest 动态加载（不是硬编码）
- [ ] 点击 Users 菜单 → 内容区显示用户数据表格（TanStack Table：排序、搜索、分页）
- [ ] 表格"新建"按钮 → 弹出 Modal 表单（shadcn/ui Dialog + RHF） → 提交 → 表格自动刷新
- [ ] 编辑 / 删除 → 表格行内操作 → 删除前二次确认（AlertDialog）
- [ ] 所有 CRUD 操作 → 无需页面刷新（TanStack Query 自动管理缓存）
- [ ] `.mcap` 文件记录完整用户操作序列（登录 → 浏览 → CRUD）
- [ ] 打开 `packages/ui/src/adapter/types.ts` → 确认接口定义与 shadcn 实现解耦

**通过标准**：

```
UI Adapter 隔离   模块代码不 import from "shadcn/ui"    适配器模式正确
前后端 RPC 链路   UI 操作 → UDS RPC → DB → 响应 → UI   全链路通畅
动态路由          manifest 定义的菜单正确渲染             可扩展
```

### 1.9 Slice 4：MES 业务模块（Week 8-12）

**目标**：真实业务场景全链路验证。整个 MODACS 架构的试金石。

**前置评估（Week 8 前半周）**：

在正式开发前，必须先评估 Carbon MES 部分的代码状况。评估维度：

1. **表规模和领域**：MES 相关表数量、关键字段、表关系
2. **Supabase 耦合点**：
   - Row Level Security（RLS）策略 → 需改为 MODACS ACL
   - Edge Functions → 需改为 MODACS workflow
   - Supabase SDK 调用点（`supabase.from()`, `.auth`, `.storage`）
   - 实时订阅（Supabase Realtime）→ 需评估是否需要 SSE 替代
3. **业务逻辑复杂度**：纯 CRUD vs 状态机 vs 复杂计算
4. **可提取比例**：数据模型多少能直接用？多少需要重写？

> 评估报告写入项目笔记（外部文档，不在仓库内）

**实现内容（基于评估调整，以下是目标）**：

```
packages/mes/
├── src/
│   ├── index.ts              # MES Plugin 入口
│   ├── manifest.yaml
│   ├── schema/
│   │   ├── work-order.ts     # 工单
│   │   ├── route.ts          # 工艺路线
│   │   ├── operation.ts      # 工序
│   │   ├── inspection.ts     # 质检记录
│   │   ├── equipment.ts      # 设备台账
│   │   └── product.ts        # 产品/物料
│   ├── collections/
│   │   ├── work-order.collection.ts
│   │   ├── inspection.collection.ts
│   │   └── ...               # 6-8 个 Collection
│   └── routes.ts             # 自定义 API（如果有非 CRUD 逻辑）
packages/ui/src/pages/
├── mes/
│   ├── work-order/
│   │   ├── list.tsx          # 工单列表（DataTable）
│   │   ├── detail.tsx        # 工单详情（DetailPanel）
│   │   └── form.tsx          # 工单表单（FormBuilder）
│   ├── equipment/
│   │   └── list.tsx
│   └── inspection/
│       ├── list.tsx
│       └── form.tsx
```

> **注意**：MES UI 页面放在 `packages/ui` 中（共享 UI 包），但代码通过 `@modacs/ui` adapter 引用组件，不直接 import shadcn/ui。未来可拆到 `packages/mes/ui/` 做动态加载。

**关键决策**：

- 先做 Collection CRUD（列表、表单、详情），不做复杂工作流（Slice 5 才做）
- 工艺路线只做静态数据展示，不画甘特图（v2）
- FormBuilder 支持"工序子表嵌套"（`工单 → [工序1, 工序2, ...]`）
- 质检记录通过下拉关联工单和工序（外键 → Select 组件）
- 如果 Carbon 中某个表完全走 Supabase RLS + Edge Functions，优先在 MODACS 重写

**Demo Checklist**：

- [ ] 登录 → 侧边栏显示 MES 模块分组（工单管理、质量管理、设备管理）
- [ ] 创建产品/物料（Product Collection CRUD）
- [ ] 定义工艺路线：选择产品 → 添加多个工序（操作描述、标准工时、质检要求）
- [ ] 创建工单：选择产品 → 自动带入工艺路线 → 填写数量 → 分配设备
- [ ] 工单列表页 → 搜索（按产品名/工单号） → 筛选（按状态） → 排序（按日期） → 分页
- [ ] 点击工单行 → 详情面板 → 显示工单信息 + 工序列表（子表） + 质检记录（关联表）
- [ ] 创建质检记录：选择工单 + 工序 → 填写检测值 → 判定合格/不合格
- [ ] 质检不合格 → 工单状态自动标记"异常"
- [ ] 所有操作录制在 `.mcap` → Foxglove 回放可见完整业务操作序列
- [ ] Carbon MES 评估报告已写入，标注了可复用和需重写的部分

**通过标准**：

```
Collection 数量     ≥6 个 MES Collection 正常运行
关联查询          工单→工序→质检 三级关联正确
RPC 延迟          MES CRUD < 5ms（含关联查询）
MCAP 录制         完整业务操作可回放
```

### 1.10 Slice 5：工作流 + ACL（Week 13-14）

**目标**：业务闭环 + 权限体系 → 完整可用的 MVP。

**实现内容**：

```
packages/server/src/
├── workflow/
│   ├── engine.ts             # DAG 工作流引擎
│   ├── executor.ts           # 节点执行器
│   ├── snapshot.ts           # 状态快照 + 中断恢复
│   └── dsl.ts                # YAML DSL 解析
├── acl/
│   ├── rbac.ts               # RBAC 权限模型
│   ├── middleware.ts          # 权限拦截中间件
│   └── resources.ts          # 资源-操作注册表
新增数据库表：
├── workflows                  # 工作流定义
├── workflow_instances         # 工作流实例（含 snapshot）
├── roles / permissions / user_roles  # RBAC 表
packages/ui/src/
├── pages/
│   ├── workflow/
│   │   ├── editor.tsx         # 可视化工作流编辑器（@xyflow/react）
│   │   └── instances.tsx      # 工作流实例监控
│   └── admin/
│       ├── roles.tsx          # 角色-权限管理
│       └── users-roles.tsx    # 用户-角色分配
```

**关键决策**：

- 工作流 DSL 用 YAML（不是 JSON），可读性好
- 编辑器基于 `@xyflow/react`（MIT license），DAG 拖拽连线
- 中断恢复：`InterruptError` → 序列化 State snapshot → 存 DB → 重启后从断点继续
- RBAC 做最简单版本：角色 → 资源 → 操作（CRUD），不做 ABAC
- 将 MES 工单审批流程作为第一个工作流建模

**Demo Checklist**：

- [ ] 工作流编辑器页面 → 拖拽节点到画布 → 连线 → 保存 → 生成 YAML DSL
- [ ] 定义"工单审批流程"：`提交 → 主管审批 → 生产执行 → 质检 → 完成`
- [ ] 工单提交 → 自动触发工作流 → 状态变为"待审批"
- [ ] 主管角色登录 → 仪表盘显示"待审批工单" → 点击审批 → 通过/驳回
- [ ] 审批通过 → 工作流自动推进到"生产执行"节点
- [ ] 工作流执行到"质检"节点 → `kill` server 进程 → 重启 → 从未完成的质检步骤继续（无数据丢失）
- [ ] 角色管理页面 → 创建"操作工"角色 → 分配权限（只能查看自己工单、不能删除）
- [ ] 操作工登录 → 工单列表看不到"删除"按钮 → API 调用返回 403
- [ ] 管理员登录 → 能看到全部工单、能删除
- [ ] 权限变更即时生效（无需重新登录）
- [ ] 完整审批流程 + 权限检查记录在 `.mcap` → Foxglove 回放可见 DAG 执行轨迹 + 权限结果

**通过标准**：

```
工作流引擎         至少 1 个真实审批流程完整跑通
中断恢复           关闭 server → 重启 → 从断点继续，无数据丢失
RBAC 权限          3 个角色（管理员/主管/操作工），权限正确拦截
MCAP 录制          完整流程可回放（含工作流状态变更 + 权限检查结果）
```

---

### 1.11 UDS JSON-RPC 传输层：借鉴已有库的设计模式

> **决策**：JSON-RPC 2.0 协议全自建（~50 行），不做依赖引入。
> 但 UDS 传输层的连接管理、自动重连、心跳等易错逻辑，借鉴以下项目验证过的设计。

**借鉴来源**：

| 项目 | 借鉴内容 | 不引入原因 |
|------|----------|------------|
| **procwire** | ProcessManager restart policies（指数退避 + 最大上限）、graceful shutdown 顺序 | 双平面太重（control + data），我们只需单 UDS |
| **node-ipc-jsonrpc** | auto-reconnect with backoff、request timeout、事件驱动的 notification 模型 | Server 端是 Go；Node 端我们自建 |
| **json-rpc-api-proxy** | UnixSocketServer 类设计、middleware chain 模式 | 维护活跃度不稳，Apache 2.0 可参考但不可依赖 |
| **ROS2 rosbag2** | MCAP 旁路录制模式（Recorder 作为中间件，零侵入） | 已借鉴 |
| **nng (nanomsg-next-gen)** | REQ/REP + PUB/SUB 双模式、UDS native 支持 | C 依赖太重 |

**自建的 JSON-RPC 2.0 核心（~50 行）**：

```typescript
// packages/core/src/rpc/protocol.ts — 零依赖
export interface RpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
    id: string | number;
}

export interface RpcResponse {
    jsonrpc: '2.0';
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
    id: string | number;
}

export function createRequest(method: string, params?: unknown, id?: string | number): RpcRequest {
    return { jsonrpc: '2.0', method, params, id: id ?? Date.now().toString(36) };
}

export function createResponse(id: string | number, result?: unknown, error?: RpcResponse['error']): RpcResponse {
    return { jsonrpc: '2.0', result, error, id };
}

export function isNotification(req: RpcRequest): boolean {
    return req.id === undefined;
}
```

**自建的 UDS 传输层（借鉴 node-ipc-jsonrpc 的 auto-reconnect 模式）**：

```typescript
// packages/core/src/rpc/transport.ts
import { Client } from 'undici';  // Node.js 内置 undici，Agent 支持 UDS

interface TransportOptions {
    socketPath: string;        // /tmp/modacs-mes.sock
    requestTimeout?: number;   // 默认 30s
    connectRetry?: {           // 借鉴 node-ipc-jsonrpc 的 auto-reconnect
        maxRetries: number;    // 默认 3
        initialDelay: number;  // 默认 100ms
        maxDelay: number;      // 默认 5s
    };
}

export class UdsClient {
    // 借鉴 node-ipc-jsonrpc: 简洁 API
    // 借鉴 procwire: 连接状态管理

    private client: Client;
    private connected = false;

    constructor(private opts: TransportOptions) {
        this.client = new Client('http://localhost', {
            connect: { socketPath: opts.socketPath },  // undici UDS Agent
            bodyTimeout: opts.requestTimeout ?? 30_000,
        });
    }

    async connect(): Promise<void> {
        // 借鉴 node-ipc-jsonrpc: exponential backoff reconnection
        let delay = this.opts.connectRetry?.initialDelay ?? 100;
        for (let i = 0; i <= (this.opts.connectRetry?.maxRetries ?? 3); i++) {
            try {
                await this.client.request({ method: 'GET', path: '/health' });
                this.connected = true;
                return;
            } catch {
                if (i === this.opts.connectRetry?.maxRetries) throw new Error('UDS connect failed');
                await sleep(Math.min(delay, this.opts.connectRetry?.maxDelay ?? 5000));
                delay *= 2;
            }
        }
    }

    async call(method: string, params?: unknown): Promise<unknown> {
        const req = createRequest(method, params);
        const res = await this.client.request({
            method: 'POST',
            path: '/',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(req),
        });
        const body = await res.body.json() as RpcResponse;
        if (body.error) throw new RpcError(body.error);
        return body.result;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        await this.client.close();
    }
}
```

> 完整实现见 [2. 各 Slice 详细实现参考（旧 Step 代码）](#2-各-slice-详细实现参考旧-step-代码) 中 Step 3 ProcessManager + RPC Hub + Recorder。

---

## 2. 各 Slice 详细实现参考（旧 Step 代码）

> **注意**：以下为原水平分层计划的详细 Step 代码，保留作为实现参考。
> 开发顺序按上方 Slice 1-5 执行，各 Slice 对应的 Step 见 [1.4 旧 Step → 新 Slice 映射](#14-旧-step-新-slice-映射)。

### Step 1：项目骨架 + Hono Server（Week 1）

#### 目标

搭好 pnpm workspace 骨架，能 `pnpm dev` 启动 Hono server，浏览器访问 `GET /api/health` 返回 OK。

#### 1.1 仓库结构

```
modacs/
├── package.json              # workspace 根配置
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts          # 入口：启动 server
│   │   │   ├── application.ts    # Application 类（核心容器）
│   │   │   ├── config.ts         # 配置加载（环境变量）
│   │   │   ├── error.ts          # 统一错误处理
│   │   │   └── routes/
│   │   │       └── health.ts     # GET /api/health
│   │   └── drizzle.config.ts     # Drizzle 迁移配置
│   ├── ui/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts          # 导出布局和组件
│   │       └── App.tsx           # 前端入口
│   └── shared/
│       ├── package.json
│       └── src/
│           └── types.ts          # 共享类型定义
├── modules/                  # 业务模块（Step 8 开始填充）
└── modules-isolated/         # Podman 模块（Step 11 开始填充）
```

#### 1.2 核心代码

```typescript
// packages/core/src/application.ts

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { EventEmitter } from 'eventemitter3';

export class Application {
    hono: Hono;
    eventBus: EventEmitter;
    container: Map<string, any>;   // 服务容器（服务定位器）
    plugins: Map<string, Plugin> = new Map();

    constructor() {
        this.hono = new Hono();
        this.eventBus = new EventEmitter();
        this.container = new Map();

        this.hono.use('*', logger());
        this.hono.use('*', cors());
    }

    // 注册服务到容器
    registerService<T>(name: string, service: T): void {
        this.container.set(name, service);
    }

    // 从容器获取服务（类型安全）
    resolve<T>(name: string): T {
        const service = this.container.get(name);
        if (!service) {
            throw new Error(`Service "${name}" not registered`);
        }
        return service as T;
    }

    async listen(port: number): Promise<void> {
        console.log(`MODACS Core listening on :${port}`);
        this.hono.serve({ port });
    }
}
```

```typescript
// packages/core/src/index.ts

import { Application } from './application';
import { healthRoute } from './routes/health';

const app = new Application();

// 注册基础路由
app.hono.route('/api/health', healthRoute);

// 启动
const port = Number(process.env.MODACS_PORT ?? 3000);
app.listen(port);
```

```typescript
// packages/core/src/routes/health.ts

import { Hono } from 'hono';

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? '0.0.0',
    });
});
```

#### 1.3 配置

```typescript
// packages/core/src/config.ts

export interface Config {
    port: number;
    database: {
        host: string;
        port: number;
        user: string;
        password: string;
        name: string;
    };
    jwt: {
        secret: string;
        expiryHours: number;
    };
    dataDir: string;
}

export function loadConfig(): Config {
    return {
        port: Number(process.env.MODACS_PORT ?? 3000),
        database: {
            host: process.env.DB_HOST ?? 'localhost',
            port: Number(process.env.DB_PORT ?? 5432),
            user: process.env.DB_USER ?? 'modacs',
            password: process.env.DB_PASSWORD ?? 'modacs',
            name: process.env.DB_NAME ?? 'modacs',
        },
        jwt: {
            secret: process.env.JWT_SECRET ?? 'change-me-in-production',
            expiryHours: Number(process.env.JWT_EXPIRY_HOURS ?? 24),
        },
        dataDir: process.env.MODACS_DATA_DIR ?? './data',
    };
}
```

#### 1.4 交付标准

- [ ] `pnpm dev` 启动后端，`GET /api/health` 返回 `{"status":"ok"}`
- [ ] `pnpm test` 运行基础测试通过
- [ ] workspace 结构正确，`packages/core` 可独立引用 `packages/shared`

---

### Step 2：Plugin 基类 + PluginManager（Week 2）

#### 目标

实现插件系统核心：Plugin 基类、PluginManager、两阶段加载（`@hapi/topo` 拓扑排序）。

#### 2.1 新增文件

```
packages/core/src/
├── plugin.ts              # Plugin 抽象基类
├── plugin-manager.ts      # PluginManager（加载/卸载/排序）
└── container.ts           # 服务容器（类型安全的服务定位器）
```

#### 2.2 Plugin 基类

```typescript
// packages/core/src/plugin.ts

import type { Application } from './application';

export interface PluginMeta {
    name: string;
    version: string;
    depends: string[];
    autoInstall?: boolean;
}

export abstract class Plugin {
    app: Application;
    meta: PluginMeta;

    constructor(app: Application, meta: PluginMeta) {
        this.app = app;
        this.meta = meta;
    }

    // Phase 1：声明依赖、注册 Collection、声明事件
    async beforeLoad(): Promise<void> {}

    // Phase 2：注册路由、菜单、Field Interface（拓扑排序后执行）
    async load(): Promise<void> {}

    // 首次安装：数据库迁移、默认数据、权限
    async install(): Promise<void> {}

    // 版本升级：增量迁移
    async upgrade(_fromVersion: string): Promise<void> {}

    // 卸载前清理
    async beforeUninstall(): Promise<void> {}

    // 类型安全的服务获取
    protected resolve<T>(serviceName: string): T {
        return this.app.resolve<T>(serviceName);
    }
}
```

#### 2.3 PluginManager

```typescript
// packages/core/src/plugin-manager.ts

import { Plugin, type PluginMeta } from './plugin';
import type { Application } from './application';
import { Topo } from '@hapi/topo';

export class PluginManager {
    app: Application;
    private plugins: Map<string, Plugin> = new Map();
    private pluginConstructors: Map<string, { new(app: Application, meta: PluginMeta): Plugin; meta: PluginMeta }> = new Map();

    constructor(app: Application) {
        this.app = app;
    }

    // 注册插件构造器（afterAdd 阶段）
    add(name: string, ctor: { new(app: Application, meta: PluginMeta): Plugin }, meta: PluginMeta): void {
        if (this.pluginConstructors.has(name)) {
            throw new Error(`Plugin "${name}" already added`);
        }
        this.pluginConstructors.set(name, { new: ctor, meta });
        console.log(`[PluginManager] Plugin added: ${name} v${meta.version}`);
    }

    // 两阶段加载
    async loadAll(): Promise<void> {
        // 实例化所有插件
        for (const [name, { new: Ctor, meta }] of this.pluginConstructors) {
            const plugin = new Ctor(this.app, meta);
            this.plugins.set(name, plugin);
        }

        // Phase 1：所有插件同时执行 beforeLoad
        console.log('[PluginManager] Phase 1: beforeLoad');
        for (const [name, plugin] of this.plugins) {
            await plugin.beforeLoad();
            console.log(`[PluginManager] beforeLoad: ${name}`);
        }

        // Phase 2：拓扑排序后按依赖顺序执行 load
        console.log('[PluginManager] Phase 2: load (topological sort)');
        const sorted = this.topologicalSort();
        for (const name of sorted) {
            const plugin = this.plugins.get(name)!;
            await plugin.load();
            console.log(`[PluginManager] load: ${name}`);
        }
    }

    // 拓扑排序：根据 depends 字段排序
    private topologicalSort(): string[] {
        const nodes: { name: string; before: string[]; group: string }[] = [];

        for (const [name, { meta }] of this.pluginConstructors) {
            // 过滤掉未注册的依赖（允许依赖可选模块）
            const deps = meta.depends.filter(d => this.pluginConstructors.has(d));
            nodes.push({
                name,
                before: deps,   // 依赖项必须在我之前加载
                group: meta.depends.length === 0 ? 'root' : 'dependencies',
            });
        }

        const result = Topo(nodes, { sort: true });
        return result.map(n => n.name);
    }

    // 安装插件
    async install(name: string): Promise<void> {
        const plugin = this.plugins.get(name);
        if (!plugin) throw new Error(`Plugin "${name}" not loaded`);
        await plugin.install();
        console.log(`[PluginManager] Installed: ${name}`);
    }

    // 升级插件
    async upgrade(name: string, fromVersion: string): Promise<void> {
        const plugin = this.plugins.get(name);
        if (!plugin) throw new Error(`Plugin "${name}" not loaded`);
        await plugin.upgrade(fromVersion);
        console.log(`[PluginManager] Upgraded: ${name} from ${fromVersion}`);
    }

    // 卸载插件
    async uninstall(name: string): Promise<void> {
        const plugin = this.plugins.get(name);
        if (!plugin) throw new Error(`Plugin "${name}" not loaded`);
        await plugin.beforeUninstall();
        this.plugins.delete(name);
        this.pluginConstructors.delete(name);
        console.log(`[PluginManager] Uninstalled: ${name}`);
    }

    getPlugin<T extends Plugin>(name: string): T | undefined {
        return this.plugins.get(name) as T | undefined;
    }

    listPlugins(): PluginMeta[] {
        return Array.from(this.pluginConstructors.values()).map(v => v.meta);
    }
}
```

#### 2.4 集成到 Application

```typescript
// packages/core/src/application.ts（增量更新）

import { PluginManager } from './plugin-manager';

export class Application {
    hono: Hono;
    eventBus: EventEmitter;
    container: Map<string, any>;
    pluginManager: PluginManager;   // 新增

    constructor() {
        // ... 原有初始化 ...
        this.pluginManager = new PluginManager(this);
    }

    async start(): Promise<void> {
        // 加载所有插件
        await this.pluginManager.loadAll();

        // 启动 HTTP server
        const port = Number(process.env.MODACS_PORT ?? 3000);
        await this.listen(port);
    }
}
```

#### 2.5 测试插件

```typescript
// packages/core/src/plugins/base/index.ts（最小测试插件）

import { Plugin, type PluginMeta } from '../../plugin';
import type { Application } from '../../application';

const meta: PluginMeta = {
    name: 'base',
    version: '0.1.0',
    depends: [],
};

export class BasePlugin extends Plugin {
    async beforeLoad() {
        // 注册基础 Collection
        this.app.collection({
            name: 'users',
            fields: [
                { type: 'string', name: 'username', required: true, unique: true },
                { type: 'string', name: 'password_hash', required: true },
                { type: 'string', name: 'role', default: 'user' },
            ],
        });
    }

    async load() {
        // 注册健康检查路由
        this.app.hono.get('/api/base/info', (c) => {
            return c.json({ module: 'base', version: this.meta.version });
        });
    }

    async install() {
        console.log('[base] Installing...');
        // 创建默认 admin 用户等
    }
}
```

#### 2.6 交付标准

- [ ] BasePlugin 能被 PluginManager 加载
- [ ] 两阶段加载日志正确输出（beforeLoad → topo sort → load）
- [ ] 依赖排序正确：如果 B depends A，则 A 的 load 先于 B 执行
- [ ] `GET /api/base/info` 返回模块信息

---

### Step 3：ProcessManager + RPC Hub + Recorder（Week 3）

#### 目标

实现多进程插件隔离的核心基础设施：ProcessManager（子进程管理）、RPC Hub（UDS JSON-RPC 通信 + 事件广播）、Recorder（MCAP 旁路录制）。

**借鉴来源**：Grafana Plugin Manager（子进程 + 崩溃重启）、VS Code Extension Host（spawn + Proxy RPC）、Home Assistant Supervisor（Unix Socket IPC）、ROS2 rosbag2（MCAP 录制回放）。

#### 3.1 新增文件

```
packages/core/src/
├── process-manager.ts       # 子进程管理（spawn/监控/重启）
├── rpc/
│   ├── hub.ts               # RPC Hub（UDS 路由 + 事件广播）
│   ├── proxy.ts             # 透明 RPC 代理（Proxy + UDS fetch）
│   └── types.ts             # RPC 类型定义
├── event-router.ts          # 跨进程事件桥接
└── observability/
    ├── recorder.ts          # MCAP 旁路录制器
    ├── player.ts            # MCAP 回放器
    └── health-monitor.ts    # 进程健康监控
```

#### 3.2 ProcessManager

```typescript
// packages/core/src/process-manager.ts

import type { Application } from './application';
import { fork, type ChildProcess } from 'node:child_process';
import { unlink, stat } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from 'undici';  // UDS Agent（非 Bun http://unix: 模式）

interface ManagedProcess {
    name: string;
    proc: ChildProcess;
    socketPath: string;
    status: 'starting' | 'running' | 'crashed' | 'stopped';
    restartCount: number;
    lastExitCode: number | null;
}

export class ProcessManager {
    app: Application;
    private processes: Map<string, ManagedProcess> = new Map();

    constructor(app: Application) {
        this.app = app;
    }

    async startPlugin(name: string, entryFile: string): Promise<void> {
        const socketPath = `/tmp/modacs-${name}.sock`;

        // 清理旧 socket
        try { await unlink(socketPath); } catch {}

        const proc = fork(entryFile, [], {
            env: {
                MODACS_PLUGIN_NAME: name,
                MODACS_SOCKET_PATH: socketPath,
                DATABASE_URL: process.env.DATABASE_URL,
                ZENOH_ENDPOINT: process.env.ZENOH_ENDPOINT ?? 'tcp/127.0.0.1:7447',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const managed: ManagedProcess = {
            name, proc, socketPath,
            status: 'starting',
            restartCount: 0,
            lastExitCode: null,
        };

        // 监听退出 → 自动重启（指数退避）
        proc.on('exit', (code) => {
            console.log(`[ProcessManager] ${name} exited with code ${code}`);
            managed.status = 'crashed';
            managed.lastExitCode = code;

            if (managed.restartCount < 5) {
                const delay = Math.min(1000 * Math.pow(2, managed.restartCount), 30000);
                managed.restartCount++;
                console.log(`[ProcessManager] Restarting ${name} in ${delay}ms (attempt ${managed.restartCount})`);
                setTimeout(() => this.startPlugin(name, entryFile), delay);
            } else {
                console.error(`[ProcessManager] ${name} exceeded max restart attempts`);
            }
        });

        // 等待 UDS 就绪
        await this.waitForSocket(socketPath, 5000);
        managed.status = 'running';
        managed.restartCount = 0;
        this.processes.set(name, managed);
        console.log(`[ProcessManager] ${name} running on ${socketPath}`);
    }

    async stopPlugin(name: string): Promise<void> {
        const managed = this.processes.get(name);
        if (!managed) return;
        managed.proc.kill('SIGTERM');
        setTimeout(() => {
            if (managed.status !== 'stopped') {
                managed.proc.kill('SIGKILL');
            }
        }, 10000);
    }

    async healthCheck(name: string): Promise<boolean> {
        const managed = this.processes.get(name);
        if (!managed || managed.status !== 'running') return false;
        try {
            // undici Agent: UDS 连接（非 Bun http://unix: 模式）
            const client = new Client('http://localhost', { connect: { socketPath: managed.socketPath } });
            const res = await client.request({ method: 'GET', path: '/health' });
            client.close();
            return res.statusCode === 200;
        } catch {
            return false;
        }
    }

    getSocketPath(name: string): string | undefined {
        return this.processes.get(name)?.socketPath;
    }

    listProcesses(): ManagedProcess[] {
        return Array.from(this.processes.values());
    }

    private async waitForSocket(path: string, timeoutMs: number): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                await stat(path);
                return;
            } catch {
                await sleep(100);
            }
        }
        throw new Error(`Socket ${path} not ready within ${timeoutMs}ms`);
    }
}
```

#### 3.3 RPC Hub（UDS JSON-RPC + 事件广播）

```typescript
// packages/core/src/rpc/hub.ts

import type { Application } from '../application';
import type { Recorder } from '../observability/recorder';
import { Client } from 'undici';
import type { RpcResponse } from './protocol';

export class RpcHub {
    app: Application;
    recorder: Recorder | null = null;

    // RPC：调用子进程的服务方法
    async call<T = any>(plugin: string, service: string, method: string, args: any[]): Promise<T> {
        const socketPath = this.app.processManager.getSocketPath(plugin);
        if (!socketPath) throw new Error(`Plugin "${plugin}" not running`);

        const topic = `${service}.${method}`;
        const start = performance.now();

        // 旁路录制：请求
        this.recorder?.record(topic, { plugin, args, direction: 'out' });

        // undici Agent: UDS JSON-RPC 调用（非 Bun http://unix: 模式）
        const client = new Client('http://localhost', { connect: { socketPath } });
        const response = await client.request({
            method: 'POST',
            path: '/',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: `${service}.${method}`, params: args, id: Date.now().toString(36) }),
        });

        const body = await response.body.json() as RpcResponse;
        client.close();

        if (body.error) {
            this.recorder?.record(topic, { plugin, error: body.error, direction: 'in' });
            throw new Error(`RPC ${topic} failed: ${body.error.message}`);
        }

        const result = body.result as T;
        const elapsed = performance.now() - start;

        // 旁路录制：响应
        this.recorder?.record(topic, { plugin, result, elapsedMs: elapsed, direction: 'in' });

        return result;
    }

    // 事件广播：转发到所有子进程
    async emit(event: string, data: any, source?: string): Promise<void> {
        // 旁路录制
        this.recorder?.record(event, { source, data, direction: 'event' });

        // 广播到所有子进程（除来源）— undici Agent 非阻塞
        for (const [name, proc] of this.app.processManager.processes) {
            if (name !== source) {
                try {
                    const client = new Client('http://localhost', { connect: { socketPath: proc.socketPath } });
                    client.request({
                        method: 'POST',
                        path: '/',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { event, data, source } }),
                    }).finally(() => client.close());
                } catch (e) {
                    // 子进程可能暂时不可用，不阻塞事件广播
                    console.warn(`[RpcHub] Failed to deliver event to ${name}:`, e);
                }
            }
        }
    }
}
```

#### 3.4 透明 RPC 代理

```typescript
// packages/core/src/rpc/proxy.ts

export function createRpcProxy<T>(hub: RpcHub, pluginName: string, serviceName: string): T {
    return new Proxy({} as T, {
        get: (_, method: string) => {
            return async (...args: any[]) => {
                return hub.call(pluginName, serviceName, method, args);
            };
        },
    });
}
```

#### 3.5 MCAP 旁路录制器

```typescript
// packages/core/src/observability/recorder.ts

import { McapWriter } from '@mcap/core';
import { createWriteStream } from 'node:fs';

export class Recorder {
    private writer: McapWriter | null = null;
    private channels: Map<string, number> = new Map();
    private recording: boolean = false;

    async start(outputPath: string): Promise<void> {
        const stream = createWriteStream(outputPath);

        this.writer = new McapWriter({
            writable: {
                write: (data: Uint8Array) => { stream.write(data); return Promise.resolve(); },
            },
        });

        await this.writer.open({ profile: 'modacs', library: 'modacs-core/0.1' });
        this.recording = true;
        console.log(`[Recorder] Recording to ${outputPath}`);
    }

    async stop(): Promise<void> {
        if (!this.recording || !this.writer) return;
        this.recording = false;
        await this.writer.close();
        console.log('[Recorder] Stopped');
    }

    isRecording(): boolean { return this.recording; }

    async record(topic: string, payload: unknown, direction: string): Promise<void> {
        if (!this.recording || !this.writer) return;

        let channelId = this.channels.get(topic);
        if (channelId === undefined) {
            const channel = await this.writer.registerChannel({
                topic, messageEncoding: 'json',
                schema: '{"type":"object"}',
            });
            channelId = channel.id;
            this.channels.set(topic, channelId);
        }

        const now = BigInt(Date.now()) * 1_000_000n;
        const data = new TextEncoder().encode(JSON.stringify({ direction, payload }));

        await this.writer.writeMessage({
            channelId,
            data,
            timestamp: { sec: Number(now / 1_000_000_000n), nsec: Number(now % 1_000_000_000n) },
        });
    }
}
```

#### 3.6 子进程侧入口模板

```typescript
// modules/_template/process.ts（每个子进程的入口模板）

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// 1. 连接数据库
const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

// 2. 初始化本地 Application（子进程内部）
const app = new Application(db);
// 加载本插件的 Plugin
await app.pluginManager.loadAll();

// 3. UDS 端点
const hono = new Hono();

// 健康检查
hono.get('/health', (c) => c.json({ status: 'ok', plugin: process.env.MODACS_PLUGIN_NAME }));

// RPC 端点
hono.post('/rpc/:service/:method', async (c) => {
    const { service, method } = c.req.param();
    const { args } = await c.req.json();
    const svc = app.container.resolve(service);
    const result = await svc[method](...args);
    return c.json(result);
});

// 事件接收端点
hono.post('/event', async (c) => {
    const { event, data, source } = await c.req.json();
    // 转发到本地 EventEmitter
    app.eventBus.emit(event, data);
    return c.json({ ok: true });
});

// Resource Manager CRUD 端点
hono.all('/api/:collection\\::action', async (c) => {
    return app.resourcer.handle(c.req.param('collection'), c.req.param('action'), c.req.raw);
});

// 4. 监听 UDS（@hono/node-server 支持 serverOptions.path）
const socketPath = process.env.MODACS_SOCKET_PATH!;
import { createServer } from 'node:http';
createServer(hono.fetch).listen(socketPath);
console.log(`[${process.env.MODACS_PLUGIN_NAME}] Running on ${socketPath}`);
```

#### 3.7 集成到 Application

```typescript
// packages/core/src/application.ts（增量更新）

export class Application {
    // ... 原有字段 ...
    processManager: ProcessManager;
    rpcHub: RpcHub;
    recorder: Recorder;

    constructor(db: DB) {
        // ...
        this.processManager = new ProcessManager(this);
        this.rpcHub = new RpcHub(this);
        this.recorder = new Recorder();
        this.rpcHub.recorder = this.recorder;
    }

    // resolve 改为返回 RPC Proxy（对 process 隔离的插件）
    resolve<T>(serviceName: string): T {
        const pluginName = serviceName.split(':')[0];
        const meta = this.pluginManager.getPluginMeta(pluginName);

        if (meta?.isolation === 'inline' || !meta?.isolation) {
            // 内联模块：直接返回实例
            return this.container.resolve<T>(serviceName);
        }

        // 独立进程模块：返回 RPC Proxy
        return createRpcProxy<T>(this.rpcHub, pluginName, serviceName);
    }

    // eventBus.emit 改为通过 RPC Hub 广播
    get eventBus() {
        return {
            emit: (event: string, data: any) => this.rpcHub.emit(event, data, process.env.MODACS_PLUGIN_NAME),
            on: (event: string, handler: Function) => this.localEventBus.on(event, handler),
        };
    }

    async start() {
        await this.pluginManager.loadAll();

        // 启动需要独立进程的插件
        for (const [name, plugin] of this.pluginManager.plugins) {
            if (plugin.meta.isolation === 'process') {
                await this.processManager.startPlugin(name, plugin.entryFile);
            }
        }

        // 恢复中断的工作流
        await this.workflowEngine.recoverInterrupted();

        await this.listen(port);
    }
}
```

#### 3.8 交付标准

- [ ] ProcessManager 能 spawn 子进程，等待 UDS 就绪
- [ ] 子进程崩溃后自动重启（指数退避）
- [ ] `rpcHub.call()` 能通过 UDS 调用子进程的服务方法
- [ ] `resolve<T>()` 返回 Proxy，调用方式和直接实例一样
- [ ] `eventBus.emit()` 能跨进程广播事件
- [ ] `eventBus.on()` 能接收跨进程事件
- [ ] Recorder 能旁路录制 RPC + 事件到 MCAP 文件
- [ ] `GET /api/recordings/start` 开始录制，`/stop` 停止
- [ ] 生成的 MCAP 文件能用 Foxglove Studio 打开
- [ ] 健康检查 API 正常工作

#### 参考项目

- **Grafana**: `pkg/plugins/backendplugin/` — 子进程 + gRPC + 崩溃重启
- **HashiCorp go-plugin**: `client.go` — 子进程 + RPC + 生命周期管理
- **VS Code**: `extensionHostStarter.ts` — spawn + parent PID 监控
- **Home Assistant**: PR #6590 — Unix Socket 替代 TCP 的理由
- **ROS2 rosbag2**: MCAP 录制回放设计

---

### Step 4：Drizzle + Collection 定义（Week 4）

#### 目标

集成 Drizzle ORM + PostgreSQL，实现 Collection 定义机制（模块声明数据模型）。

#### 3.1 新增文件

```
packages/core/src/
├── db/
│   ├── client.ts           # Drizzle 客户端
│   ├── schema-registry.ts  # Collection 注册表
│   └── migrate.ts          # 迁移执行
└── collection.ts           # Collection 定义接口
```

#### 3.2 数据库客户端

```typescript
// packages/core/src/db/client.ts

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type DB = PostgresJsDatabase;

export function createDatabase(config: { host: string; port: number; user: string; password: string; name: string }) {
    const client = postgres({
        host: config.host,
        port: config.port,
        username: config.user,
        password: config.password,
        database: config.name,
    });

    const db = drizzle(client);
    return { db, client };
}
```

#### 3.3 Collection 定义

```typescript
// packages/core/src/collection.ts

import { pgTable, pgSchema, varchar, integer, boolean, timestamp, json, text } from 'drizzle-orm/pg-core';
import type { DB } from './db/client';

export interface FieldDefinition {
    type: 'string' | 'text' | 'integer' | 'float' | 'boolean' | 'date' | 'datetime' | 'enum' | 'json' | 'belongsTo' | 'hasMany' | 'manyToMany';
    name: string;
    required?: boolean;
    unique?: boolean;
    default?: any;
    values?: string[];          // enum 类型
    target?: string;            // 关联类型
    label?: string;             // 显示名
    interface?: string;         // Field Interface 名（Step 5）
}

export interface CollectionDefinition {
    name: string;               // 表名（如 mes_work_orders）
    schema?: string;            // PG schema（默认 public）
    fields: FieldDefinition[];
    timestamps?: boolean;       // 自动加 created_at / updated_at（默认 true）
}

// Collection 注册表
export class CollectionRegistry {
    private collections: Map<string, { def: CollectionDefinition; table: any }> = new Map();

    define(def: CollectionDefinition): any {
        // 将 FieldDefinition 转换为 Drizzle pgTable 定义
        const columns: Record<string, any> = {};

        for (const field of def.fields) {
            columns[field.name] = mapFieldToColumn(field);
        }

        if (def.timestamps !== false) {
            columns.created_at = timestamp('created_at').defaultNow().notNull();
            columns.updated_at = timestamp('updated_at').defaultNow().notNull();
        }

        const schemaName = def.schema ?? 'public';
        const pgSchemaObj = schemaName === 'public' ? undefined : pgSchema(schemaName);

        const table = pgSchemaObj
            ? pgSchemaObj.table(def.name, columns)
            : pgTable(def.name, columns);

        this.collections.set(def.name, { def, table });
        return table;
    }

    get(name: string) {
        return this.collections.get(name);
    }

    list() {
        return Array.from(this.collections.values()).map(v => v.def);
    }
}

// FieldDefinition → Drizzle column 映射
function mapFieldToColumn(field: FieldDefinition) {
    let col: any;

    switch (field.type) {
        case 'string':
            col = varchar(field.name, { length: 255 });
            break;
        case 'text':
            col = text(field.name);
            break;
        case 'integer':
            col = integer(field.name);
            break;
        case 'float':
            col = integer(field.name);  // 实际用 numeric，简化示例
            break;
        case 'boolean':
            col = boolean(field.name);
            break;
        case 'enum':
            // 需要 pgEnum，此处简化
            col = varchar(field.name, { length: 100 });
            break;
        case 'json':
            col = json(field.name);
            break;
        case 'belongsTo':
            col = integer(field.name);  // 外键 ID
            break;
        case 'date':
        case 'datetime':
            col = timestamp(field.name);
            break;
        default:
            col = text(field.name);
    }

    if (field.required) col = col.notNull();
    if (field.unique) col = col.unique();
    if (field.default !== undefined) col = col.default(field.default);

    return col;
}
```

#### 3.4 集成到 Application

```typescript
// packages/core/src/application.ts（增量更新）

export class Application {
    // ... 原有字段 ...
    collections: CollectionRegistry;
    db: DB;

    constructor(db: DB) {
        // ... 原有初始化 ...
        this.db = db;
        this.collections = new CollectionRegistry();
    }

    // 模块调用此方法定义数据模型
    collection(def: CollectionDefinition): any {
        return this.collections.define(def);
    }
}
```

#### 3.5 迁移机制

```typescript
// packages/core/src/db/migrate.ts

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function runMigrations(config: DatabaseConfig, migrationsFolder: string) {
    const client = postgres(config);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    console.log(`[DB] Migrations applied from ${migrationsFolder}`);
    await client.end();
}
```

每个模块有自己的 `migrations/` 目录，安装时自动执行：

```
modules/mes/
├── manifest.yaml
├── migrations/
│   ├── 0001_init.sql      # 初始表结构
│   ├── 0002_add_bom.sql   # 增量
│   └── meta/              # Drizzle 迁移元数据
└── src/
```

#### 3.6 交付标准

- [ ] PostgreSQL 连接成功，Drizzle 客户端可用
- [ ] 模块可以通过 `app.collection()` 定义数据模型
- [ ] Collection 定义能生成 Drizzle 表对象
- [ ] `pnpm db:migrate` 能执行迁移脚本
- [ ] BasePlugin 的 `users` Collection 在 PG 中创建成功

---

### Step 5：Resource Manager（Week 5-6）

#### 目标

实现 Resource Manager：Collection 定义自动生成 CRUD REST API，不需手写路由。

#### 4.1 新增文件

```
packages/core/src/
├── resourcer/
│   ├── index.ts            # ResourceManager
│   ├── resource.ts         # Resource 类（单个 Collection 的 CRUD）
│   └── filter-parser.ts    # 查询参数 → SQL filter 解析
```

#### 4.2 ResourceManager

```typescript
// packages/core/src/resourcer/index.ts

import { Hono } from 'hono';
import { eq, and, like, gt, lt, isNull, desc, asc, count } from 'drizzle-orm';
import type { Application } from '../application';
import type { CollectionRegistry } from '../collection';

export class ResourceManager {
    app: Application;
    hono: Hono;   // 挂载到 /api 下的子路由

    constructor(app: Application) {
        this.app = app;
        this.hono = new Hono();
        this.registerAll();
    }

    // 为所有已注册的 Collection 自动生成 CRUD 路由
    private registerAll() {
        for (const def of this.app.collections.list()) {
            this.registerResource(def.name);
        }
    }

    registerResource(collectionName: string) {
        const { table } = this.app.collections.get(collectionName)!;
        const prefix = `/api/${collectionName}`;

        // GET /api/{collection}:list — 列表查询
        this.hono.get(`${prefix}:list`, async (c) => {
            const { page = '1', pageSize = '20', sort, filter, fields } = c.req.query();

            const offset = (Number(page) - 1) * Number(pageSize);
            const limit = Number(pageSize);

            let query = this.app.db.select().from(table).$dynamic();

            // 应用过滤（简化版，实际需要 filter-parser）
            // filter 格式示例：filter.byStatus=active&filter.byProductId=123

            // 应用排序
            if (sort) {
                const [field, order] = sort.split(':');
                query = order === 'desc' ? query.orderBy(desc(table[field])) : query.orderBy(asc(table[field]));
            }

            const data = await query.limit(limit).offset(offset);
            const total = await this.app.db.select({ count: count() }).from(table);

            return c.json({ data, total: total[0].count, page: Number(page), pageSize: limit });
        });

        // GET /api/{collection}:get — 单条查询
        this.hono.get(`${prefix}:get`, async (c) => {
            const { filter } = c.req.query();
            // 简化：按 ID 查询
            const id = c.req.query('filter.byId');
            if (id) {
                const result = await this.app.db.select().from(table).where(eq(table.id, Number(id)));
                if (result.length === 0) return c.json({ error: 'Not found' }, 404);
                return c.json({ data: result[0] });
            }
            return c.json({ error: 'filter.byId required' }, 400);
        });

        // POST /api/{collection}:create — 创建
        this.hono.post(`${prefix}:create`, async (c) => {
            const body = await c.req.json();
            const result = await this.app.db.insert(table).values(body).returning();
            return c.json({ data: result[0] }, 201);
        });

        // PUT /api/{collection}:update — 更新
        this.hono.put(`${prefix}:update`, async (c) => {
            const id = c.req.query('filter.byId');
            const body = await c.req.json();
            if (!id) return c.json({ error: 'filter.byId required' }, 400);
            const result = await this.app.db.update(table).set(body).where(eq(table.id, Number(id))).returning();
            if (result.length === 0) return c.json({ error: 'Not found' }, 404);
            return c.json({ data: result[0] });
        });

        // DELETE /api/{collection}:destroy — 删除
        this.hono.delete(`${prefix}:destroy`, async (c) => {
            const id = c.req.query('filter.byId');
            if (!id) return c.json({ error: 'filter.byId required' }, 400);
            await this.app.db.delete(table).where(eq(table.id, Number(id)));
            return c.json({ success: true });
        });

        console.log(`[ResourceManager] Registered CRUD routes for ${collectionName}`);
    }

    // 模块 afterLoad 后可能新增 Collection，需要重新注册
    refresh() {
        this.hono = new Hono();
        this.registerAll();
    }
}
```

#### 4.3 集成到 Application

```typescript
// packages/core/src/application.ts（增量更新）

export class Application {
    // ... 原有字段 ...
    resourcer: ResourceManager;

    constructor(db: DB) {
        // ...
        this.resourcer = new ResourceManager(this);
    }

    async start() {
        await this.pluginManager.loadAll();

        // 插件加载完后，重新刷新 Resource Manager 路由
        this.resourcer.refresh();

        // 挂载 Resource Manager 路由
        this.hono.route('/api', this.resourcer.hono);

        await this.listen(port);
    }

    // 模块定义 Collection 后通知 Resourcer
    collection(def: CollectionDefinition): any {
        const table = this.collections.define(def);
        this.resourcer.registerResource(def.name);
        return table;
    }
}
```

#### 4.4 测试

```bash
# 假设 base 模块定义了 users Collection

# 自动生成的 API：
curl http://localhost:3000/api/users:list?page=1&pageSize=10
curl http://localhost:3000/api/users:get?filter.byId=1
curl -X POST http://localhost:3000/api/users:create -d '{"username":"admin","password_hash":"..."}'
curl -X PUT http://localhost:3000/api/users:update?filter.byId=1 -d '{"role":"admin"}'
curl -X DELETE http://localhost:3000/api/users:destroy?filter.byId=1
```

#### 4.5 交付标准

- [ ] 定义 Collection 后自动生成 5 个 CRUD 端点
- [ ] 列表查询支持分页（page, pageSize）
- [ ] 列表查询支持排序（sort=field:desc）
- [ ] 创建/更新/删除操作返回操作结果
- [ ] 不存在的 Collection 返回 404

---

### Step 6：Field Interface + ACL（Week 7-8）

#### 目标

实现 Field Interface（语义类型 → DB + Zod + React 三层映射）和 ACL（策略模板 + 运行时过滤注入）。

#### 5.1 Field Interface

```typescript
// packages/core/src/field-interface/index.ts

import { z } from 'zod';
import type { ComponentType } from 'react';

export interface FieldInterfaceDefinition {
    // 数据库列类型映射
    column: {
        type: string;
        precision?: number;
        scale?: number;
        length?: number;
    };
    // Zod 校验
    validate: z.ZodType;
    // React 编辑组件
    editor?: ComponentType<any>;
    // React 展示组件
    viewer?: ComponentType<any>;
    // 默认值
    defaultValue?: any;
}

export class FieldInterfaceRegistry {
    private interfaces: Map<string, FieldInterfaceDefinition> = new Map();

    register(name: string, def: FieldInterfaceDefinition) {
        this.interfaces.set(name, def);
        console.log(`[FieldInterface] Registered: ${name}`);
    }

    get(name: string): FieldInterfaceDefinition | undefined {
        return this.interfaces.get(name);
    }

    // 获取 Zod schema 用于 API 请求校验
    getValidator(name: string): z.ZodType {
        return this.interfaces.get(name)?.validate ?? z.any();
    }

    list() {
        return Array.from(this.interfaces.entries()).map(([name, def]) => ({ name, ...def }));
    }
}

// 内置 Field Interface 注册
export function registerBuiltinInterfaces(registry: FieldInterfaceRegistry) {
    registry.register('string', {
        column: { type: 'varchar', length: 255 },
        validate: z.string(),
    });

    registry.register('text', {
        column: { type: 'text' },
        validate: z.string(),
    });

    registry.register('integer', {
        column: { type: 'integer' },
        validate: z.number().int(),
        defaultValue: 0,
    });

    registry.register('boolean', {
        column: { type: 'boolean' },
        validate: z.boolean(),
        defaultValue: false,
    });

    registry.register('money', {
        column: { type: 'numeric', precision: 12, scale: 2 },
        validate: z.number().nonnegative(),
        defaultValue: 0,
    });

    registry.register('datetime', {
        column: { type: 'timestamp' },
        validate: z.string().datetime().or(z.date()),
    });

    registry.register('email', {
        column: { type: 'varchar', length: 255 },
        validate: z.string().email(),
    });
}
```

#### 5.2 ACL

```typescript
// packages/core/src/acl/index.ts

import type { Application } from '../application';

export type Strategy = 'all' | 'own' | 'readonly' | 'department';

export interface AclRule {
    strategy: Strategy;
    actions: ('list' | 'get' | 'create' | 'update' | 'destroy')[];
    fields?: {
        include?: string[];
        exclude?: string[];
    };
}

export interface AclRole {
    name: string;
    rules: Record<string, AclRule>;  // collectionName → rule
}

export class ACL {
    app: Application;
    private roles: Map<string, AclRole> = new Map();

    constructor(app: Application) {
        this.app = app;
    }

    defineRole(name: string, rules: Record<string, AclRule>) {
        this.roles.set(name, { name, rules });
        console.log(`[ACL] Role defined: ${name}`);
    }

    getRole(name: string): AclRole | undefined {
        return this.roles.get(name);
    }

    // 检查权限
    can(user: { role: string; id: number }, action: string, collection: string): boolean {
        const role = this.roles.get(user.role);
        if (!role) return false;

        const rule = role.rules[collection];
        if (!rule) return false;

        return rule.actions.includes(action as any);
    }

    // 生成运行时 filter（注入到查询中）
    getFilter(user: { role: string; id: number }, collection: string): Record<string, any> | null {
        const role = this.roles.get(user.role);
        if (!role) return null;

        const rule = role.rules[collection];
        if (!rule) return null;

        switch (rule.strategy) {
            case 'own':
                return { created_by: user.id };
            case 'department':
                return { department_id: user.departmentId };
            case 'all':
            case 'readonly':
                return null;  // 无额外过滤
        }
    }

    // 字段级过滤
    filterFields(user: { role: string }, collection: string, data: Record<string, any>): Record<string, any> {
        const role = this.roles.get(user.role);
        if (!role) return data;

        const rule = role.rules[collection];
        if (!rule?.fields) return data;

        const filtered = { ...data };

        if (rule.fields.exclude) {
            for (const field of rule.fields.exclude) {
                delete filtered[field];
            }
        }

        if (rule.fields.include) {
            const allowed = new Set(rule.fields.include);
            for (const key of Object.keys(filtered)) {
                if (!allowed.has(key)) delete filtered[key];
            }
        }

        return filtered;
    }
}
```

#### 5.3 集成到 Application + Resource Manager

```typescript
// ResourceManager 修改：在 CRUD 操作中加入 ACL 检查

// 列表查询加入 ACL filter
this.hono.get(`${prefix}:list`, async (c) => {
    const user = c.get('user');  // JWT 中间件注入（Step 6）

    // ACL 检查
    if (!this.app.acl.can(user, 'list', collectionName)) {
        return c.json({ error: 'Forbidden' }, 403);
    }

    // 注入运行时 filter
    const aclFilter = this.app.acl.getFilter(user, collectionName);

    // ... 构建查询，合并 aclFilter ...
    let query = this.app.db.select().from(table).$dynamic();
    if (aclFilter) {
        // 应用 ACL filter
        for (const [key, value] of Object.entries(aclFilter)) {
            query = query.where(eq(table[key], value));
        }
    }

    const data = await query.limit(limit).offset(offset);

    // 字段级过滤
    const filteredData = data.map(row =>
        this.app.acl.filterFields(user, collectionName, row)
    );

    return c.json({ data: filteredData, total, page, pageSize });
});
```

#### 5.4 交付标准

- [ ] 内置 7 种 Field Interface 可用
- [ ] 模块可注册自定义 Field Interface
- [ ] ACL 可定义角色策略
- [ ] `can()` 正确判断操作权限
- [ ] `getFilter()` 正确生成运行时过滤条件
- [ ] `filterFields()` 正确过滤敏感字段
- [ ] Resource Manager 的 CRUD 操作集成了 ACL 检查

---

### Step 7：工作流引擎 — DAG + 中断恢复（Week 9-10）

#### 目标

实现平台内置 DAG 工作流引擎，支持节点编排、条件分支、人工任务中断/恢复、执行状态持久化。为 OA 审批、MES 生产流程编排提供统一能力。

**借鉴来源**：n8n（DAG 执行器 + 执行恢复）、Coze（中断恢复 + State 管理）、Dify（YAML DSL + 变量作用域）

#### 6.1 新增文件

```
packages/core/src/
├── workflow/
│   ├── index.ts              # WorkflowEngine 入口
│   ├── engine.ts             # DAG 执行器（栈 + 等待队列，借鉴 n8n）
│   ├── state.ts              # WorkflowState（状态管理 + 序列化，借鉴 Coze）
│   ├── interrupt.ts          # InterruptError + 恢复机制（借鉴 Coze）
│   ├── node-types/
│   │   ├── action.ts         # 调用模块服务（container.resolve）
│   │   ├── condition.ts      # 条件分支
│   │   ├── human_task.ts     # 人工任务（中断/恢复）
│   │   ├── delay.ts          # 延迟/定时
│   │   ├── merge.ts          # 多输入合并
│   │   ├── loop.ts           # 循环/批处理（子 DAG）
│   │   └── code.ts           # 自定义代码
│   ├── parser.ts             # YAML DSL → WorkflowDefinition
│   └── recovery.ts           # 执行恢复（借鉴 n8n ExecutionRecoveryService）
```

#### 6.2 DAG 执行器（借鉴 n8n WorkflowExecute）

```typescript
// packages/core/src/workflow/engine.ts

import type { Application } from '../application';

export interface WorkflowDefinition {
    name: string;
    version: number;
    trigger: { type: 'event' | 'schedule' | 'manual'; event?: string };
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
}

export interface WorkflowNode {
    id: string;
    type: NodeType;
    config: Record<string, any>;
    next?: string[];
}

export interface WorkflowConnection {
    from: string;
    to: string;
    outputIndex?: number;
}

type NodeType = 'trigger' | 'action' | 'condition' | 'merge' | 'delay' | 'human_task' | 'loop' | 'code';

export class WorkflowEngine {
    app: Application;
    private nodeHandlers: Map<NodeType, NodeHandler> = new Map();

    constructor(app: Application) {
        this.app = app;
        this.registerBuiltinNodes();
    }

    private registerBuiltinNodes() {
        this.nodeHandlers.set('action', new ActionNodeHandler(this.app));
        this.nodeHandlers.set('condition', new ConditionNodeHandler());
        this.nodeHandlers.set('human_task', new HumanTaskNodeHandler());
        this.nodeHandlers.set('delay', new DelayNodeHandler());
        this.nodeHandlers.set('merge', new MergeNodeHandler());
        this.nodeHandlers.set('loop', new LoopNodeHandler(this));
        this.nodeHandlers.set('code', new CodeNodeHandler());
    }

    // 主执行循环（借鉴 n8n processRunExecutionData）
    async execute(definition: WorkflowDefinition, triggerData: any): Promise<ExecutionResult> {
        const state = new WorkflowState();
        state.set('trigger', triggerData);

        // 找到起始节点
        const startNode = this.findTriggerNode(definition);
        const stack: ExecutionStackItem[] = [{ nodeId: startNode.id, data: triggerData }];
        const waiting: Map<string, WaitingInput> = new Map();

        while (stack.length > 0) {
            const item = stack.pop()!;
            const node = definition.nodes.find(n => n.id === item.nodeId);
            if (!node) continue;

            // 检查多输入是否就绪（merge 节点等）
            if (this.needsAllInputs(node, definition)) {
                const inputs = this.collectInputs(node, definition, state, waiting);
                if (inputs === null) {
                    this.addToWaiting(waiting, node, item);
                    continue;
                }
                item.data = inputs;
            }

            try {
                // 执行节点
                const handler = this.nodeHandlers.get(node.type)!;
                const result = await handler.execute(node, item.data, state);

                // 记录节点输出到 state
                state.setNodeOutput(node.id, result.outputs);

                // 触发钩子
                await this.app.eventBus.emit('workflow.node_executed', {
                    nodeId: node.id, workflowName: definition.name,
                });

                // 路由输出到下游节点
                const downstream = this.getDownstream(definition, node, result);
                for (const target of downstream) {
                    stack.push({ nodeId: target.nodeId, data: target.data });
                }

            } catch (err) {
                if (err instanceof InterruptError) {
                    // 人工任务中断：持久化状态，暂停执行
                    await this.persistInterrupt(definition, state, node, err);
                    return { status: 'paused', executionId: err.executionId, state };
                }
                // 其他错误：记录失败
                state.set('error', { nodeId: node.id, message: err.message });
                return { status: 'failed', state };
            }
        }

        return { status: 'completed', state };
    }

    // 从断点恢复执行（借鉴 Coze Interrupt & Resume）
    async resume(executionId: string, resumeData: any): Promise<ExecutionResult> {
        const execution = await this.loadExecution(executionId);
        const definition = await this.loadDefinition(execution.definitionId);
        const state = WorkflowState.deserialize(execution.state);

        // 从中断节点的下游继续执行
        const interruptNode = definition.nodes.find(n => n.id === execution.currentNodeId)!;
        const downstream = this.getDownstream(definition, interruptNode, { outputs: [resumeData] });

        const stack: ExecutionStackItem[] = downstream.map(d => ({ nodeId: d.nodeId, data: d.data }));

        // 继续主循环（与 execute 相同的逻辑）
        return await this.processStack(definition, stack, state, executionId);
    }

    // 启动时恢复中断的执行（借鉴 n8n ExecutionRecoveryService）
    async recoverInterrupted(): Promise<void> {
        const stuck = await this.app.db.select()
            .from(workflowExecutions)
            .where(eq(workflowExecutions.status, 'running'));

        for (const exec of stuck) {
            console.log(`[WorkflowEngine] Recovering execution ${exec.id}`);
            // 超时的运行中执行标记为需要人工干预
            await this.markAsNeedsAttention(exec.id);
        }
    }

    // 部分执行（借鉴 n8n runPartialWorkflow，用于调试）
    async executePartial(
        definition: WorkflowDefinition,
        startNodeId: string,
        mockInputs: Record<string, any>
    ): Promise<ExecutionResult> {
        const state = new WorkflowState();
        // 用 mock 数据填充上游节点输出
        for (const [nodeId, data] of Object.entries(mockInputs)) {
            state.setNodeOutput(nodeId, [data]);
        }
        const stack: ExecutionStackItem[] = [{ nodeId: startNodeId, data: mockInputs }];
        return await this.processStack(definition, stack, state, 'partial');
    }

    private async processStack(
        definition: WorkflowDefinition,
        stack: ExecutionStackItem[],
        state: WorkflowState,
        executionId: string
    ): Promise<ExecutionResult> {
        // ... 与 execute 主循环相同的逻辑，但复用 ...
        // （实际实现中提取为公共方法）
        return { status: 'completed', state };
    }
}
```

#### 6.3 中断恢复（借鉴 Coze）

```typescript
// packages/core/src/workflow/interrupt.ts

export class InterruptError extends Error {
    nodeId: string;
    workflowId: string;
    stateSnapshot: string;
    resumeCondition: ResumeCondition;

    constructor(opts: {
        nodeId: string;
        workflowId: string;
        state: WorkflowState;
        resumeCondition: ResumeCondition;
    }) {
        super('Workflow interrupted: awaiting external input');
        this.name = 'InterruptError';
        this.nodeId = opts.nodeId;
        this.workflowId = opts.workflowId;
        this.stateSnapshot = opts.state.serialize();
        this.resumeCondition = opts.resumeCondition;
    }
}

export interface ResumeCondition {
    type: 'approval' | 'input' | 'schedule' | 'webhook';
    approverId?: string;
    approverRole?: string;
    timeoutHours?: number;
    webhookUrl?: string;
}

// HumanTask 节点处理器
class HumanTaskNodeHandler implements NodeHandler {
    async execute(node: WorkflowNode, inputs: any, state: WorkflowState): Promise<NodeResult> {
        // 人工任务不立即执行，而是抛出中断
        throw new InterruptError({
            nodeId: node.id,
            workflowId: state.workflowId,
            state,
            resumeCondition: {
                type: 'approval',
                approverRole: node.config.approverRole,
                timeoutHours: node.config.timeoutHours ?? 72,
            },
        });
    }
}
```

#### 6.4 状态管理（借鉴 Coze）

```typescript
// packages/core/src/workflow/state.ts

export class WorkflowState {
    workflowId: string;
    private variables: Map<string, any> = new Map();
    private nodeOutputs: Map<string, any[]> = new Map();

    set(key: string, value: any) { this.variables.set(key, value); }
    get(key: string): any { return this.variables.get(key); }

    setNodeOutput(nodeId: string, outputs: any[]) { this.nodeOutputs.set(nodeId, outputs); }
    getNodeOutput(nodeId: string): any[] | undefined { return this.nodeOutputs.get(nodeId); }

    // 序列化（用于持久化到数据库）
    serialize(): string {
        return JSON.stringify({
            variables: Object.fromEntries(this.variables),
            nodeOutputs: Object.fromEntries(this.nodeOutputs),
        });
    }

    static deserialize(json: string): WorkflowState {
        const data = JSON.parse(json);
        const state = new WorkflowState();
        for (const [k, v] of Object.entries(data.variables)) state.set(k, v);
        for (const [k, v] of Object.entries(data.nodeOutputs)) state.setNodeOutput(k, v as any[]);
        return state;
    }
}
```

#### 6.5 Action 节点 — 桥接模块服务

```typescript
// packages/core/src/workflow/node-types/action.ts

class ActionNodeHandler implements NodeHandler {
    app: Application;

    constructor(app: Application) { this.app = app; }

    async execute(node: WorkflowNode, inputs: any, state: WorkflowState): Promise<NodeResult> {
        const { service, method, args } = node.config;

        // 通过服务定位器调用模块服务（零网络开销）
        const svc = this.app.container.resolve(service);
        const resolvedArgs = this.resolveArgs(args, inputs, state);
        const result = await svc[method](...resolvedArgs);

        return { outputs: [result] };
    }

    // 解析参数中的变量引用（如 {{ trigger.data.amount }}）
    private resolveArgs(args: any, inputs: any, state: WorkflowState): any[] {
        // 简化版表达式解析
        // 实际实现支持 {{ node.xxx.output }} {{ trigger.data.xxx }} 等
        return Object.values(args).map(v => {
            if (typeof v === 'string' && v.startsWith('{{') && v.endsWith('}}')) {
                return this.evalExpression(v.slice(2, -2).trim(), inputs, state);
            }
            return v;
        });
    }

    private evalExpression(expr: string, inputs: any, state: WorkflowState): any {
        const parts = expr.split('.');
        let value: any = state.get(parts[0]) ?? inputs;
        for (let i = 1; i < parts.length; i++) {
            value = value?.[parts[i]];
        }
        return value;
    }
}
```

#### 6.6 YAML DSL 解析（借鉴 Dify）

```typescript
// packages/core/src/workflow/parser.ts

import yaml from 'yaml';

export function parseWorkflow(yamlContent: string): WorkflowDefinition {
    const raw = yaml.parse(yamlContent);

    const nodes: WorkflowNode[] = raw.nodes.map((n: any) => ({
        id: n.id,
        type: n.type,
        config: n.config,
        next: n.next,
    }));

    // 从 branches 构建连接
    const connections: WorkflowConnection[] = [];
    for (const node of raw.nodes) {
        if (node.branches) {
            for (const branch of node.branches) {
                connections.push({ from: node.id, to: branch.to, outputIndex: branch.output });
            }
        }
        if (node.next) {
            for (const target of node.next) {
                connections.push({ from: node.id, to: target });
            }
        }
    }

    return {
        name: raw.name,
        version: raw.version,
        trigger: raw.trigger,
        nodes,
        connections,
    };
}
```

#### 6.7 集成到 Application

```typescript
// packages/core/src/application.ts（增量更新）

export class Application {
    // ... 原有字段 ...
    workflowEngine: WorkflowEngine;

    constructor(db: DB) {
        // ...
        this.workflowEngine = new WorkflowEngine(this);
    }

    async start() {
        await this.pluginManager.loadAll();
        this.resourcer.refresh();
        this.hono.route('/api', this.resourcer.hono);

        // 恢复中断的工作流执行
        await this.workflowEngine.recoverInterrupted();

        await this.listen(port);
    }

    // 触发工作流（事件总线联动）
    emit(event: string, data: any) {
        this.eventBus.emit(event, data);
        // 检查是否有工作流订阅此事件
        this.workflowEngine.triggerByEvent(event, data);
    }
}
```

#### 6.8 交付标准

- [ ] DAG 执行器能按拓扑顺序执行节点
- [ ] condition 节点正确分支（true/false 走不同下游）
- [ ] merge 节点等待所有上游到齐才执行
- [ ] human_task 节点正确中断执行，持久化 State 到数据库
- [ ] `resume()` 能从断点恢复执行
- [ ] action 节点能通过 `container.resolve` 调用模块服务
- [ ] YAML DSL 能正确解析为 WorkflowDefinition
- [ ] 进程重启后 `recoverInterrupted()` 恢复卡住的执行
- [ ] `executePartial()` 能从指定节点开始调试执行

#### 参考项目

- **n8n**: `packages/core/src/execution-engine/workflow-execute.ts` — DAG 执行器核心（~1250 行 TS），栈 + 等待队列模式
- **n8n**: `ExecutionRecoveryService` — 进程崩溃后恢复卡住的执行
- **Coze**: 中断恢复（InterruptError + State 快照持久化 + 断点恢复）
- **Dify**: 工作流 DSL（YAML 定义格式）+ 变量作用域（System/Env/Conversation/NodeOutput）

---

### Step 8：JWT 认证 + 用户管理（Week 11）

#### 目标

JWT 签发/验证中间件，所有 `/api/*` 请求自动验证，模块通过 `ctx.user` 获取当前用户。

#### 6.1 新增文件

```
packages/core/src/
├── auth/
│   ├── jwt.ts              # JWT 签发/验证
│   ├── middleware.ts       # Hono JWT 中间件
│   └── password.ts         # bcrypt 密码哈希
└── routes/
    └── auth.ts             # 登录/注销/当前用户
```

#### 6.2 JWT + 中间件

```typescript
// packages/core/src/auth/jwt.ts

import jwt from 'jsonwebtoken';

export interface JwtPayload {
    userId: number;
    username: string;
    role: string;
}

export class JwtManager {
    secret: string;
    expiryHours: number;

    constructor(secret: string, expiryHours: number) {
        this.secret = secret;
        this.expiryHours = expiryHours;
    }

    sign(payload: JwtPayload): string {
        return jwt.sign(payload, this.secret, { expiresIn: `${this.expiryHours}h` });
    }

    verify(token: string): JwtPayload {
        return jwt.verify(token, this.secret) as JwtPayload;
    }
}
```

```typescript
// packages/core/src/auth/middleware.ts

import type { Context, Next } from 'hono';
import type { JwtManager } from './jwt';

// 白名单路径（不需要认证）
const PUBLIC_PATHS = ['/api/health', '/api/auth/login', '/api/auth/setup'];

export function authMiddleware(jwtManager: JwtManager) {
    return async (c: Context, next: Next) => {
        const path = c.req.path;

        // 白名单放行
        if (PUBLIC_PATHS.some(p => path.startsWith(p))) {
            return next();
        }

        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const token = authHeader.slice(7);
        try {
            const payload = jwtManager.verify(token);
            c.set('user', payload);
            return next();
        } catch {
            return c.json({ error: 'Invalid token' }, 401);
        }
    };
}
```

#### 6.3 认证路由

```typescript
// packages/core/src/routes/auth.ts

import { Hono } from 'hono';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { Application } from '../application';

export function createAuthRoutes(app: Application): Hono {
    const route = new Hono();

    // POST /api/auth/login
    route.post('/login', async (c) => {
        const { username, password } = await c.req.json();

        const users = app.collections.get('users')!;
        const result = await app.db.select().from(users.table).where(eq(users.table.username, username));

        if (result.length === 0) {
            return c.json({ error: 'User not found' }, 404);
        }

        const user = result[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return c.json({ error: 'Invalid password' }, 401);
        }

        const token = app.jwt.sign({
            userId: user.id,
            username: user.username,
            role: user.role,
        });

        return c.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    });

    // GET /api/auth/me
    route.get('/me', (c) => {
        const user = c.get('user');
        return c.json({ data: user });
    });

    // POST /api/auth/setup（首次启动创建 admin）
    route.post('/setup', async (c) => {
        const { username, password } = await c.req.json();
        const hash = await bcrypt.hash(password, 10);

        const users = app.collections.get('users')!;
        const result = await app.db.insert(users.table).values({
            username,
            password_hash: hash,
            role: 'admin',
        }).returning();

        return c.json({ data: { id: result[0].id, username: result[0].username, role: 'admin' } }, 201);
    });

    return route;
}
```

#### 6.4 交付标准

- [ ] `POST /api/auth/setup` 创建首个 admin 用户
- [ ] `POST /api/auth/login` 返回 JWT
- [ ] 受保护 API 无 Token 返回 401
- [ ] 有效 Token 请求自动注入 `ctx.user`
- [ ] `GET /api/auth/me` 返回当前用户信息

---

### Step 9：Admin Layout + UI Adapter + 前端骨架（Week 12-13）

#### 目标

React 前端骨架：UI Adapter 接口 + shadcn/ui 实现 + 登录页 + Admin 面板布局 + 模块动态渲染。模块页面通过 TanStack Router 动态注册路由。

#### 9.1 前端结构（三层 UI 隔离）

```
packages/ui/src/
├── adapters/
│   ├── types.ts                  # UIAdapter 接口（框架无关，~100 行）
│   └── shadcn-adapter.ts         # shadcn/ui 实现（~300 行）
├── composites/                   # Layer 2：平台复合组件（稳定 API）
│   ├── data-table.tsx            # DataTable（用 TanStack Table + adapter）
│   ├── form-builder.tsx          # FormBuilder（用 React Hook Form + Zod）
│   ├── status-badge.tsx
│   ├── detail-panel.tsx
│   ├── filter-bar.tsx
│   └── action-bar.tsx
├── fields/                       # Layer 1：Field Interface 组件
│   ├── money-input.tsx           # 用 adapter 原语实现
│   ├── select-input.tsx
│   └── ...
├── layout/
│   ├── LayoutProvider.tsx        # 布局提供者（选择 desktop 或 admin）
│   ├── AdminLayout.tsx           # Admin 面板模式
│   ├── DesktopLayout.tsx         # 桌面窗口模式（Step 11 实现）
│   └── components/
│       ├── Sidebar.tsx
│       ├── Topbar.tsx
│       └── LayoutSwitcher.tsx
├── module-renderer/
│   └── ModuleRenderer.tsx        # 模块渲染器（模式无关）
├── stores/
│   ├── auth.ts                   # Zustand: 用户状态 + JWT
│   └── preferences.ts            # Zustand: UI 偏好（layoutMode 等）
├── api/
│   ├── client.ts                 # fetch 封装 + JWT 拦截器
│   ├── auth.ts                   # 认证 API
│   └── modules.ts                # 模块元数据 API
├── theme.css                     # CSS 变量主题（框架无关）
├── index.ts                      # 统一导出（模块开发者只 import 这里）
├── App.tsx                       # 前端入口
└── router.tsx                    # TanStack Router 配置
```

**关键规则**：模块开发者只从 `@modacs/ui` 导入（`import { DataTable, Button } from '@modacs/ui'`），禁止直接 import shadcn/ui。

#### 9.2 UI Adapter 接口

```typescript
// packages/ui/src/adapters/types.ts

import type { ComponentType } from 'react';

export interface UIAdapter {
    Button: ComponentType<UIButtonProps>;
    Input: ComponentType<UIInputProps>;
    Select: ComponentType<UISelectProps>;
    Modal: ComponentType<UIModalProps>;
    Drawer: ComponentType<UIDrawerProps>;
    Tooltip: ComponentType<UITooltipProps>;
    Toast: { show: (msg: string, opts?: UIToastOptions) => void };
    // ... 其他原语
}

export interface UIButtonProps {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
}
// ... 其他 Props 接口
```

#### 9.3 shadcn/ui Adapter 实现

```typescript
// packages/ui/src/adapters/shadcn-adapter.ts

import { Button as ShadcnButton } from '@/components/ui/button';
import { Input as ShadcnInput } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { UIAdapter, UIButtonProps, UIInputProps, UIModalProps } from './types';

export const shadcnAdapter: UIAdapter = {
    Button: ({ variant, size, disabled, loading, onClick, children }: UIButtonProps) => (
        <ShadcnButton
            variant={variant === 'primary' ? 'default' : variant}
            size={size}
            disabled={disabled || loading}
            onClick={onClick}
        >
            {children}
        </ShadcnButton>
    ),
    Input: ({ value, placeholder, disabled, error, onChange }: UIInputProps) => (
        <>
            <ShadcnInput value={value} placeholder={placeholder} disabled={disabled}
                onChange={(e) => onChange?.(e.target.value)} />
            {error && <p className="text-sm text-destructive">{error}</p>}
        </>
    ),
    Modal: ({ open, title, onClose, children, size }: UIModalProps) => (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className={size === 'lg' ? 'max-w-3xl' : 'max-w-md'}>
                {title && <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>}
                {children}
            </DialogContent>
        </Dialog>
    ),
    Toast: { show: (msg, opts) => toast(msg, { type: opts?.type }) },
    // ... 其他组件
};
```

#### 9.4 平台复合组件（DataTable）

```typescript
// packages/ui/src/composites/data-table.tsx

import { useReactTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';
import type { UIAdapter } from '../adapters/types';

export interface DataTableProps<T> {
    data: T[];
    columns: { key: string; header: string; sortable?: boolean; render?: (row: T) => React.ReactNode }[];
    sortable?: boolean;
    pagination?: boolean;
    pageSize?: number;
    onRowClick?: (row: T) => void;
}

export function createDataTable(adapter: UIAdapter) {
    return function DataTable<T>({ data, columns, sortable, pagination }: DataTableProps<T>) {
        const table = useReactTable({
            data,
            columns: columns.map(c => ({ id: c.key, header: c.header, accessorKey: c.key, enableSorting: c.sortable })),
            getCoreRowModel: getCoreRowModel(),
            getSortedRowModel: sortable ? getSortedRowModel() : undefined,
        });

        return (
            <table className="w-full">
                <thead>
                    {table.getHeaderGroups().map(hg => (
                        <tr key={hg.id}>
                            {hg.headers.map(h => (
                                <th key={h.id} onClick={h.column.getToggleSortingHandler()}>
                                    {h.column.columnDef.header as string}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map(row => (
                        <tr key={row.id}>
                            {row.getVisibleCells().map(cell => (
                                <td key={cell.id}>{cell.getValue() as React.ReactNode}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };
}
```

#### 9.5 统一导出

```typescript
// packages/ui/src/index.ts

import { shadcnAdapter } from './adapters/shadcn-adapter';
import { createDataTable } from './composites/data-table';

// 导出复合组件（绑定当前 adapter）
export const DataTable = createDataTable(shadcnAdapter);
export { FormBuilder, StatusBadge, DetailPanel } from './composites';

// 导出原语（从 adapter 取，模块不直接碰 shadcn）
export const Button = shadcnAdapter.Button;
export const Input = shadcnAdapter.Input;
export const Modal = shadcnAdapter.Modal;

// 导出布局
export { AdminLayout, DesktopLayout, LayoutProvider } from './layout';

// 导出 stores
export { usePreferences } from './stores/preferences';
export { useAuth } from './stores/auth';
```

#### 9.6 LayoutProvider + AdminLayout

```typescript
// packages/ui/src/layout/LayoutProvider.tsx

import { usePreferences } from '@/stores/preferences';
import { AdminLayout } from './AdminLayout';
import { DesktopLayout } from './DesktopLayout';

export function LayoutProvider({ children }: { children: React.ReactNode }) {
    const { layoutMode } = usePreferences();

    switch (layoutMode) {
        case 'desktop':
            return <DesktopLayout>{children}</DesktopLayout>;
        case 'admin':
        default:
            return <AdminLayout>{children}</AdminLayout>;
    }
}
```

```typescript
// packages/ui/src/layout/AdminLayout.tsx

import { useModules } from '@/api/modules';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';

export function AdminLayout({ children }: { children: React.ReactNode }) {
    const { data: modules } = useModules();
    const [collapsed, setCollapsed] = useState(false);

    // 合并所有模块的菜单
    const menuItems = useMemo(() => {
        return modules?.flatMap(m => m.contributes?.menus ?? []) ?? [];
    }, [modules]);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
            <Sidebar items={menuItems} collapsed={collapsed} />
            <div className="flex-1 flex flex-col">
                <Topbar onToggleSidebar={() => setCollapsed(!collapsed)} />
                <main className="flex-1 overflow-auto p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
```

#### 7.3 模块渲染器 + 动态路由

```typescript
// packages/ui/src/module-renderer/ModuleRenderer.tsx

import { lazy, Suspense } from 'react';

export function ModuleRenderer({ module, page }: { module: string; page: string }) {
    // 动态导入模块页面组件
    // 模块在 build 时通过 esbuild 的动态 import 打包
    const PageComponent = lazy(() =>
        import(`../../modules/${module}/pages/${page}.tsx`)
    );

    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PageComponent />
        </Suspense>
    );
}
```

```typescript
// packages/ui/src/router.tsx

import { createRouter } from '@tanstack/react-router';

// 平台内置路由
const baseRoutes = [
    { path: '/login', component: Login },
    { path: '/setup', component: Setup },
];

// 模块路由在运行时从 API 获取模块元数据后动态注册
// GET /api/modules → 返回所有已启用模块的 contributes.routes
// 然后调用 router.registerRoute() 注册

export function createAppRouter(modules: ModuleMeta[]) {
    const moduleRoutes = modules.flatMap(m =>
        (m.contributes?.routes ?? []).map(r => ({
            path: r.path,
            component: () => <ModuleRenderer module={m.name} page={r.component} />,
        }))
    );

    return createRouter({
        routes: [...baseRoutes, ...moduleRoutes],
    });
}
```

#### 7.4 偏好存储

```typescript
// packages/ui/src/stores/preferences.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Preferences {
    layoutMode: 'desktop' | 'admin';
    sidebarCollapsed: boolean;
    setLayoutMode: (mode: 'desktop' | 'admin') => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
}

export const usePreferences = create<Preferences>()(
    persist(
        (set) => ({
            layoutMode: 'admin',  // 默认 Admin 模式（Step 9 加桌面模式后可切换）
            sidebarCollapsed: false,
            setLayoutMode: (mode) => set({ layoutMode: mode }),
            setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
        }),
        { name: 'modacs-preferences' }
    )
);
```

#### 7.5 交付标准

- [ ] 登录页可登录，登录后跳转 Admin 面板
- [ ] 首次启动有引导设置页面（创建 admin）
- [ ] 侧边栏从模块元数据自动生成菜单
- [ ] 点击菜单项切换路由，渲染对应模块页面
- [ ] 顶栏有用户菜单和布局切换按钮（切换按钮在 Step 9 生效）
- [ ] JWT 自动附加到所有 API 请求

---

### Step 10：MES 模块 — 从 Carbon 提取（Week 14-17）

#### 目标

将 Carbon（crbnos/carbon）的 MES 业务逻辑提取为 MODACS 首个模块。提取数据模型、业务服务、UI 组件，脱离 Supabase 耦合。

#### 8.1 提取策略

```
Carbon 代码结构 → MODACS MES 模块映射：

Carbon                           →  MODACS MES Module
─────────────────────────────────────────────────────
src/types/ (数据模型)             →  modules/mes/src/collections/
src/services/ (业务逻辑)          →  modules/mes/src/services/
src/components/ (UI 组件)         →  modules/mes/src/pages/ (适配)
src/hooks/ (React hooks)         →  保留，适配 API 调用
src/lib/supabase.ts (Supabase)   →  删除，改用平台 API + TanStack Query
src/lib/auth.ts (认证)           →  删除，使用平台 JWT
路由定义 (React Router)           →  manifest.yaml contributes.routes

不提取：
├── Supabase 客户端配置
├── Carbon 独立认证系统
├── Carbon 的 React Router 结构
├── Carbon 的 Docker 部署配置
└── Carbon 的独立 package.json
```

#### 8.2 模块结构

```
modules/mes/
├── manifest.yaml              # 模块清单
├── migrations/
│   └── 0001_init.sql          # 初始 schema
├── src/
│   ├── index.ts               # MesPlugin 入口
│   ├── collections/
│   │   ├── work-orders.ts     # 工单 Collection
│   │   ├── bom.ts             # BOM Collection
│   │   ├── routing.ts         # 工艺路线 Collection
│   │   └── production-logs.ts # 生产日志 Collection
│   ├── services/
│   │   ├── work-order-service.ts
│   │   ├── bom-service.ts
│   │   └── inventory-bridge.ts   # 调用 ERP 模块
│   └── exports.ts             # 导出服务供其他模块调用
└── pages/                     # 前端页面组件
    ├── WorkOrderList.tsx
    ├── WorkOrderDetail.tsx
    ├── BomEditor.tsx
    └── RoutingConfig.tsx
```

#### 8.3 MES Plugin

```typescript
// modules/mes/src/index.ts

import { Plugin, type PluginMeta } from '@modacs/core';
import type { Application } from '@modacs/core';
import { defineWorkOrderCollection } from './collections/work-orders';
import { defineBomCollection } from './collections/bom';
import { WorkOrderService } from './services/work-order-service';

const meta: PluginMeta = {
    name: 'mes',
    version: '0.1.0',
    depends: ['base'],
};

export class MesPlugin extends Plugin {
    async beforeLoad() {
        // 注册 Collection
        defineWorkOrderCollection(this.app);
        defineBomCollection(this.app);

        // 声明事件
        // （事件通过 manifest.yaml 声明，这里不需要额外注册）
    }

    async load() {
        // 注册服务到容器
        const workOrderService = new WorkOrderService(this.app);
        this.app.registerService('mes:WorkOrderService', workOrderService);

        // 注册自定义 Field Interface
        this.app.fieldInterface.register('duration', {
            column: { type: 'integer' },
            validate: z.number().int().nonnegative(),
            defaultValue: 0,
        });
    }

    async install() {
        // 执行迁移
        await runMigrations(config.database, `${__dirname}/../migrations`);

        // 创建默认数据（如默认工单状态枚举）
    }
}
```

#### 8.4 交付标准

- [ ] MES 模块能被 PluginManager 加载
- [ ] 工单/BOM Collection 正确创建，CRUD API 可用
- [ ] 工单页面列表/详情/创建/编辑功能正常
- [ ] BOM 编辑器功能正常
- [ ] WorkOrderService 可被其他模块通过 `container.resolve` 调用
- [ ] 事件 `work_order_created` 正确发布

---

### Step 11：桌面窗口模式 + 双 UI 切换（Week 18-19）

#### 目标

实现桌面窗口模式（WindowManager + 桌面 + 任务栏），与 Admin 模式一键切换。

#### 9.1 新增文件

```
packages/ui/src/layout/
├── DesktopLayout.tsx           # 桌面布局（壁纸 + 图标 + 窗口层 + 任务栏）
├── window-manager.ts           # 窗口管理器（创建/关闭/聚焦/拖拽/缩放）
└── components/
    ├── Window.tsx              # 单窗口组件（标题栏 + 内容区）
    ├── DesktopIcon.tsx         # 桌面图标
    ├── Taskbar.tsx             # 底部任务栏
    └── StartMenu.tsx           # 开始菜单
```

#### 9.2 窗口管理器

```typescript
// packages/ui/src/layout/window-manager.ts

import { create } from 'zustand';

export interface WindowState {
    id: string;
    moduleId: string;
    title: string;
    icon: string;
    route: string;
    bounds: { x: number; y: number; width: number; height: number };
    state: 'normal' | 'minimized' | 'maximized';
    zIndex: number;
}

interface WindowManagerStore {
    windows: WindowState[];
    activeId: string | null;
    zCounter: number;

    openWindow: (moduleId: string, title: string, icon: string, route: string) => void;
    closeWindow: (id: string) => void;
    focusWindow: (id: string) => void;
    minimizeWindow: (id: string) => void;
    toggleMaximize: (id: string) => void;
    updateBounds: (id: string, bounds: Partial<WindowState['bounds']>) => void;
}

export const useWindowManager = create<WindowManagerStore>((set, get) => ({
    windows: [],
    activeId: null,
    zCounter: 100,

    openWindow: (moduleId, title, icon, route) => {
        const { windows, zCounter } = get();
        // 如果窗口已存在，聚焦它
        const existing = windows.find(w => w.moduleId === moduleId && w.route === route);
        if (existing) {
            get().focusWindow(existing.id);
            return;
        }
        const id = `${moduleId}-${Date.now()}`;
        const newWindow: WindowState = {
            id, moduleId, title, icon, route,
            bounds: { x: 100 + windows.length * 30, y: 100 + windows.length * 30, width: 1024, height: 768 },
            state: 'normal',
            zIndex: zCounter + 1,
        };
        set({ windows: [...windows, newWindow], activeId: id, zCounter: zCounter + 1 });
    },

    closeWindow: (id) => {
        set(state => ({ windows: state.windows.filter(w => w.id !== id) }));
    },

    focusWindow: (id) => {
        set(state => ({
            activeId: id,
            zCounter: state.zCounter + 1,
            windows: state.windows.map(w =>
                w.id === id ? { ...w, zIndex: state.zCounter + 1, state: w.state === 'minimized' ? 'normal' : w.state } : w
            ),
        }));
    },

    minimizeWindow: (id) => {
        set(state => ({
            windows: state.windows.map(w => w.id === id ? { ...w, state: 'minimized' as const } : w),
        }));
    },

    toggleMaximize: (id) => {
        set(state => ({
            windows: state.windows.map(w =>
                w.id === id ? { ...w, state: w.state === 'maximized' ? 'normal' as const : 'maximized' as const } : w
            ),
        }));
    },

    updateBounds: (id, bounds) => {
        set(state => ({
            windows: state.windows.map(w =>
                w.id === id ? { ...w, bounds: { ...w.bounds, ...bounds } } : w
            ),
        }));
    },
}));
```

#### 9.3 DesktopLayout

```typescript
// packages/ui/src/layout/DesktopLayout.tsx

import { Rnd } from 'react-rnd';  // 拖拽 + 缩放
import { useWindowManager } from './window-manager';
import { useModules } from '@/api/modules';
import { ModuleRenderer } from '@/module-renderer/ModuleRenderer';

export function DesktopLayout({ children }: { children: React.ReactNode }) {
    const { windows, openWindow, closeWindow, focusWindow, minimizeWindow, toggleMaximize, updateBounds } = useWindowManager();
    const { data: modules } = useModules();

    return (
        <div className="desktop-root h-screen w-screen overflow-hidden bg-cover bg-center"
             style={{ backgroundImage: 'url(/wallpaper.jpg)' }}>

            {/* 桌面图标区 */}
            <div className="absolute top-4 left-4 flex flex-col gap-2">
                {modules?.map(mod => (
                    <DesktopIcon
                        key={mod.name}
                        icon={mod.contributes?.desktop?.icon}
                        label={mod.contributes?.desktop?.label ?? mod.name}
                        onDoubleClick={() => openWindow(
                            mod.name,
                            mod.contributes?.desktop?.label ?? mod.name,
                            mod.contributes?.desktop?.icon,
                            mod.contributes?.routes?.[0]?.path ?? `/${mod.name}`
                        )}
                    />
                ))}
            </div>

            {/* 窗口层 */}
            {windows.map(win => (
                <Rnd
                    key={win.id}
                    size={{ width: win.bounds.width, height: win.bounds.height }}
                    position={{ x: win.bounds.x, y: win.bounds.y }}
                    onDragStop={(_, d) => updateBounds(win.id, { x: d.x, y: d.y })}
                    onResizeStop={(_, __, ref, ___, position) => {
                        updateBounds(win.id, {
                            width: parseInt(ref.style.width),
                            height: parseInt(ref.style.height),
                            ...position,
                        });
                    }}
                    disableDragging={win.state === 'maximized'}
                    enableResizing={win.state !== 'maximized'}
                    style={{
                        display: win.state === 'minimized' ? 'none' : 'flex',
                        zIndex: win.zIndex,
                    }}
                    className={cn(
                        "bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden",
                        win.state === 'maximized' && "!w-screen !h-screen !rounded-none !left-0 !top-0"
                    )}
                    onMouseDown={() => focusWindow(win.id)}
                >
                    {/* 标题栏 */}
                    <div className="flex items-center justify-between h-10 px-3 bg-gray-50 border-b cursor-move">
                        <span className="text-sm font-medium">{win.title}</span>
                        <div className="flex gap-1">
                            <button onClick={() => minimizeWindow(win.id)}>—</button>
                            <button onClick={() => toggleMaximize(win.id)}>□</button>
                            <button onClick={() => closeWindow(win.id)}>×</button>
                        </div>
                    </div>
                    {/* 内容区 */}
                    <div className="flex-1 overflow-auto">
                        <ModuleRenderer module={win.moduleId} page={win.route} />
                    </div>
                </Rnd>
            ))}

            {/* 任务栏 */}
            <Taskbar
                windows={windows}
                onToggleWindow={(id) => focusWindow(id)}
                modules={modules}
                onLaunchApp={(mod) => openWindow(mod.name, mod.name, '', mod.contributes?.routes?.[0]?.path)}
            />
        </div>
    );
}
```

#### 9.4 切换按钮

```typescript
// packages/ui/src/layout/components/LayoutSwitcher.tsx

import { usePreferences } from '@/stores/preferences';
import { Monitor, PanelLeft } from 'lucide-react';

export function LayoutSwitcher() {
    const { layoutMode, setLayoutMode } = usePreferences();

    return (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
                onClick={() => setLayoutMode('desktop')}
                className={cn("p-1.5 rounded", layoutMode === 'desktop' ? 'bg-white shadow-sm' : 'hover:bg-gray-200')}
                title="桌面模式"
            >
                <Monitor className="w-4 h-4" />
            </button>
            <button
                onClick={() => setLayoutMode('admin')}
                className={cn("p-1.5 rounded", layoutMode === 'admin' ? 'bg-white shadow-sm' : 'hover:bg-gray-200')}
                title="管理面板模式"
            >
                <PanelLeft className="w-4 h-4" />
            </button>
        </div>
    );
}
```

#### 9.5 交付标准

- [ ] 切换按钮在顶栏可见，点击切换 Desktop/Admin 模式
- [ ] 偏好在 localStorage 持久化，刷新后保持
- [ ] 桌面模式：模块图标显示在桌面，双击打开窗口
- [ ] 窗口可拖拽、缩放、最大化、最小化、关闭
- [ ] 多窗口并存，点击切换 zIndex（聚焦）
- [ ] 任务栏显示已打开的窗口，点击切换/恢复
- [ ] 同一个模块页面在两种模式下渲染效果相同

---

### Step 12：Podman 代理 + manifest 包格式（Week 20-21）

#### 目标

实现 Podman 模块的 HTTP 代理和 manifest.yaml 包格式的安装/卸载流程。

#### 10.1 Podman 代理

```typescript
// packages/core/src/podman-proxy/index.ts

import { Hono } from 'hono';
import { fetch } from 'undici';

export class PodmanProxy {
    hono: Hono;
    private moduleUrls: Map<string, string> = new Map();

    constructor() {
        this.hono = new Hono();
        this.setupProxy();
    }

    // 注册隔离模块的地址
    registerModule(moduleName: string, containerUrl: string) {
        this.moduleUrls.set(moduleName, containerUrl);
        console.log(`[PodmanProxy] Registered: ${moduleName} → ${containerUrl}`);
    }

    private setupProxy() {
        // 匹配 /api/isolated/{module}/*
        this.hono.all('/isolated/:module/*', async (c) => {
            const moduleName = c.req.param('module');
            const subPath = c.req.param('*');

            const targetUrl = this.moduleUrls.get(moduleName);
            if (!targetUrl) {
                return c.json({ error: `Isolated module "${moduleName}" not found` }, 404);
            }

            // 构建目标 URL
            const url = `${targetUrl}/${subPath}${c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''}`;

            // 注入用户信息（从 JWT）
            const user = c.get('user');
            const headers = new Headers(c.req.raw.headers);
            if (user) {
                headers.set('X-User-Id', String(user.userId));
                headers.set('X-User-Name', user.username);
                headers.set('X-User-Role', user.role);
            }

            // 转发请求
            const response = await fetch(url, {
                method: c.req.method,
                headers,
                body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
            });

            // 返回响应
            return new Response(response.body, {
                status: response.status,
                headers: response.headers,
            });
        });
    }
}
```

#### 10.2 manifest 包安装

```typescript
// packages/core/src/package-installer/index.ts

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import { execSync } from 'child_process';
import type { Application } from '../application';

export interface Manifest {
    name: string;
    version: string;
    description: string;
    type: 'process' | 'isolated';
    depends: string[];
    database?: { schema: string; migrations: string };
    contributes?: { menus?: any[]; routes?: any[]; desktop?: any };
    events?: { publishes: string[]; subscribes: string[] };
    scripts?: Record<string, string>;
}

export class PackageInstaller {
    app: Application;

    constructor(app: Application) {
        this.app = app;
    }

    async install(packageDir: string): Promise<void> {
        // 1. 读取 manifest.yaml
        const manifestPath = join(packageDir, 'manifest.yaml');
        if (!existsSync(manifestPath)) throw new Error('manifest.yaml not found');
        const manifest: Manifest = yaml.parse(readFileSync(manifestPath, 'utf-8'));

        console.log(`[Installer] Installing ${manifest.name} v${manifest.version}`);

        // 2. 检查依赖
        for (const dep of manifest.depends) {
            if (!this.app.pluginManager.getPlugin(dep)) {
                throw new Error(`Dependency "${dep}" not installed`);
            }
        }

        // 3. 执行 pre_install 脚本
        if (manifest.scripts?.pre_install) {
            execSync(`bash ${join(packageDir, manifest.scripts.pre_install)}`);
        }

        if (manifest.type === 'process') {
            // 4a. 进程内模块：加载 Plugin
            await this.installProcessModule(packageDir, manifest);
        } else {
            // 4b. 隔离模块：构建 Podman 容器
            await this.installIsolatedModule(packageDir, manifest);
        }

        // 5. 执行 post_install 脚本
        if (manifest.scripts?.post_install) {
            execSync(`bash ${join(packageDir, manifest.scripts.post_install)}`);
        }

        // 6. 记录安装信息
        await this.recordInstall(manifest);

        console.log(`[Installer] Installed: ${manifest.name}`);
    }

    private async installProcessModule(packageDir: string, manifest: Manifest) {
        // 动态 import 模块入口
        const moduleEntry = join(packageDir, 'src/index.ts');
        const { default: PluginClass } = await import(moduleEntry);

        // 注册到 PluginManager
        this.app.pluginManager.add(manifest.name, PluginClass, {
            name: manifest.name,
            version: manifest.version,
            depends: manifest.depends,
        });

        // 执行 beforeLoad → load → install
        await this.app.pluginManager.loadAll();
        await this.app.pluginManager.install(manifest.name);
    }

    private async installIsolatedModule(packageDir: string, manifest: Manifest) {
        // 构建 Podman 镜像
        execSync(`podman build -t modacs-${manifest.name}:${manifest.version} ${packageDir}`);

        // 启动容器
        execSync(`podman run -d --name modacs-${manifest.name} \
            --network modacs-net \
            -e DATABASE_URL=${process.env.DATABASE_URL} \
            modacs-${manifest.name}:${manifest.version}`);

        // 注册到 PodmanProxy
        this.app.podmanProxy.registerModule(manifest.name, `http://modacs-${manifest.name}:8080`);
    }
}
```

#### 10.3 交付标准

- [ ] manifest.yaml 能被正确解析
- [ ] 进程内模块能通过 PackageInstaller 安装
- [ ] 隔离模块能构建 Podman 镜像并启动容器
- [ ] PodmanProxy 正确转发请求到隔离模块
- [ ] 依赖检查：缺少依赖时报错
- [ ] 安装/卸载脚本正确执行

---

## 3. MVP 定义

```
MVP = Slice 1-5 全部完成（14 周，约 3.5 个月）

能实现：
├── 多进程插件系统 + UDS JSON-RPC + MCAP 录制回放（Slice 1）
├── Postgres 数据层 + Collection CRUD 自动生成 + JWT 认证（Slice 2）
├── Admin 面板 UI + UI Adapter 三层隔离 + 动态路由（Slice 3）
├── MES 业务模块（工单/工艺/质检/设备 6-8 个 Collection）（Slice 4）
├── DAG 工作流引擎 + 中断恢复 + 可视化编辑器（Slice 5）
└── RBAC 权限（角色-资源-操作，3 个角色起）

不能实现（v2 补充）：
├── 桌面窗口模式（原 Step 11）
├── Podman 容器隔离（原 Step 12）
├── Zenoh Vision 数据流（Link/Vision 产品）
├── App Center（模块商店）
├── 系统监控 + 备份
└── 集群管理（MODACS-Cluster）
```

**MVP 时间预估**：14 周（约 3.5 个月）

---

## 4. 关键注意事项

### 4.1 不要过早优化

```
初期不需要：
├── 集群管理（Phase 5+ 才做）
├── manifest 数字签名（先用本地文件）
├── 增量更新（全量替换即可）
├── App Center UI（先支持手动安装）
└── 模块热卸载（重启时生效即可）

初期必须做好：
├── Plugin 生命周期接口稳定（后期改接口要迁移）
├── Collection 定义格式稳定（后期改格式要迁移）
├── manifest.yaml 字段稳定（后期改格式要迁移）
├── API 路径规范（/api/{collection}:{action}）
├── UI Adapter 接口稳定（切换 UI 框架只改 ~40 个组件）
└── PG schema 命名规范（{module}_{table}）
```

### 4.2 esbuild 构建部署

```dockerfile
# Dockerfile（平台自身容器化部署，可选 — 优先直接 systemd 运行）
FROM node:24-slim AS builder
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm run build  # esbuild --bundle --platform=node → dist/

FROM node:24-slim
COPY --from=builder /app/dist /app/dist
# 应用数据持久化（MCAP 录制文件、插件等）
VOLUME /data/modacs
EXPOSE 3000
CMD ["node", "/app/dist/packages/server/main.js"]
```

### 4.3 开发环境

```bash
# 启动 Postgres（一行）
docker compose up -d db

# 安装依赖
corepack enable
pnpm install

# 初始化数据库
pnpm db:migrate    # Drizzle Kit → modacs db

# 启动后端（tsx watch 热更新）
pnpm dev

# 启动前端（Vite 热更新）
pnpm --filter @modacs/ui dev

# 端到端测试
pnpm test:e2e
```

### 4.4 测试策略：选择性 TDD

> **核心原则**：不是"要不要 TDD"，而是"什么组件用什么测试策略"。纯逻辑 TDD（先写测试后写代码），基础设施先写实现再补集成测试，UI 用 e2e，Slice 1 不写测试。

**按组件分类**：

| 组件类型 | 策略 | 示例 | 额外时间 |
|----------|------|------|:---:|
| **纯逻辑** | **TDD** | protocol.ts, JWT, RBAC, DSL 解析, Collection 代码生成 | +20% |
| **基础设施** | 先实现 → 后集成测试 | ProcessManager, RPC Hub, Foxglove Bridge | +30% |
| **API 端点** | 集成测试 | CRUD 链路、认证流程 | +20% |
| **UI 组件** | Playwright e2e | Login→CRUD 关键路径 | +40% |
| **Slice 1（Spike）** | 不写测试 | 手动执行 Demo Checklist 验证 | 0% |

**测试金字塔**：

```
         ╱  E2E  ╲          每 Slice 结尾：自动化 Demo Checklist
        ╱──────────╲        工具：Playwright + curl + assert
       ╱ Integration ╲      API 链路、RPC 端到端、DB 操作
      ╱────────────────╲    工具：vitest + undici + pg
     ╱   Unit (纯逻辑)    ╲  协议、权限、序列化、DSL
    ╱──────────────────────╲ 工具：vitest
```

**Slice 级规则**：

```
Slice 1（探针 — Week 1-2）：
  └── 不写任何测试。接口还在变，测试是负担。
  └── Demo Checklist 手动执行。
  └── Slice 1 结束时接口稳定，反向补 protocol.ts 单元测试。

Slice 2（数据层 — Week 3-4）：
  └── protocol.ts: TDD（先写测试）          ← Slice 1 结束已补
  └── JWT middleware: TDD
  └── Collection CRUD: 集成测试（POST → GET → 断言）
  └── 认证链路: 集成测试（无 token → 401）

Slice 3（UI — Week 5-7）：
  └── UI Adapter 接口: TDD（接口定义就是测试）
  └── Playwright e2e: Login → 进页面 → CRUD 操作
  └── 前端组件不做单元测试（断言 CSS class 无意义）

Slice 4（MES — Week 8-12）：
  └── Collection CRUD: 集成测试（工单/质检三级关联）
  └── Carbon 迁移: 不写测试（一次性操作）
  └── Playwright e2e: 工单完整业务流程

Slice 5（工作流+ACL — Week 13-14）：
  └── RBAC: TDD（给定角色→断言权限）
  └── 工作流 DSL: TDD（YAML → DAG 图，纯数据转换）
  └── 工作流引擎: 集成测试（kill server → 重启 → 断言断点恢复）
  └── Playwright e2e: 审批流程 + 权限拦截
```

**TDD 示例 — protocol.ts（~30 行测试，20 分钟）**：

```typescript
// packages/core/src/rpc/__tests__/protocol.test.ts
import { describe, it, expect } from 'vitest';
import { createRequest, createResponse } from '../protocol';

describe('JSON-RPC 2.0', () => {
    it('createRequest → { jsonrpc, method, params, id }', () => {
        const req = createRequest('echo', { msg: 'hello' }, 'req-1');
        expect(req.jsonrpc).toBe('2.0');
        expect(req.method).toBe('echo');
        expect(req.params).toEqual({ msg: 'hello' });
        expect(req.id).toBe('req-1');
    });

    it('createResponse → result on success', () => {
        const res = createResponse('req-1', { ok: true });
        expect(res.result).toEqual({ ok: true });
        expect(res.error).toBeUndefined();
    });

    it('createResponse → error on failure', () => {
        const res = createResponse('req-1', undefined, { code: -32601, message: 'Not found' });
        expect(res.error!.code).toBe(-32601);
        expect(res.result).toBeUndefined();
    });

    it('auto-generate id if not provided', () => {
        const req = createRequest('ping');
        expect(req.id).toBeDefined();
        expect(typeof req.id).toBe('string');
    });
});
```

**集成测试示例 — ProcessManager（mock 比代码长，用真实进程）**：

```typescript
// packages/core/src/__tests__/process-manager.test.ts
import { describe, it, expect } from 'vitest';
import { ProcessManager } from '../process-manager';

describe('ProcessManager (integration)', () => {
    it('should restart crashed plugin', async () => {
        const pm = new ProcessManager();
        await pm.startPlugin('test', './test-plugin.js');

        const pid = pm.getPid('test');
        process.kill(pid!, 'SIGKILL');

        // 等待自动重启（exponential backoff: 1s → 2s → ...）
        await vi.waitFor(() => pm.getStatus('test') === 'running', { timeout: 10000 });

        expect(pm.getRestartCount('test')).toBe(1);
        expect(pm.getPid('test')).not.toBe(pid); // 新进程，新 PID
    });
});
```

**Playwright e2e 示例 — 关键路径录制**：

```typescript
// tests/e2e/mes-workflow.spec.ts
import { test, expect } from '@playwright/test';

test('complete work order approval flow', async ({ page }) => {
    // Login
    await page.goto('http://localhost:5173');
    await page.fill('[name=username]', 'admin');
    await page.fill('[name=password]', '123456');
    await page.click('button[type=submit]');

    // Create work order
    await page.click('text=工单管理');
    await page.click('text=新建工单');
    await page.selectOption('[name=product_id]', 'P-001');
    await page.fill('[name=quantity]', '100');
    await page.click('text=提交');

    // Assert work order created
    await expect(page.locator('text=新建工单成功')).toBeVisible();

    // Switch to supervisor, approve
    // ... (审批流程)

    // Verify .mcap recording exists
    // ... (检查录制文件)
});
```

**测试工具链**：

```json
// packages/core/package.json 补充
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --dir src/**/__tests__",
    "test:integration": "vitest --dir src/__tests__",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "vitest": "^2",
    "@playwright/test": "^1"
  }
}
```

**测试运行方式**：

```bash
pnpm test              # 全部单元 + 集成测试
pnpm test:unit         # 纯逻辑组件（protocol, auth, RBAC）
pnpm test:integration  # API + RPC + DB 集成测试
pnpm test:e2e          # 自动执行当前 Slice 的 Demo Checklist
```

**整体时间影响**：14 周 → ~16 周（+15%）。纯逻辑 TDD 几乎无额外成本（protocol.ts 写测试+实现 20 分钟 vs 不写 10 分钟），UI e2e 是最贵的（+40%）但收益最大（跨组件 bug 早发现）。

---

## 5. 文档体系

```
MODACS-Overview.md（项目总览, v4.0）
├── 项目愿景、技术选型、路线图、决策记录

MODACS-Platform.md（平台架构设计, v4.0）
├── Odoo 式模块体系、插件生命周期、Podman 隔离、双 UI 模式

MODACS-Platform-Dev.md（本文，开发计划）
├── 5 Slice 垂直切片开发计划、Demo Checklist、Step 参考代码

MODACS-AI-Dev.md（AI 开发指南）
├── 技术栈约束、代码模板、禁止清单、测试策略

MODACS-AI-Dev.md（AI 开发指南）
├── 技术栈约束、代码模板、禁止清单、测试策略

MODACS-Cluster.md（集群架构设计）
├── 多节点管理、集群级版本管理

其他子产品文档：
├── MODACS-Act.md / MODACS-Link.md / MODACS-Vision.md
└── MES-Development-Plan.md
```

---

*本文档是 [MODACS-Platform](./MODACS-Platform.md) 的实操补充。*
*架构设计见 [MODACS-Platform](./MODACS-Platform.md)，集群扩展见 [MODACS-Cluster](./MODACS-Cluster.md)，项目总览见 [MODACS-Overview](./MODACS-Overview.md)。*
