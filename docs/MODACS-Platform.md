# MODACS 平台架构：模块体系设计

> 本文定义 MODACS 作为 Odoo 式模块化平台的架构设计。
> 与 [MODACS-Overview](./MODACS-Overview.md)（项目总览）互补：总览定义项目愿景，本文定义平台如何落地为可安装、可组合的模块系统。
> 开发步骤见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md)，集群扩展见 [MODACS-Cluster](./MODACS-Cluster.md)。

---

## 1. 核心决策：多进程插件隔离

### 1.1 架构范式

MODACS 采用 **多进程插件隔离架构**——每个 TS 业务插件运行在独立的 Node.js 子进程中，通过 Unix Domain Socket JSON-RPC 通信。

```
多进程隔离模式（MODACS 选择）：
├── 平台核心进程（Node.js + Hono，Supervisor）
│   ├── ProcessManager（spawn/监控/重启子进程）
│   ├── RPC Hub（UDS JSON-RPC 路由 + 旁路录制）
│   ├── ACL / WorkflowEngine / ResourceManager（代理层）
│   └── base 模块（inline，零开销）
├── 每个业务插件 = 1 个 Node.js 子进程
│   ├── MES 进程（UDS: /tmp/modacs-mes.sock）
│   ├── ERP 进程（UDS: /tmp/modacs-erp.sock）
│   └── OA 进程（UDS: /tmp/modacs-oa.sock）
├── 插件间通信：UDS JSON-RPC（~20μs，一个连接通吃 RPC + 事件 + 流式）
├── 所有进程共享同一个 PostgreSQL（schema 隔离）
└── Vision/Act 用 Podman 容器隔离（HTTP + Zenoh）

群晖 DSM 模式（已放弃）：
├── 平台 + 独立 Docker 套件
├── 每个套件独立容器 + 独立 schema
└── 套件间通过 API 网关 + 事件总线通信

Odoo 单进程模式（已演进）：
├── 所有模块在同一进程内
├── 模块间函数调用零开销
├── 但一个模块崩溃全盘崩溃
└── → 演进为多进程隔离，每个插件独立进程
```

### 1.2 为什么选择多进程隔离

| 维度       | 单进程（Odoo 模式）    | 多进程隔离（MODACS 选择）                  | DSM Docker 套件    |
| -------- | --------------- | --------------------------------- | ---------------- |
| **稳定性**  | ❌ 一崩全崩          | ✅ 插件隔离，独立重启                       | ✅ 容器隔离           |
| **通信延迟** | ✅ ~0ns（函数调用）    | ~20μs（UDS JSON-RPC）               | ~300μs（HTTP TCP） |
| **资源占用** | ✅ 1 个进程         | N+1 个进程（~30MB/个）                  | 每容器 ~100MB+      |
| **独立重启** | ❌               | ✅ 单插件重启                           | ✅                |
| **社区先例** | Odoo / NocoBase | **Grafana / HashiCorp / VS Code** | CasaOS / HA      |
| **调试体验** | ✅ 单进程           | ⚠️ 多进程（MCAP 录制补偿）                 | ⚠️ 多容器           |

**关键洞察**：20μs 的 UDS 延迟对企业应用（非实时控制）完全可接受。换来的是插件隔离和独立重启——一个模块的 bug 不会拖垮整个平台。社区主流项目（Grafana、HashiCorp go-plugin、VS Code Extension Host）都选择了进程隔离。

### 1.3 隔离级别分层

不是所有插件都需要独立进程。manifest.yaml 声明隔离级别：

```yaml
# manifest.yaml
name: mes
isolation: process    # process（独立进程）| inline（内联平台核心）| container（Podman）
```

| 隔离级别          | 适用       | 通信方式                | 示例                             |
| ------------- | -------- | ------------------- | ------------------------------ |
| **inline**    | 平台基础设施模块 | 进程内函数调用             | base（用户/权限/配置）                 |
| **process**   | TS 业务模块  | UDS JSON-RPC（~20μs） | MES / ERP / OA                 |
| **container** | 异构技术栈模块  | HTTP + Zenoh        | Vision（Python/CUDA）/ Act（Rust） |

### 1.4 什么时候用 Podman

只有以下情况才使用 Podman 隔离：

| 条件      | 示例                                 |
| :------ | :--------------------------------- |
| 技术栈完全不同 | Vision 需要 CUDA + Python，无法塞进 TS 进程 |
| 资源隔离需求  | Act 实时控制需要 CPU 优先级保证               |
| 安全隔离    | 不信任的第三方模块                          |
| 独立伸缩    | Vision 需要独立扩缩容 GPU 节点              |

Podman 模块通过 HTTP API 与平台通信，由 Hono proxy 统一路由。

---

## 2. 架构

```
┌──────────────────────────────────────────────────────────────┐
│                        用户界面层                             │
│              HTTP/JSON + SSE（浏览器 ↔ 平台）                 │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ DesktopLayout   │  │ AdminLayout     │  ← 一键切换      │
│  └────────┬────────┘  └────────┬────────┘                  │
│           └──────────┬─────────┘                            │
│              Module Renderer                                 │
│         (模块页面组件，模式无关)                               │
│  React 19 + TanStack Router + Tailwind + Zustand            │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP/JSON + SSE
┌──────────────────────────┴───────────────────────────────────┐
│              平台核心进程 (Node.js + Hono) — Supervisor            │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Process  │ │ RPC Hub  │ │ Resource │ │  ACL     │        │
│  │ Manager  │ │ (UDS)    │ │ (代理层)  │ │ (中心化) │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Auth     │ │ Workflow │ │ Field    │ │ Recorder │        │
│  │ (JWT)    │ │ Engine   │ │ Interface│ │ (MCAP)   │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐                                  │
│  │ Hono     │ │ Podman   │  base 模块 inline 在此进程        │
│  │ Server   │ │ Proxy    │                                  │
│  └──────────┘ └──────────┘                                  │
│                                                              │
│  Recorder 旁路录制所有 RPC + 事件 → MCAP 文件                │
│  RPC Hub 一个 UDS 连接通吃：RPC + 事件广播 + 流式 + 健康检查  │
└───┬──────────┬──────────┬──────────────────┬────────────────┘
    │ UDS      │ UDS      │ UDS              │ HTTP + Zenoh
    │ ~20μs    │ ~20μs    │ ~20μs            │
┌───┴────────┐┌┴────────┐┌┴────────┐  ┌──────┴──────────────┐
│ MES 进程   ││ ERP 进程 ││ OA 进程  │  │ Podman 隔离模块      │
│ (Node.js)  ││ (Node.js)││ (Node.js)│  │                     │
│            ││          ││          │  │ ┌─────────────────┐ │
│ JSON-RPC   ││ JSON-RPC ││ JSON-RPC │  │ │ Vision (Python) │ │
│ Server     ││ Server   ││ Server   │  │ │ FastAPI + Zenoh │ │
│ on UDS     ││ on UDS   ││ on UDS   │  │ └─────────────────┘ │
│            ││          ││          │  │ ┌─────────────────┐ │
│ Collection ││Collection││Collection│  │ │ Act (Rust)      │ │
│ CRUD       ││ CRUD     ││ CRUD     │  │ │ adora + Zenoh   │ │
│ Services   ││ Services ││ Services │  │ └─────────────────┘ │
└──────┬─────┘└────┬─────┘└────┬─────┘  └─────────────────────┘
       └───────────┴───────────┘
                   │
       PostgreSQL（共享，schema 隔离）
       ├── mes.* / erp.* / oa.* / base.*
       └── 所有进程连接同一个 PG 实例
```

---

## 3. 平台核心职责

平台核心只做 9 件事，不做任何业务逻辑：

### 3.1 插件生命周期管理

```
模块生命周期：

afterAdd     → 模块代码加载到进程，注册到 PluginManager
beforeLoad   → 声明依赖、注册 Collection、声明事件
             ← Phase 1：所有模块同时执行 beforeLoad
load         → 注册路由、注册菜单、注册 Field Interface
             ← Phase 2：@hapi/topo 拓扑排序后按依赖顺序执行 load
install      → 首次安装：数据库迁移、创建默认数据、注册权限
upgrade      → 版本升级：增量迁移、数据兼容处理
beforeUninstall → 卸载前清理：删除路由、菜单、权限
```

```typescript
// Plugin 基类
abstract class Plugin {
    app: Application;
    name: string;
    version: string;

    // 生命周期钩子（子类按需 override）
    abstract beforeLoad(): void | Promise<void>;
    abstract load(): void | Promise<void>;

    async install() {}        // 默认空实现
    async upgrade(from: string) {}
    async beforeUninstall() {}

    // 服务定位器：获取其他模块的服务
    resolve<T>(service: string): T {
        return this.app.container.resolve<T>(service);
    }
}
```

### 3.2 Resource Manager

定义 Collection（数据模型）即自动生成 CRUD API，不需要手写路由：

```typescript
// MES 模块定义工单 Collection
const WorkOrderCollection = app.collection({
    name: 'mes_work_orders',
    fields: [
        { type: 'string', name: 'order_number', required: true, unique: true },
        { type: 'string', name: 'product_name', required: true },
        { type: 'integer', name: 'quantity', default: 0 },
        { type: 'enum', name: 'status', values: ['draft', 'confirmed', 'in_progress', 'done', 'cancelled'] },
        { type: 'belongsTo', name: 'production_line', target: 'mes_production_lines' },
    ],
});

// 自动生成的 API：
// GET    /api/mes_work_orders:list       列表（支持分页/筛选/排序）
// GET    /api/mes_work_orders:get?filter.byId=1  详情
// POST   /api/mes_work_orders:create     创建
// PUT    /api/mes_work_orders:update      更新
// DELETE /api/mes_work_orders:destroy     删除
```

### 3.3 Field Interface

语义类型 → DB 列 + Zod 校验 + React 组件，一处定义三层打通：

```typescript
// 注册自定义 Field Interface
app.fieldInterface.register('money', {
    // 数据库列定义
    column: { type: 'decimal', precision: 12, scale: 2 },
    // Zod 校验规则
    validate: z.number().nonnegative(),
    // React 编辑组件
    editor: MoneyInput,
    // React 展示组件
    viewer: MoneyDisplay,
});

// 在 Collection 中使用
const OrderCollection = app.collection({
    name: 'orders',
    fields: [
        { type: 'money', name: 'total_amount' },  // 自动应用以上三层
    ],
});
```

内置 Field Interface：`string`, `text`, `integer`, `float`, `boolean`, `date`, `datetime`, `enum`, `json`, `belongsTo`, `hasMany`, `manyToMany`

### 3.4 ACL（访问控制）

策略模板 + 运行时过滤注入 + 字段级权限：

```typescript
// 定义角色策略
app.acl.defineRole('shop_floor_worker', {
    // 策略模板：只看自己的工单
    'mes_work_orders': {
        strategy: 'own',           // own = 只能看自己创建的
        actions: ['list', 'get', 'update'],
        fields: {
            exclude: ['cost'],      // 不能看成本字段
        },
    },
    'mes_production_logs': {
        strategy: 'all',            // 能看所有生产日志
        actions: ['list', 'get', 'create'],
    },
});

// 运行时：Resource Manager 自动注入 filter
// worker 查询工单时，实际 SQL 自动加上 WHERE created_by = <current_user>
```

内置策略模板：
- `all`：能看所有数据
- `own`：只能看自己创建的
- `readonly`：只能看不能改
- `department`：只能看本部门数据

### 3.5 JWT 认证

```
平台管"你是谁"（JWT 签发/验证）
模块管"你能干什么"（通过 ACL）
```

- 平台签发 JWT（含 user_id, username, role）
- Hono 中间件自动验证所有 `/api/*` 请求
- 模块通过 `ctx.user` 获取当前用户
- Podman 模块验证 JWT：平台公开 JWKS 端点，隔离模块本地验签

### 3.6 Podman 代理

平台内置 Hono proxy，将 `/api/isolated/{module}/*` 路由到 Podman 容器：

```
请求 /api/isolated/vision/cameras/list
  │
  ▼
Hono proxy 匹配前缀 /api/isolated/vision
  │
  ├── 查询 Podman 容器 vision 的地址
  ├── 注入 X-User-Name header（从 JWT 解析）
  ├── 转发到 http://vision-container:8080/cameras/list
  └── 返回响应
```

### 3.7 进程管理（ProcessManager）

ProcessManager 负责子进程的生命周期管理——启动、监控、崩溃重启、优雅停止。

**借鉴来源**：Grafana Plugin Manager（子进程 + 崩溃重启）、VS Code Extension Host Starter（spawn + parent PID 监控）、Home Assistant Supervisor（Docker 容器生命周期）。

```
启动流程：
  ProcessManager.startPlugin('mes', './modules/mes/dist/index.js')
    ├── fork(entryFile)（node:child_process）
    ├── 传递环境变量（MODACS_PLUGIN_NAME, MODACS_SOCKET_PATH, DATABASE_URL）
    ├── 等待 Unix Socket 就绪（轮询 /tmp/modacs-mes.sock）
    ├── 注册到 RPC Hub（建立 JSON-RPC 连接）
    └── 标记为 running

崩溃恢复：
  子进程退出 → ProcessManager 收到 exit 事件
    ├── 指数退避重启（1s → 2s → 4s → ... → 30s 上限）
    ├── 最多重启 5 次，超过则标记为 failed
    └── 通知平台仪表盘

优雅停止：
  SIGTERM → 等待 10s → SIGKILL
```

### 3.8 RPC Hub（UDS JSON-RPC）

RPC Hub 是所有插件间通信的中枢。**一个 UDS 连接通吃所有通信模式**（对齐 Grafana/HashiCorp 社区做法）。

**借鉴来源**：Grafana（gRPC 单连接通吃）、HashiCorp go-plugin（gRPC/yamux 多路复用）、VS Code（MessagePort 单连接 60+ service pair）。

```
通信模式（全走同一条 UDS JSON-RPC 连接）：

RPC 请求-响应（MES → ERP 查库存）：
  Hub → ERP 进程: { method: "erp:InventoryService.checkStock", args: ["P-001", 100] }
  ERP → Hub: { result: { available: 850 } }
  延迟：~20μs

事件广播（MES 发工单创建事件）：
  Hub → 所有进程: { event: "work_order_created", data: {...} }
  延迟：~20μs × N（N = 订阅进程数）

流式数据（MES → OA 推送状态更新）：
  Hub → OA: { stream: "mes.production_status", data: {...} }（连续 notification）
  延迟：~20μs/帧

健康检查：
  Hub → MES: { method: "health" }
  MES → Hub: { result: { status: "ok", uptime: 3600 } }
  每 5s 自动执行
```

```typescript
// container.resolve<T>() 返回透明 RPC 代理
// 业务代码零修改——单进程时是函数调用，多进程时是 UDS RPC

const inventory = app.resolve<InventoryService>('erp:InventoryService');
const stock = await inventory.checkStock('P-001', 100);
// ↑ 业务代码完全一样，底层自动通过 UDS JSON-RPC 转发到 ERP 进程
```

### 3.8.1 通信模式决策：为什么不用 ZMQ / NNG / gRPC streaming

**MODACS 只需要三种通信模式，全部已有方案覆盖：**

```
┌─────────────────────────────────────────────────────────────┐
│  模式          场景                  方案                    │
├─────────────────────────────────────────────────────────────┤
│  req/rep       MES→ERP 查库存       HTTP POST /rpc → 响应   │
│  pub/sub       工单创建事件通知      HTTP POST /event fan-out│
│  streaming     Vision 检测帧         Zenoh（高通量）         │
│                浏览器告警推送        SSE（低频）             │
└─────────────────────────────────────────────────────────────┘

不需要的模式：
  push/pull   ❌  MODACS 不是消息队列，工作流引擎内部处理任务分发
  pair        ❌  无 1:1 独占通道需求
  gRPC stream ❌  Zenoh 已覆盖高频流式，SSE 覆盖浏览器推送
```

**为什么不用 ZMQ / NNG：**

| 维度 | ZMQ/NNG | HTTP over UDS（当前） |
|------|:---:|:---:|
| 通信模式 | 5 种 socket 类型 | 2 种（req/rep + fan-out）够用 |
| 路由 | 无（需自建） | URL 路由（Hono） |
| 中间件 | 无（需自建） | JWT/错误处理/日志（Hono） |
| 调试 | 需写代码发消息 | `curl --unix-socket` |
| MCAP 录制 | 二进制帧需自定义序列化 | JSON 直接存 MCAP，Foxglove 可读 |
| Node.js 生态 | 绑定成熟度一般 | 原生支持 |
| 复杂度 | 5 种 socket × 3 种模式 | 1 种语义（HTTP 请求→响应） |

**为什么不用 gRPC streaming：**

```
gRPC 四种模式 vs MODACS 场景：
  Unary（一问一答）    → HTTP POST 已覆盖
  Server streaming    → SSE / Zenoh 已覆盖
  Client streaming    → MODACS 不需要
  Bidirectional       → MODACS 不需要

gRPC streaming 典型场景：
  视频帧推送 → Zenoh（SHM 零拷贝，比 gRPC 快 10x）
  传感器数据 → Zenoh
  实时日志   → SSE（浏览器场景）

→ 没有一个场景需要 gRPC streaming
```

**当前 fan-out pub/sub 够用的量化分析：**

```
MODACS 规模：5-15 个插件，事件频率 < 10/s
fan-out 开销：15 插件 × 10 事件/s × 20μs = 3ms/s（0.3% CPU）
→ 完全可忽略

什么时候需要真正的 pub/sub broker（Redis/NATS）：
  ├── 插件数量 > 100
  ├── 事件频率 > 1000/s
  ├── 需要事件持久化（重启不丢事件）
  ├── 需要主题过滤（插件只收关心的事件）
  └── 需要跨节点事件传播 → NATS（已在 Cluster 设计中）
→ MODACS 当前都不满足
```

**升级路径（如果未来需要）：**

```
阶段 1（当前）：fan-out HTTP POST
  eventBus.emit() → 遍历插件 → POST /event         ~20 行

阶段 2（插件增多）：加订阅过滤
  插件启动时 POST /subscribe { topics: ["work_order.*"] }
  RPC Hub 只推送订阅了 topic 的插件                   +30 行

阶段 3（跨节点）：NATS
  本地事件不变（UDS fan-out）
  propagate=true 的事件 → NATS 转发                   +NATS 边车

每阶段增量改进，不推翻已有设计。
```

### 3.9 可观测性与录制（Recorder + MCAP）

平台内置 MCAP 旁路录制器，零侵入记录所有 RPC 调用、事件广播、工作流状态变化。与 ROS2 rosbag2 做法完全一致。

**借鉴来源**：ROS2 rosbag2（MCAP 录制 pub/sub 消息）、dora-rs .drec（录制 dataflow 消息）、Foxglove（MCAP 可视化回放）。

```
三层可观测性：

第 1 层：实时追踪（OpenTelemetry）
  RPC Hub 每次调用自动记录 span → Jaeger / Grafana Tempo
  作用：实时发现慢调用、错误率上升

第 2 层：录制回放（MCAP）
  Recorder 旁路录制所有 RPC + 事件 + Zenoh 数据流 → .mcap 文件
  Foxglove Studio 可视化回放（播放/暂停/seek/变速）
  作用：事后复现 bug、分析历史行为

第 3 层：进程健康监控
  ProcessManager 每 5s ping 子进程 → 平台仪表盘
  作用：发现即将崩溃的进程、资源泄漏
```

```
MCAP 录制内容示例：

时间轴 ──────────────────────────────────────────►
  │
  ├── 14:30:00.000  RPC out: erp:InventoryService.checkStock ["P-001", 100]
  ├── 14:30:00.022  RPC in:  { available: 850 } (22ms)
  ├── 14:30:00.025  Event:   work_order_created { id: 123 }
  ├── 14:30:00.028  RPC out: oa:ApprovalService.createApprovalRequest(123)
  ├── 14:30:00.045  RPC in:  { approval_id: 456 } (17ms)
  ├── 14:30:00.050  Event:   approval_requested { id: 456 }
  ├── 14:30:02.100  Workflow: human_task 主管审批 → interrupt
  ├── ...（3 小时后）...
  ├── 17:35:00.000  RPC out: workflow.resume(456, "approved")
  └── 17:35:00.020  Workflow: resume → completed

回放：Foxglove Studio 打开 .mcap 文件
  ├── 时间轴拖拽
  ├── 变速回放（0.5x / 1x / 2x / 10x）
  ├── 按 topic 筛选
  └── RPC 延迟趋势图（Plot 面板）
```

### 3.7 进程管理（ProcessManager）

管理 TS 业务插件子进程的生命周期：spawn、监控、崩溃重启、优雅停止。

**社区先例**：Grafana Plugin Manager（spawn Go 子进程 + 健康检查 + 自动重启）、VS Code ExtensionHostStarter（spawn Node.js 子进程 + 父进程监控）、Home Assistant Supervisor（Docker 容器生命周期管理）。

```typescript
// 插件子进程管理（~120 行）
class ProcessManager {
    private processes: Map<string, ManagedProcess> = new Map();

    async startPlugin(name: string, entryFile: string): Promise<void> {
        const proc = fork(entryFile, [], {
            cmd: ['bun', 'run', entryFile],
            env: {
                MODACS_PLUGIN_NAME: name,
                MODACS_SOCKET_PATH: `/tmp/modacs-${name}.sock`,
                DATABASE_URL: process.env.DATABASE_URL,
            },
            stdout: 'pipe',
            stderr: 'pipe',
        });

        // 监听退出 + 自动重启（指数退避）
        proc.exited.then((code) => {
            if (managed.restartCount < 5) {
                const delay = Math.min(1000 * Math.pow(2, managed.restartCount), 30000);
                setTimeout(() => this.startPlugin(name, entryFile), delay);
            }
        });

        // 等待 UDS 就绪
        await this.waitForSocket(`/tmp/modacs-${name}.sock`, 5000);
    }

    // 健康检查：每 5 秒 ping 子进程
    async healthCheck(name: string): Promise<boolean> {
        try {
            const res = await fetch(`http://unix:/tmp/modacs-${name}.sock/health`);
            return res.ok;
        } catch { return false; }
    }

    // 优雅停止：SIGTERM → 超时 10s → SIGKILL
    async stopPlugin(name: string): Promise<void> { /* ... */ }
}
```

### 3.8 RPC Hub（UDS JSON-RPC 统一通信）

**一个 UDS 连接通吃所有插件通信**——RPC、事件广播、流式数据、健康检查全走 JSON-RPC。对齐社区做法（Grafana gRPC、HashiCorp go-plugin、VS Code MessagePort 都只用一种 IPC）。

**为什么不做多通道分离**（UDS + PG LISTEN + Zenoh）：
- 四个主流开源项目没有一个做多传输分发
- 一种 IPC 通吃最简单，代码量最少（~200 行 vs ~420 行）
- JSON-RPC 传输无关：UDS 切 TCP 只需改一行配置

```typescript
// RPC Hub：所有插件通信的中枢
class RpcHub {
    private connections: Map<string, JsonRpcConnection> = new Map();
    private recorder: Recorder;  // 旁路录制

    // RPC 请求-响应（~20μs）
    async call(plugin: string, service: string, method: string, args: any[]): Promise<any> {
        const topic = `${service}.${method}`;
        this.recorder?.record(topic, { plugin, args }, 'out');    // 旁路录制
        const result = await this.connections.get(plugin)!.call(service, method, args);
        this.recorder?.record(topic, { plugin, result }, 'in');   // 旁路录制
        return result;
    }

    // 事件广播（经 Hub 转发到所有子进程）
    async emit(event: string, data: any, source?: string): Promise<void> {
        this.recorder?.record(event, { source, data }, 'event');  // 旁路录制
        for (const [plugin, conn] of this.connections) {
            if (plugin !== source) conn.notify('event', { event, data });
        }
    }

    // 健康检查
    async health(plugin: string): Promise<boolean> {
        return this.connections.get(plugin)?.call('__health', 'ping', []) ?? false;
    }
}
```

**container.resolve<T>() 返回透明 Proxy**，业务代码零修改：

```typescript
// 业务代码：完全不知道自己在跨进程调用
const inventory = app.resolve<InventoryService>('erp:InventoryService');
const stock = await inventory.checkStock('P-001', 100);
// ↑ 单进程时是函数调用，多进程时是 UDS RPC
//   业务代码完全一样，零修改
```

**通信矩阵**：

| 通信场景 | 通道 | 底层传输 | 延迟 | 业务代码 |
|---------|------|---------|------|---------|
| MES 查 ERP 库存 | RPC | UDS JSON-RPC | ~20μs | resolve() |
| MES 发工单事件 | 事件 | UDS JSON-RPC | ~20μs | eventBus.emit() |
| OA 收工单事件 | 事件 | UDS JSON-RPC | ~20μs | eventBus.on() |
| Vision 发检测结果 | 数据流 | Zenoh SHM | ~500μs | transport.pub() |
| 浏览器查工单 | HTTP | Hono→UDS | ~20μs | fetch() |
| 平台推送告警 | SSE | Hono stream | 实时 | EventSource |

### 3.9 可观测性（MCAP 录制 + 回放 + OpenTelemetry）

三层可观测性，零侵入业务代码：

**第 1 层：MCAP 旁路录制**

RPC Hub 的每条消息（RPC 调用、事件广播、工作流状态）自动旁路录制到 MCAP 文件。对齐 ROS2 rosbag2 做法（MCAP 是 ROS2 默认日志格式）。

```typescript
// Recorder 是 RPC Hub 的中间件，业务代码不感知
class Recorder {
    async record(topic: string, payload: unknown, direction: 'in'|'out'|'event'): Promise<void> {
        if (!this.recording) return;
        // 写入 MCAP：topic + timestamp + JSON payload
        await this.writer.writeMessage({ channelId, data, timestamp });
    }
}
```

**第 2 层：MCAP 回放 + Foxglove 可视化**

MCAP 文件可用 Foxglove Studio 打开，按原始时间间隔回放：
- 播放/暂停/拖拽/变速
- 3D 面板（Vision 检测帧 + 检测框叠加）
- Plot 面板（RPC 调用延迟趋势）
- 表格面板（所有事件列表，按时间筛选）

**第 3 层：OpenTelemetry 分布式追踪**

RPC Hub 每次调用自动记录 span（traceId 贯穿请求链），后端 Jaeger / Grafana Tempo。

**第 4 层：进程健康监控**

ProcessManager 每 5 秒 ping 子进程，仪表盘展示 CPU/RAM/重启次数。

### 3.7 进程管理器（ProcessManager）

负责 TS 业务插件子进程的完整生命周期管理（借鉴 Grafana Plugin Manager + HA Supervisor）：

```
职责：
├── 启动子进程（node:child_process.fork，传递 DB_URL / Socket 路径 / 配置）
├── 健康检查（每 5 秒 ping /health 端点）
├── 崩溃重启（指数退避：1s → 2s → 4s → ... → 30s 上限）
├── 优雅停止（SIGTERM → 10 秒超时 → SIGKILL）
├── 状态仪表盘（PID / 内存 / CPU / 重启次数 / 运行时间）
└── 日志聚合（子进程 stdout/stderr → 平台统一日志）
```

```typescript
// manifest.yaml 的 isolation 字段决定运行方式
async startPlugin(meta: PluginMeta) {
    if (meta.isolation === 'inline') return;  // base 模块，已在主进程
    if (meta.isolation === 'process') {
        // Node.js fork
        const proc = fork(meta.entryFile, [], {
            env: { MODACS_SOCKET_PATH: `/tmp/modacs-${meta.name}.sock`, ... },
        });
        await this.waitForSocket(`/tmp/modacs-${meta.name}.sock`, 5000);
        this.watch(proc, meta.name);  // 监听退出 + 自动重启
    }
    if (meta.isolation === 'container') {
        await this.podmanManager.startContainer(meta.name);
    }
}
```

### 3.8 RPC Hub（UDS JSON-RPC 路由）

所有 TS 插件间通信的中枢。**一个 UDS 连接通吃所有通信模式**（对齐 Grafana/HashiCorp 社区做法）：

```
RPC Hub 通信模式：
├── RPC 请求-响应：Host → Plugin POST /rpc/{service}/{method}
├── 事件广播：Host → 所有 Plugin JSON-RPC notification
├── 流式数据：Plugin → Host 连续 notification（如批量推送）
├── 健康检查：Host → Plugin GET /health
└── 全部走同一条 UDS 连接，JSON-RPC 协议
```

**业务代码透明**——`resolve<T>()` 返回 Proxy，调用方式和单进程完全一样：

```typescript
// 业务代码零修改：看起来是普通函数调用
const inventory = app.resolve<InventoryService>('erp:InventoryService');
const stock = await inventory.checkStock('P-001', 100);
// 底层：Proxy → UDS fetch → ERP 子进程处理 → 返回结果
// 延迟：~20μs（UDS round-trip）
```

**事件广播**也通过 RPC Hub 中转：

```typescript
// MES 进程发出事件
app.eventBus.emit('work_order_created', { id: 123 });
// 底层：EventEmitter → RPC Hub → 广播到所有子进程的 UDS → 各进程本地 EventEmitter

// OA 进程接收事件（和单进程代码一模一样）
app.eventBus.on('work_order_created', (data) => {
    this.notifyService.sendApprovalRequest(data);
});
```

### 3.9 可观测性（MCAP 录制 + Foxglove 实时调试 + OpenTelemetry）

**四层可观测性**，录制与实时调试共享同一 Event Bus 管道：

```
                         RPC Hub + Event Bus
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
   ┌────────────┐       ┌────────────┐       ┌────────────┐
   │  Recorder  │       │  Foxglove  │       │OpenTelemetry│
   │  (MCAP)    │       │  Bridge    │       │  Tracer     │
   │  离线录制   │       │  (WebSocket)│      │  实时追踪   │
   │  始终开启   │       │  按需开启   │       │  始终开启   │
   └─────┬──────┘       └─────┬──────┘       └────────────┘
         │                    │
         ▼                    ▼
   ┌──────────┐        ┌──────────────┐
   │ .mcap 文件│        │ Foxglove App │
   │ 离线回放  │        │ 实时调试      │
   └──────────┘        └──────────────┘
```

```
第 1 层：实时追踪（OpenTelemetry）
├── RPC Hub 每次调用自动记录 span（service / method / duration / plugin）
├── 跨插件调用链串联（traceId 贯穿）
└── 后端：Jaeger / Grafana Tempo

第 2 层：离线录制回放（MCAP 旁路录制）
├── Recorder 是 RPC Hub 的中间件，零侵入业务代码
├── 所有 RPC + 事件 + 工作流状态 → .mcap 文件
├── Zenoh 数据流（Vision/Act）也可统一录制到同一文件
├── Foxglove Studio 打开 .mcap 可视化回放（3D / Plot / 表格 / 时间轴）
└── 按原始时间间隔重放（支持变速 / 暂停 / seek）

第 3 层：实时调试（Foxglove WebSocket Bridge）
├── 与 Recorder 共享 Event Bus，并行消费，互不阻塞
├── WebSocket Server 运行在 ws://127.0.0.1:8765
├── Foxglove App 直连 → 实时看到所有 RPC 调用、事件、生命周期
├── 数据格式：JSON（无需解码 MCAP 二进制，方便开发时人眼查看）
├── 频道设计：rpc.{direction}.{module}.{method} / event.{module}.{name} / lifecycle.{module}
├── 按需开启（MODACS_DEBUG=1），生产环境不启动
└── 与 Recorder 互补：Recorder ="黑匣子"（出事回头看），Bridge ="实时监控屏"（开发盯着看）

第 4 层：进程健康监控
├── ProcessManager 每 5 秒 ping 子进程
├── 内存 / CPU / 重启次数 / 响应时间
└── 平台仪表盘展示
```

**Foxglove Bridge 实现要点**：

```typescript
// packages/server/src/foxglove-bridge.ts（~150 行）
// 与 Recorder 共享同一个 eventBus，零侵入

class FoxgloveBridge {
    private wss: WebSocketServer;
    private channels: Map<string, Channel>;

    constructor(private eventBus: EventBus) {
        // 预注册频道（与 Recorder 共享 topic 定义）
        this.register('rpc.request',  'modacs.RpcRequest');
        this.register('rpc.response', 'modacs.RpcResponse');
        this.register('lifecycle',    'modacs.LifecycleEvent');

        // 订阅 Event Bus（与 Recorder 并行）
        this.eventBus.on('rpc',       (e) => this.publish(`rpc.${e.direction}`, e));
        this.eventBus.on('lifecycle', (e) => this.publish('lifecycle', e));
    }

    start(port = 8765) {
        this.wss = new WebSocketServer({ port, host: '127.0.0.1' });
        this.wss.on('connection', (ws) => {
            // 1. serverInfo → 2. advertise 所有频道 → 3. 处理 subscribe
            ws.send(JSON.stringify({ op: 'serverInfo', name: 'MODACS', ... }));
            for (const ch of this.channels.values())
                ws.send(JSON.stringify({ op: 'advertise', channels: [ch] }));
            ws.on('message', (raw) => {
                const { op, subscriptions } = JSON.parse(raw.toString());
                if (op === 'subscribe') client.subs.add(...subscriptions);
            });
            // 后续所有 publish() 调用自动推送给订阅客户端
        });
    }

    private publish(topic: string, data: object) {
        const ch = this.channels.get(topic);
        if (!ch) return;
        const msg = JSON.stringify({ op: 'message', channel: ch.id,
                                      data: JSON.stringify(data) });
        for (const client of this.clients)
            if (client.subs.has(ch.id)) client.send(msg);
    }
}
```

**启动方式**：

```bash
# 正常模式（仅 Recorder 录制，无实时调试）
pnpm dev

# 调试模式（Recorder + Bridge，Foxglove 实时监控）
MODACS_DEBUG=1 pnpm dev
# → [foxglove-bridge] Live debug at ws://127.0.0.1:8765
```

**Foxglove App 连接**：Open connection → Foxglove WebSocket → `ws://127.0.0.1:8765` → 实时 RPC 时间轴、延迟分布图（Plot 面板）、模块生命周期日志。

**Recorder vs Bridge 对比**：

| | Recorder (MCAP) | Foxglove Bridge |
|------|:---|:---|
| 协议 | 文件 I/O (append) | WebSocket (push) |
| 用途 | 离线回放、事后分析 | 实时调试、开发监控 |
| 开启条件 | 始终开启 | `MODACS_DEBUG=1` |
| 数据格式 | MCAP 二进制（高效存储） | JSON（人眼可读） |
| 持久化 | ✅ 文件存储 | ❌ 断连即失 |
| Foxglove 连接 | 打开 .mcap 文件 | 输入 ws:// 地址 |
| 性能影响 | 极低 | 低（仅调试时、本地回环） |

### 3.7 工作流引擎

平台内置 DAG 工作流引擎，为 OA 审批、MES 生产流程编排、ERP 业务流转提供统一的流程自动化能力。

**借鉴来源**：

| 来源 | 借鉴概念 | 用途 |
| :--- | :--- | :--- |
| **n8n** | DAG 执行器（栈 + 等待队列 + 节点循环） | 工作流执行核心 |
| **n8n** | 部分执行（从任意节点调试） | 工作流编辑器调试 |
| **n8n** | 执行恢复（崩溃后恢复卡住的执行） | 长流程容错 |
| **Coze** | 中断与恢复（Interrupt & Resume） | 人工审批暂停/恢复 |
| **Coze** | State 状态管理 + 快照持久化 | 跨天流程状态保持 |
| **Coze** | 复合节点/子图（Loop/Batch 内嵌子 DAG） | 批量操作 |
| **Dify** | 工作流 DSL（YAML 定义，可导出/版本控制） | 工作流定义格式 |
| **Dify** | 变量作用域（System/Env/Conversation/NodeOutput） | 数据传递 |

**核心设计**：

```typescript
// 工作流定义（YAML DSL，借鉴 Dify）
interface WorkflowDefinition {
    name: string;
    version: number;
    trigger: { type: 'event' | 'schedule' | 'manual'; event?: string };
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
}

// 节点类型（借鉴 n8n 分类 + MODACS 业务适配）
type NodeType =
    | 'trigger'      // 事件触发
    | 'action'       // 调用模块服务（container.resolve）
    | 'condition'    // 条件分支
    | 'merge'        // 多输入合并（等所有上游到齐）
    | 'delay'        // 延迟/定时
    | 'human_task'   // 人工任务（借鉴 Coze 中断恢复）
    | 'loop'         // 循环/批处理（内嵌子 DAG）
    | 'code';        // 自定义 TypeScript 代码

// 工作流执行实例
interface WorkflowExecution {
    id: string;
    definitionId: string;
    status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    state: WorkflowState;        // 借鉴 Coze：全局状态对象
    currentNodeId: string;       // 当前执行到的节点
    triggerData: any;
    startedAt: Date;
    pausedAt?: Date;             // 中断时间
    completedAt?: Date;
}
```

**中断与恢复**（借鉴 Coze，最核心的能力）：

```
工单审批流程示例：

创建工单 → 主管审批 → [暂停：等待主管操作] → 总经理审批 → [暂停] → 完成

执行流程：
  1. 事件 work_order_created 触发工作流
  2. 执行到 human_task 节点（主管审批）
  3. 抛出 InterruptError → 引擎捕获 → 持久化 State 到数据库
  4. 工作流状态变为 'paused'
  5. 主管在 UI 点击"通过" → 调用 resume API
  6. 引擎加载快照 → 从断点恢复 → 继续执行下一个节点
  7. 总经理审批同理 → 暂停 → 恢复 → 完成
```

```typescript
// 中断恢复实现（借鉴 Coze 的 InterruptError 模式）

class WorkflowEngine {
    async executeNode(node: WorkflowNode, inputs: any, state: WorkflowState): Promise<NodeResult> {
        if (node.type === 'human_task') {
            // 人工任务：暂停工作流，持久化状态
            throw new InterruptError({
                nodeId: node.id,
                workflowId: state.workflowId,
                stateSnapshot: state.serialize(),
                resumeCondition: {
                    type: 'approval',
                    approverId: node.config.approverId,
                    timeoutHours: node.config.timeoutHours ?? 72,
                },
            });
        }
        // 普通节点：正常执行
        return await this.executeNormalNode(node, inputs, state);
    }

    // 外部条件满足后恢复执行
    async resume(executionId: string, resumeData: any): Promise<ExecutionResult> {
        const execution = await this.db.getExecution(executionId);
        const state = WorkflowState.deserialize(execution.state);
        // 从断点节点的下一个节点继续执行
        return await this.executeFrom(execution.currentNodeId, resumeData, state);
    }

    // 启动时恢复中断的执行（借鉴 n8n ExecutionRecoveryService）
    async recoverInterrupted(): Promise<void> {
        const stuck = await this.db.select()
            .from(workflow_executions)
            .where(eq(workflow_executions.status, 'running'));

        for (const exec of stuck) {
            // 超时的运行中执行 → 标记为需要恢复
            console.log(`[WorkflowEngine] Recovering execution ${exec.id}`);
            await this.resume(exec.id, {});
        }
    }
}
```

**节点与模块服务的桥接**：

```typescript
// action 节点通过 container.resolve 调用模块服务
async executeActionNode(node: WorkflowNode, inputs: any): Promise<NodeResult> {
    const { service, method, args } = node.config;

    // 通过服务定位器获取模块服务（零网络开销）
    const svc = this.app.container.resolve(service);
    const result = await svc[method](...this.resolveArgs(args, inputs));

    return { outputs: [result], next: node.config.next };
}
```

**工作流定义与执行记录**存储为 Collection，通过 Resource Manager 自动生成 CRUD API：

```typescript
// 工作流定义 Collection
app.collection({
    name: 'workflow_definitions',
    fields: [
        { type: 'string', name: 'name', required: true, unique: true },
        { type: 'text', name: 'definition', required: true },     // YAML DSL
        { type: 'enum', name: 'status', values: ['draft', 'published', 'archived'] },
        { type: 'integer', name: 'version', default: 1 },
    ],
});

// 工作流执行实例 Collection
app.collection({
    name: 'workflow_executions',
    fields: [
        { type: 'belongsTo', name: 'definition', target: 'workflow_definitions' },
        { type: 'enum', name: 'status', values: ['running', 'paused', 'completed', 'failed', 'cancelled'] },
        { type: 'json', name: 'state' },              // 序列化的 State 对象
        { type: 'string', name: 'current_node' },
        { type: 'json', name: 'trigger_data' },
        { type: 'datetime', name: 'started_at' },
        { type: 'datetime', name: 'paused_at' },
        { type: 'datetime', name: 'completed_at' },
    ],
});
```

**工作流 DSL 示例**（YAML，借鉴 Dify）：

```yaml
# 工单审批流程
name: work_order_approval
version: 1
trigger:
  type: event
  event: work_order_created

nodes:
  - id: check_amount
    type: condition
    config:
      expression: "trigger.data.amount > 10000"
    branches:
      - { output: 0, to: manager_approval }
      - { output: 1, to: supervisor_approval }

  - id: supervisor_approval
    type: human_task
    config:
      approver_role: supervisor
      timeout_hours: 24
    next: [update_status]

  - id: manager_approval
    type: human_task
    config:
      approver_role: manager
      timeout_hours: 48
    next: [update_status]

  - id: update_status
    type: action
    config:
      service: mes:WorkOrderService
      method: updateStatus
      args: { status: "approved" }
```

---

## 4. 模块包格式（manifest.yaml）

### 4.1 设计来源

融合 5 家设计：

| 来源 | 借鉴 |
| :--- | :--- |
| **Odoo** | `depends` / `auto_install` |
| **NocoBase** | `events` / `exports` |
| **Grafana** | contribution points（菜单、路由注册点） |
| **Strapi** | `migrations` 目录约定 |
| **DSM/飞牛** | 7 脚本生命周期 + `ui` 桌面入口配置 |

### 4.2 manifest.yaml 示例

```yaml
# MES 模块清单
name: mes
version: 0.1.0
description: "制造执行系统"
category: manufacturing
author: cxw
license: MIT

# Odoo 式依赖
depends:
  - base      # 依赖基础模块（用户/权限/通知）
  - erp       # MES 依赖 ERP 的库存数据

auto_install: false   # 不自动安装，用户手动启用

# 模块类型：process（进程内）或 isolated（Podman 容器）
type: process

# 数据库
database:
  schema: mes          # PG schema 隔离
  migrations: migrations/

# Grafana 式 contribution points
contributes:
  menus:
    - id: mes.work_orders
      label: 工单管理
      icon: clipboard-list
      path: /mes/work-orders
      order: 10
      parent: manufacturing
    - id: mes.bom
      label: BOM 管理
      icon: list-tree
      path: /mes/bom
      order: 20
      parent: manufacturing
  routes:
    - path: /mes/work-orders
      component: ./pages/WorkOrderList
    - path: /mes/work-orders/:id
      component: ./pages/WorkOrderDetail
  desktop:
    icon: ./assets/mes-icon.svg
    label: MES
    default_window_size: [1024, 768]

# NocoBase 式事件声明
events:
  publishes:
    - work_order_created
    - work_order_started
    - work_order_completed
    - work_order_paused
    - quality_check_failed
  subscribes:
    - defect_detected        # 订阅 Vision 的缺陷检测事件
    - inventory_low          # 订阅 ERP 的库存不足事件

# 导出的服务（供其他模块通过 container.resolve 调用）
exports:
  - name: WorkOrderService
    description: "工单查询/创建/状态变更"
  - name: BomService
    description: "BOM 查询/展开"

# 硬件要求（主要针对 isolated 模块）
requirements:
  min_ram: 512MB
  gpu: none
  disk: 1GB

# DSM 式生命周期脚本（可选，主要用于 isolated 模块）
scripts:
  pre_install: scripts/pre-install.sh
  post_install: scripts/post-install.sh
  pre_upgrade: scripts/pre-upgrade.sh
  post_upgrade: scripts/post-upgrade.sh
  pre_uninstall: scripts/pre-uninstall.sh
  post_uninstall: scripts/post-uninstall.sh
```

### 4.3 进程内模块 vs 隔离模块

| 维度 | 进程内模块（`type: process`） | 隔离模块（`type: isolated`） |
| :--- | :--- | :--- |
| 运行方式 | 动态加载到平台 Node.js 进程 | Podman 容器独立运行 |
| 技术栈 | TypeScript（必须） | 任意（Rust/Python/C++） |
| 数据库 | 共享 PG，schema 隔离 | 可共享 PG 或独立 DB |
| 通信方式 | `container.resolve<T>()` | HTTP API |
| 典型模块 | MES, ERP, OA, 排班 | Vision, Act |
| 部署 | 随平台二进制 | 独立容器镜像 |

---

## 5. 模块间通信

### 5.1 通信架构总览

```
通信场景              通道              底层传输       延迟      业务代码感知
──────────────────────────────────────────────────────────────────────────
MES 查 ERP 库存      RPC              UDS JSON-RPC   ~20μs    resolve()
MES 发工单事件        事件广播          UDS JSON-RPC   ~20μs    eventBus.emit()
OA 收工单事件         事件订阅          UDS JSON-RPC   ~20μs    eventBus.on()
Vision 发检测结果     数据流            Zenoh SHM      ~500μs   transport.pub()
MES 启动 Vision 检测  RPC→HTTP         UDS→Hono Proxy  ~20μs    resolve()
浏览器查工单列表      HTTP              Hono→UDS       ~20μs    fetch()
平台推送告警到浏览器  SSE              Hono stream    实时      EventSource
跨节点聚合查询        HTTP              HTTP API       ~网络RTT  fetch()
```

### 5.2 插件间 RPC（UDS JSON-RPC，~20μs）

业务代码使用 `container.resolve<T>()`，底层自动通过 UDS JSON-RPC 转发。**业务代码和单进程时一模一样，零修改。**

```typescript
// MES 模块需要查 ERP 库存
class WorkOrderService {
    async createWorkOrder(data: WorkOrderInput) {
        // resolve 返回 Proxy，调用 checkStock 自动转发到 ERP 子进程的 UDS
        const inventory = this.app.resolve<InventoryService>('erp:InventoryService');
        const stock = await inventory.checkStock(data.productId, data.quantity);

        if (!stock.sufficient) {
            throw new Error(`库存不足：需要 ${data.quantity}，可用 ${stock.available}`);
        }

        const workOrder = await this.workOrderRepo.create(data);

        // 事件通过 RPC Hub 广播到所有子进程
        this.app.eventBus.emit('work_order_created', { workOrder });

        return workOrder;
    }
}
```

底层实现：

```typescript
// 平台核心：resolve 返回透明 Proxy（~50 行）
function createRpcProxy<T>(serviceName: string): T {
    const pluginName = serviceName.split(':')[0];
    const socketPath = `/tmp/modacs-${pluginName}.sock`;

    return new Proxy({} as T, {
        get: (_, method: string) => {
            return async (...args: any[]) => {
                const res = await fetch(`http://unix:${socketPath}/rpc/${serviceName}/${method}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ args }),
                });
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            };
        },
    });
}

// 子进程侧：Hono 接收 RPC（~15 行）
udsServer.post('/rpc/:service/:method', async (c) => {
    const { service, method } = c.req.param();
    const { args } = await c.req.json();
    const svc = app.container.resolve(service);
    return c.json(await svc[method](...args));
});
```

### 5.3 事件广播（UDS JSON-RPC，~20μs）

业务代码使用 `eventBus.emit/on`，底层通过 RPC Hub 跨进程分发：

```typescript
// OA 模块监听工单创建事件（OA 进程内）
class OaPlugin extends Plugin {
    load() {
        this.app.eventBus.on('work_order_created', (data) => {
            this.notificationService.send({
                to: data.workOrder.manager_id,
                title: '新工单已创建',
                body: `工单号：${data.workOrder.order_number}`,
            });
        });

        // MES 订阅 Vision 的缺陷检测事件
        this.app.eventBus.on('defect_detected', (data) => {
            this.pauseWorkOrder(data.work_order_id, '检测到产品缺陷，自动暂停');
        });
    }
}
```

```
事件流转路径：
MES 进程 emit('work_order_created')
  → MES 的 UDS connection → RPC Hub
  → RPC Hub 广播到所有其他子进程
  → OA 进程的 EventEmitter 收到 → 执行 handler
  → ERP 进程的 EventEmitter 收到 → 执行 handler
```

### 5.4 与 Podman 模块通信

Podman 模块（Vision/Act）不参与 UDS 通信，通过两种方式与平台交互：

```
业务 API（低频，请求-响应）：
  通过 Hono proxy 转发 HTTP
  POST /api/isolated/vision/cameras/{id}/analysis/start
  → Hono proxy → http://vision-container:8080/cameras/{id}/analysis/start

数据流（高频，大 payload）：
  通过 Zenoh pub/sub
  Vision 发布检测结果 → Zenoh SHM 零拷贝 → 平台核心订阅
  → 转发到 eventBus → MES/OA 收到通知
```

### 5.5 客户端通信

```
浏览器 → 平台：HTTP/JSON（TanStack Query）
平台 → 浏览器：SSE（告警/状态推送）
浏览器 → 平台（低频监控）：轮询（5s）
```

### 5.6 事件目录

| 事件 | 发布者 | 订阅者 | 触发场景 |
|------|--------|--------|---------|
| `work_order_created` | MES | ERP, OA | 创建工单 |
| `work_order_started` | MES | Vision, ERP | 工单启动生产 |
| `work_order_completed` | MES | ERP, OA | 工单完成 |
| `work_order_paused` | MES | ERP, OA | 工单暂停 |
| `quality_check_failed` | MES | OA, ERP | 质量检测不合格 |
| `defect_detected` | Vision | MES | 检测到产品缺陷 |
| `action_triggered` | Vision | MES | 规则触发动作（如停机） |
| `inventory_low` | ERP | MES, OA | 库存不足 |
| `maintenance_due` | MES | OA | 设备需要维护 |

---

## 6. 前端架构：三层 UI 隔离

> 目标：模块代码不直接依赖任何 UI 框架，未来可切换 UI 框架（如 shadcn/ui → Ant Design）而不改业务代码。

### 6.1 为什么需要隔离

MODACS 选定 shadcn/ui + Tailwind，但 UI 框架的演进速度快（shadcn/ui 2023 年才出现）。如果 100+ 个模块页面直接 `import { Button } from 'shadcn/ui'`，未来切换框架需要改 100+ 个文件。通过三层隔离，切换成本从 ~4 周降到 ~1 周。

### 6.2 三层结构

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 3：模块页面（WorkOrderList, BomEditor...）              │
│                                                              │
│  模块开发者写的代码：                                          │
│  ├── ❌ 禁止 import shadcn/ui / @tanstack/react-table         │
│  ├── ✅ import { DataTable, FormBuilder, Button } from '@modacs/ui'│
│  └── ✅ 使用 Field Interface 注册的组件                        │
│                                                              │
│  100+ 个页面，80% 是业务逻辑 + 调用 Layer 2 组件               │
│  切换时：大部分不改（className 可保留 Tailwind 做布局）         │
├──────────────────────────────────────────────────────────────┤
│  Layer 2：平台复合组件（@modacs/ui/composites）                │
│                                                              │
│  ├── DataTable       稳定 API：columns / data / sortable      │
│  ├── FormBuilder     稳定 API：schema / onSubmit              │
│  ├── StatusBadge     稳定 API：status / variant               │
│  ├── DetailPanel     稳定 API：fields / data                  │
│  ├── FilterBar       稳定 API：filters / onChange             │
│  └── ActionBar       稳定 API：actions / onItemClick          │
│                                                              │
│  ~10 个组件，定义稳定接口，内部实现可换                         │
│  当前实现：shadcn/ui + TanStack Table + React Hook Form       │
├──────────────────────────────────────────────────────────────┤
│  Layer 1：Field Interface 组件 + UI Adapter                   │
│                                                              │
│  ├── Field 组件：MoneyInput / SelectInput / ...（~40 个）     │
│  │   通过 FieldInterfaceRegistry 注册，模块不直接 import       │
│  │                                                            │
│  └── UI Adapter：UIAdapter 接口（~100 行，框架无关）           │
│      ├── shadcn-adapter.ts（当前实现）                        │
│      └── (future) antd-adapter.ts（未来可替换）               │
│                                                              │
│  切换：重写 adapter + Field 组件（~60 个文件），API 不变        │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 UI Adapter 接口

```typescript
// packages/ui/src/adapters/types.ts

import type { ComponentType } from 'react';

/** UI 适配器接口——切换 UI 框架只需实现这个接口 */
export interface UIAdapter {
    Button: ComponentType<UIButtonProps>;
    Input: ComponentType<UIInputProps>;
    Select: ComponentType<UISelectProps>;
    Checkbox: ComponentType<UICheckboxProps>;
    DatePicker: ComponentType<UIDatePickerProps>;
    Modal: ComponentType<UIModalProps>;
    Drawer: ComponentType<UIDrawerProps>;
    Tabs: ComponentType<UITabsProps>;
    Tooltip: ComponentType<UITooltipProps>;
    Popover: ComponentType<UIPopoverProps>;
    Dropdown: ComponentType<UIDropdownProps>;
    Toast: { show: (msg: string, opts?: UIToastOptions) => void };
}

// 框架无关的 Props
export interface UIButtonProps {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
}

export interface UIInputProps {
    value?: string | number;
    placeholder?: string;
    disabled?: boolean;
    error?: string;
    onChange?: (value: string) => void;
}

export interface UIModalProps {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}
// ... 其他原语 Props
```

### 6.4 复合组件 API（稳定，不随 UI 框架变化）

```typescript
// DataTable：模块最常用的高频组件
export interface DataTableProps<T> {
    data: T[];
    columns: DataTableColumn<T>[];
    sortable?: boolean;
    filterable?: boolean;
    pagination?: boolean;
    pageSize?: number;
    onRowClick?: (row: T) => void;
    emptyText?: string;
}

// FormBuilder：从 Collection 定义自动生成表单
export interface FormBuilderProps {
    collection: CollectionDefinition;
    defaultValues?: Record<string, any>;
    onSubmit: (values: Record<string, any>) => void;
    submitText?: string;
}

// StatusBadge：状态标签
export interface StatusBadgeProps {
    status: string;
    variant?: 'default' | 'success' | 'warning' | 'danger';
}
```

### 6.5 模块开发者怎么用

```typescript
// modules/mes/src/pages/WorkOrderList.tsx

// ❌ 禁止：直接 import shadcn/ui
// import { Button } from 'shadcn/ui';

// ✅ 正确：从 @modacs/ui 导入
import { DataTable, Button, StatusBadge } from '@modacs/ui';

export function WorkOrderList() {
    const { data } = useQuery({
        queryKey: ['work-orders'],
        queryFn: () => fetch('/api/mes_work_orders:list').then(r => r.json()),
    });

    return (
        <div className="space-y-4">
            <Button variant="primary" onClick={() => navigate('/mes/work-orders/new')}>
                新建工单
            </Button>
            <DataTable
                data={data?.data ?? []}
                columns={[
                    { key: 'order_number', header: '工单号', sortable: true },
                    { key: 'product_name', header: '产品' },
                    { key: 'status', header: '状态', render: (row) => <StatusBadge status={row.status} /> },
                ]}
                sortable
                pagination
            />
        </div>
    );
}
```

### 6.6 切换 UI 框架的成本

```
切换场景：shadcn/ui → Ant Design

需要改的（~60 个文件，~1 周）：
├── packages/ui/src/adapters/
│   └── shadcn-adapter.ts → antd-adapter.ts（~200 行重写）
├── packages/ui/src/fields/
│   └── ~20 个 Field 组件重写（用 antd 原语）
├── packages/ui/src/composites/
│   └── ~10 个复合组件微调（adapter 原语自动切）
└── packages/ui/src/layout/
    └── 2 个布局组件微调

不需要改的（100+ 个文件）：
├── 所有模块页面（WorkOrderList, BomEditor...）
│   ├── DataTable / FormBuilder / Button 的 props 不变
│   └── 业务逻辑完全不变
├── 所有后端代码
└── 所有类型定义
```

### 6.7 不做的事

```
❌ 不做 Schema-Driven UI（NocoBase Formily 模式）——太重，限制灵活性
❌ 不做完整 CSS 抽象——Tailwind class 在模块代码中允许，切换时保留做布局
❌ 不做运行时 UI 框架切换——编译时绑定一个 adapter
❌ 不抽象 TanStack Table / React Hook Form——它们本身是 headless 的，不绑 UI 框架
```

### 6.8 CSS 变量主题

用 CSS 变量定义语义化颜色，UI 框架无关：

```css
:root {
    --color-primary: #2563eb;
    --color-danger: #dc2626;
    --color-success: #16a34a;
    --color-bg: #ffffff;
    --color-bg-muted: #f9fafb;
    --color-border: #e5e7eb;
    --color-text: #111827;
    --radius-md: 6px;
}
.dark {
    --color-bg: #0f172a;
    --color-text: #f1f5f9;
}
```

---

## 7. 前端双 UI 模式

### 6.1 架构

```
┌──────────────────────────────────────────────────────────┐
│                    Layout Provider                        │
│                                                          │
│  根据 useUserPreferences().layoutMode 选择：               │
│  ├── 'desktop' → DesktopLayout（桌面窗口模式）            │
│  └── 'admin'   → AdminLayout（管理面板模式）              │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────┐
│                   Module Renderer                         │
│                                                          │
│  接收模块元数据 + 路由 → 渲染对应页面组件                   │
│  不关心外层是窗口还是面板                                   │
│  <WorkOrderList /> 在两种模式下完全相同                    │
└──────────────────────────────────────────────────────────┘
```

### 6.2 桌面窗口模式

```
┌──────────────────────────────────────────────────────┐
│  （壁纸）                                              │
│                                                      │
│  ┌──────┐  ┌─────────────────────────────────────┐  │
│  │ 📋MES │  │ 工单管理                    _ □ ×  │  │
│  │      │  ├─────────────────────────────────────┤  │
│  └──────┘  │                                     │  │
│  ┌──────┐  │  <WorkOrderList />                  │  │
│  │ 📦ERP │  │  （同一个组件）                      │  │
│  │      │  │                                     │  │
│  └──────┘  └─────────────────────────────────────┘  │
│  ┌──────┐                                            │
│  │ 📧OA  │  ┌─────────────────────────────────┐    │
│  └──────┘  │ 库存查询               _ □ ×    │    │
│            └─────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ ▼ 开始  │ MES(工单) │ ERP(库存)  │ 🖥️📋 👤 │   │  ← 任务栏
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘

特点：多窗口并存、拖拽缩放、桌面图标 + 任务栏
适合：车间一体机、产线看板、触屏操作
```

### 6.3 Admin 面板模式

```
┌────┬───────────────────────────────────────────────┐
│MODACS│ 工单管理 > 工单列表           🖥️ 📋 👤      │
├────┤───────────────────────────────────────────────┤
│ 制造 │                                             │
│ ├工单│  <WorkOrderList />                          │
│ ├BOM │  （同一个组件）                               │
│ │    │                                             │
│ 资源 │                                             │
│ ├采购│                                             │
│ ├库存│                                             │
│ 办公 │                                             │
│ ├审批│                                             │
│ └通知│                                             │
└────┴───────────────────────────────────────────────┘

特点：侧边栏导航、全屏内容区、一次看一页
适合：办公室 PC、管理终端、鼠标键盘操作
```

### 6.4 代码共享

```
可以共享（~90%）：
├── 所有模块页面组件（WorkOrderList, BomEditor, InventoryTable...）
├── 所有 UI 组件（Table, Form, Select, Badge, Button...）
├── 所有 API 调用逻辑（TanStack Query hooks）
├── 所有业务逻辑（services, utils）
├── 所有类型定义（Drizzle schema → TS 类型）
└── 所有验证规则（Zod schemas）

不能共享（~10%）：
├── 外层布局（DesktopLayout vs AdminLayout）
├── 导航机制（桌面图标 + 任务栏 vs 侧边栏菜单）
├── 路由行为（窗口管理 vs 路由切换）
└── 窗口管理器（仅桌面模式需要）
```

---

## 7. 模块清单（规划）

### 7.1 首批模块

| 模块 | 类型 | 技术栈 | 状态 | 文档 |
|------|------|--------|------|------|
| **base** | process | TS + Drizzle | 规划中 | — |
| **MES** | process | TS + React（从 Carbon 提取） | 规划中 | [MES-Development-Plan](./MES-Development-Plan.md) |
| **MODACS Vision** | isolated | Rust + CUDA + Python | 规划中 | [MODACS-Vision](./MODACS-Vision.md) |

### 7.2 后续模块

| 模块 | 类型 | 定位 | 技术栈方向 |
|------|------|------|-----------|
| **ERP** | process | 资源管理（采购/库存/销售） | TS + React |
| **OA** | process | 办公自动化（审批/通知） | TS + React |
| **排班** | process | 排班引擎 | TS + React |
| **DataScreen** | process | 数据可视化大屏 | TS + ECharts |
| **MODACS Act** | isolated | 软 PLC（IEC 61131-3） | Rust |

### 7.3 模块独立性原则

```
每个进程内模块必须：
├── 独立 schema：自己的 PG schema（mes.*, erp.*, oa.*）
├── 独立迁移：自己的 migrations/ 目录
├── 独立启用/禁用：可以在运行时启用/禁用
├── 独立升级：版本号独立，upgrade 钩子处理兼容
├── 声明依赖：depends 明确声明，拓扑排序保证加载顺序
└── 标准接口：通过 exports 声明可被其他模块调用的服务

模块降级运行：
├── ERP 模块未启用 → MES 的库存查询功能不可用，但工单 CRUD 正常
├── OA 模块未启用 → 事件发出但无人接收，不影响业务
└── Vision 模块未启用 → MES 工单正常跑，只是没有缺陷检测
```

---

## 8. 仓库组织

```
modacs/                           # 单一 Git 仓库（pnpm workspace monorepo）
├── package.json                  # workspace 配置
├── packages/
│   ├── core/                     # 平台核心
│   ├── ui/                       # 共享前端（布局 + 组件）
│   └── shared/                   # 共享类型 + 工具
├── modules/                      # 进程内业务模块
│   ├── base/
│   ├── mes/
│   ├── erp/
│   └── oa/
├── modules-isolated/             # Podman 隔离模块
│   ├── vision/
│   └── act/
└── docs/                         # 文档 + 模块开发规范
```

**为什么用 monorepo**：
- 平台核心和模块共享 `packages/shared` 类型定义
- 原子提交：平台 API 变更和模块适配在同一个 commit
- 统一 CI/CD：一次 `pnpm build`（esbuild）打包平台 + 所有进程内模块
- 不影响隔离模块：Vision/Act 有独立的 Dockerfile 和构建流程

---

## 9. 落地节奏

### 9.1 核心原则：先平台后模块

```
与之前的"先有应用再抽象平台"不同，现在选择"先平台后模块"：

原因：
├── Carbon 已有完整业务逻辑，不需要从零写应用来验证平台
├── NocoBase 6 大概念已研究透彻，平台设计有明确参考
├── TS/Node.js/Hono 技术栈成熟，平台骨架可以快速搭建
└── 先搭平台 → 定义模块规范 → 提取 Carbon 为 MES 模块 → 验证规范

节奏：
Phase 1：平台骨架（Plugin + Hono + Drizzle + Admin Layout）
Phase 2：核心能力（Resourcer + Field Interface + ACL）
Phase 3：首个模块（MES，从 Carbon 提取）
Phase 4：Podman 集成（Vision 模块接入）
```

### 9.2 四阶段演进

| 阶段 | 时间 | 目标 | 产出 |
|------|------|------|------|
| **Phase 1** | Week 1-3 | 平台骨架 | Plugin 基类 + PluginManager + Hono server + Drizzle + Admin Layout |
| **Phase 2** | Week 4-9 | 核心能力 | Resource Manager + Field Interface + ACL + JWT 认证 + 工作流引擎 |
| **Phase 3** | Week 10-15 | 首个模块 | MES 模块（从 Carbon 提取）+ 桌面窗口模式 + 双 UI 切换 |
| **Phase 4** | Week 16-19 | Podman 集成 | Podman Proxy + manifest 包格式 + Vision 模块接入 |

> **集群管理**（多节点部署、集中升级、联邦）见 [MODACS-Cluster](./MODACS-Cluster.md)，作为 Phase 5+ 规划。

---

## 10. 关键决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 平台架构模式 | 多进程插件隔离（演进自 Odoo 单进程） | 插件崩溃不影响平台；社区先例：Grafana/HashiCorp/VS Code |
| 插件隔离级别 | inline（base）/ process（TS 业务）/ container（Vision/Act） | 按需隔离，平衡开销与稳定性 |
| 插件间 IPC | UDS JSON-RPC（单一 IPC 通吃） | ~20μs 延迟；社区共识：Grafana gRPC/HA UDS/VS Code MessagePort 都是单 IPC |
| 透明 RPC 代理 | container.resolve<T>() 返回 Proxy | 业务代码零修改，和单进程时一模一样 |
| 事件广播 | eventBus.emit/on + RPC Hub 跨进程分发 | 业务代码零修改，底层透明桥接 |
| Podman 模块通信 | HTTP（业务 API）+ Zenoh（数据流） | 低频小 payload 走 HTTP；高频大 payload 走 Zenoh SHM 零拷贝 |
| 数据库 | 共享 PostgreSQL + schema 隔离 | 所有进程连同一个 PG，避免跨服务 JOIN |
| 可观测性 | OpenTelemetry（实时追踪）+ MCAP（录制回放）+ Foxglove Bridge（实时调试）+ 进程健康监控 | 四层可观测；MCAP 旁路录制零侵入；Bridge 按需开启 `MODACS_DEBUG=1` |
| 录制格式 | MCAP（MIT，ROS2 默认格式） | 序列化无关、自包含、Foxglove 原生支持、"record once, read forever" |
| 实时调试 | Foxglove WebSocket Bridge | 与 Recorder 共享 Event Bus；JSON 格式推送（无需解码二进制）；按需开启 |
| JSON-RPC 实现 | 全自建（~50 行协议 + undici UDS Agent） | 协议太简单不值得引入库；借鉴 procwire ProcessManager + node-ipc-jsonrpc auto-reconnect |
| 消息格式 | JSON only（不做 MessagePack/Arrow 切换） | 性能瓶颈在 DB（序列化占 < 0.5%）；JSON 保证 MCAP 可读性 + curl 调试 + JSON-RPC 2.0 标准 |
| 传输方式 | UDS（经社区验证） | HA 2026.02 迁移到 UDS；Grafana/HashiCorp 也用 UDS；TCP 差异可忽略（30μs / 530μs+ 总延迟） |
| 前端 UI | shadcn/ui + TanStack Table + 三层隔离 | 源码在手可定制；模块不直接 import UI 框架；切换成本 ~1 周 |
| 前端 UI | 双模式可切换（桌面 + Admin） | 车间用桌面模式，办公用 Admin 模式（桌面模式 v2） |
| 客户端推送 | SSE（非 WebSocket） | 单向推送场景；Hono 原生支持；浏览器自动重连 |
| 模块包格式 | manifest.yaml（融合 5 家设计） | 取各家之长 |
| 仓库策略 | pnpm workspace monorepo | 共享类型 + 原子提交 |
| 工作流引擎 | 内置 DAG 引擎（借鉴 n8n + Coze + Dify） | OA 审批/MES 流程/ERP 流转共用 |
| 工作流中断恢复 | InterruptError + State 快照持久化（借鉴 Coze） | 审批流程跨天/跨周，必须支持暂停/恢复 |
| 工作流定义格式 | YAML DSL（借鉴 Dify） | 可导出/导入/版本控制 |
| 平台开发节奏 | 先平台后模块 | Carbon 已有业务逻辑可提取，NocoBase 概念已明确 |
| 集群模式 | 节点自包含 + 跨节点 HTTP API | 社区共识：每节点完整自包含，跨节点走 HTTP 不是 RPC |
| 通信模式 | req/rep + pub/sub fan-out + streaming（SSE/Zenoh） | 只需 3 种模式；不引入 ZMQ/NNG（破坏调试+MCAP）；不做 gRPC stream（Zenoh 已覆盖）；不做 push/pull（非消息队列） |
| 可观测性架构 | 四层：OTel 追踪 + MCAP 录制 + Foxglove Bridge 实时调试 + 进程健康 | Recorder = 黑匣子（离线），Bridge = 监控屏（实时），共享 Event Bus |
| Foxglove Bridge | WebSocket（`MODACS_DEBUG=1` 按需开启） | 与 Recorder 并行消费 Event Bus；JSON 格式人眼可读；生产不启动 |
| JSON-RPC 实现 | 全自建（~50 行协议 + undici Agent 传输） | 协议太简单不值得引入库；借鉴 procwire ProcessManager + node-ipc-jsonrpc auto-reconnect |
| 消息格式 | JSON only（不做 MessagePack/Arrow 切换） | 性能瓶颈在 DB 不在序列化（< 0.5%）；二进制破坏 JSON-RPC 2.0 标准 + MCAP 可读性；高通量走 Zenoh |
| UDS 传输 | HTTP over UDS（undici Agent） | 保留 HTTP 路由 + Hono 中间件 + curl 调试；不做裸 JSON-RPC over UDS |
| 开发计划 | 垂直切片 5 Slice / 14 周 | 每 2 周可演示；首次 UI Week 5；架构验证 Week 2 |
| 测试策略 | 选择性 TDD | 纯逻辑 TDD + 基础设施集成测试 + UI Playwright e2e；Slice 1 不写测试 |

---

*本文档与 [MODACS-Overview](./MODACS-Overview.md)、[MODACS-Platform-Dev](./MODACS-Platform-Dev.md) 互补。*
*开发步骤见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md)，集群架构见 [MODACS-Cluster](./MODACS-Cluster.md)。*
*开源项目架构对比见 [MODACS-Platform-Ref](./MODACS-Platform-Ref.md)。*
