# MODACS AI 开发指南

> 本文档是 AI 辅助编码的**规则手册**。所有代码生成必须遵循以下约束。
> 架构设计见 [MODACS-Platform](./MODACS-Platform.md)，开发计划见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md)，集群见 [MODACS-Cluster](./MODACS-Cluster.md)。

---

## 1. 技术栈（不可更改）

| 层面 | 选型 | 版本 | 禁止 |
|------|------|------|------|
| 运行时 | Node.js | 24 LTS | ❌ Bun 专有 API |
| 包管理 | pnpm | workspaces | ❌ npm / yarn / bun install |
| Web 框架 | Hono + @hono/node-server | ^4 | ❌ Express / Fastify / Koa |
| ORM | Drizzle | ^0.36 | ❌ Prisma / Sequelize / TypeORM |
| 数据库 | PostgreSQL | 16+ | ❌ SQLite / MySQL |
| 前端 | React + TypeScript | 19 | ❌ Vue / Svelte |
| UI 组件 | shadcn/ui + Tailwind CSS v4 | — | ❌ Ant Design / MUI |
| 路由 | TanStack Router | ^1 | ❌ React Router |
| 表格 | TanStack Table | ^8 | — |
| 表单 | React Hook Form + Zod | ^7 / ^3 | ❌ Formily |
| 状态 | Zustand | ^5 | ❌ Redux / Jotai |
| 数据请求 | TanStack Query | ^5 | ❌ SWR |
| 开发执行 | tsx | — | ❌ ts-node |
| 构建 | esbuild | — | ❌ webpack / rollup |
| 测试 | vitest + Playwright | — | ❌ Jest |
| UDS 传输 | undici | ^7 | ❌ node-fetch / axios |
| MCAP | @mcap/core | ^1 | — |
| WebSocket | ws | ^8 | ❌ socket.io |

---

## 2. 项目结构

```
modacs/
├── package.json                    # workspace 根
├── pnpm-workspace.yaml
├── docker-compose.yml              # PostgreSQL 开发环境
├── packages/
│   ├── server/                     # 平台核心（base 进程）
│   │   ├── src/
│   │   │   ├── main.ts             # 启动入口
│   │   │   ├── app.ts              # Application 组装
│   │   │   ├── process-manager.ts  # 子进程管理
│   │   │   ├── rpc/
│   │   │   │   ├── protocol.ts     # JSON-RPC 2.0（~50 行，零依赖）
│   │   │   │   ├── transport.ts    # UDS undici Agent
│   │   │   │   └── hub.ts          # RPC Hub（Proxy + 录制 + 事件广播）
│   │   │   ├── recorder.ts         # MCAP 旁路录制
│   │   │   ├── foxglove-bridge.ts  # WebSocket 实时调试
│   │   │   ├── db/
│   │   │   │   ├── index.ts        # Drizzle + PG 初始化
│   │   │   │   └── schema.ts       # 平台表（users, roles, permissions...）
│   │   │   ├── collections/        # Collection 基类
│   │   │   ├── middleware/         # JWT, ACL, 错误处理
│   │   │   ├── workflow/           # DAG 工作流引擎
│   │   │   └── acl/                # RBAC
│   │   └── drizzle.config.ts
│   ├── ui/                         # 前端共享包
│   │   ├── src/
│   │   │   ├── adapter/            # UIAdapter 接口（框架无关）
│   │   │   │   ├── types.ts        # Props 类型定义
│   │   │   │   └── ui-adapter.ts   # 抽象接口
│   │   │   ├── components/
│   │   │   │   ├── ui/             # shadcn/ui 组件（copy-paste）
│   │   │   │   └── composite/      # 平台复合组件
│   │   │   │       ├── data-table.tsx
│   │   │   │       ├── form-builder.tsx
│   │   │   │       └── detail-panel.tsx
│   │   │   ├── pages/
│   │   │   └── router.tsx
│   │   └── vite.config.ts
│   └── shared/                     # 共享类型
│       └── src/types.ts
├── modules/                        # 业务插件（独立进程）
│   ├── mes/
│   │   ├── src/
│   │   │   ├── index.ts            # Plugin 入口
│   │   │   ├── manifest.yaml
│   │   │   ├── schema/             # Drizzle schema
│   │   │   └── collections/
│   │   └── package.json
│   ├── erp/
│   └── oa/
└── tests/
    └── e2e/
```

### 文件命名规范

```
文件名：kebab-case
  ✅ work-order.ts
  ❌ WorkOrder.ts / workOrder.ts / work_order.ts

类名：PascalCase
  ✅ class WorkOrderCollection
  ❌ class workOrderCollection

函数/变量：camelCase
  ✅ function createWorkOrder()
  ❌ function CreateWorkOrder()

常量：UPPER_SNAKE_CASE
  ✅ const MAX_RESTART_COUNT = 5

DB schema：{module}_{table}
  ✅ mes_work_orders
  ✅ mes_inspections
  ❌ workOrders / WorkOrder

API 路径：/api/{collection}:{action}
  ✅ /api/work-orders:list
  ✅ /api/work-orders:create
  ✅ /api/work-orders:get?id=123
  ❌ /api/work-orders (REST 风格不用)
```

---

## 3. 架构约束（硬性规则）

### 3.1 多进程模型

```
平台核心 = base 进程（Node.js）
  ├── Hono HTTP Server（:3000）
  ├── ProcessManager（管理子进程）
  ├── RPC Hub（UDS JSON-RPC 路由 + 旁路录制 + 事件广播）
  ├── Recorder（MCAP）
  ├── Foxglove Bridge（WebSocket 实时调试，MODACS_DEBUG=1 时启用）
  ├── Drizzle ORM → PostgreSQL
  ├── Workflow Engine
  └── ACL / JWT

每个业务插件 = 独立子进程（Node.js fork）
  ├── Hono HTTP Server（listen on UDS socket）
  ├── 通过 UDS RPC 访问 base 进程的 DB
  ├── 不直连 PostgreSQL
  └── 崩溃后 ProcessManager 自动重启（指数退避 1s→2s→4s→...30s max）
```

### 3.2 通信规则

```
✅ 允许的通信模式：
  req/rep     HTTP POST over UDS（插件 → 插件 / 插件 → base）
  pub/sub     HTTP POST /event fan-out（事件广播）
  streaming   SSE（浏览器推送）+ Zenoh（高通量数据流，v2）

❌ 禁止的通信模式：
  push/pull   不是消息队列
  ZMQ/NNG     破坏调试 + MCAP 可读性
  gRPC stream Zenoh 已覆盖
  Redis       不引入额外依赖，fan-out 够用
  跨节点 RPC  集群走 HTTP API，不做透明跨节点 RPC
```

### 3.3 消息格式

```
✅ 只用 JSON
  → MCAP 录制存 JSON payload，Foxglove 直接可读
  → curl 可调试
  → JSON-RPC 2.0 标准兼容

❌ 不做格式切换层
  → 不引入 MessagePack / Arrow / Protobuf
  → 性能瓶颈在 DB（~500μs），不在序列化（~5μs）
  → 高通量场景走 Zenoh 独立通道（v2）
```

### 3.4 UI 三层隔离

```
第 1 层：UIAdapter 接口（~100 行类型定义）
  → 框架无关的 Props 类型（Button, Input, Select, Modal...）
  → 模块代码只能 import from "@modacs/ui"

第 2 层：平台复合组件（~10 个稳定 API）
  → DataTable, FormBuilder, DetailPanel, StatusBadge, FilterBar, ActionBar
  → 模块代码用这些组件组装页面

第 3 层：Field Interface 注册表（~40 个语义组件）
  → text, number, select, date, boolean, foreign-key, richtext...
  → 模块代码通过 FieldInterfaceRegistry 获取，不直接 import

❌ 模块代码禁止直接 import：
  → "shadcn/ui" / "@radix-ui/*" / "lucide-react"
  → 只能 import from "@modacs/ui"
```

---

## 4. 代码模板

### 4.1 JSON-RPC 2.0 协议（protocol.ts）

```typescript
// 零依赖，~50 行

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

export class RpcError extends Error {
    constructor(public code: number, message: string, public data?: unknown) {
        super(message);
    }
}
```

### 4.2 UDS 传输层（transport.ts）

```typescript
import { Client } from 'undici';
import { createRequest, type RpcResponse, RpcError } from './protocol';

export class UdsClient {
    private client: Client;
    private connected = false;

    constructor(
        private socketPath: string,
        private timeout = 30_000,
    ) {
        this.client = new Client('http://localhost', {
            connect: { socketPath },          // undici UDS Agent
            bodyTimeout: timeout,
        });
    }

    async connect(retries = 3): Promise<void> {
        let delay = 100;
        for (let i = 0; i <= retries; i++) {
            try {
                await this.client.request({ method: 'GET', path: '/health' });
                this.connected = true;
                return;
            } catch {
                if (i === retries) throw new Error(`UDS connect failed: ${this.socketPath}`);
                await sleep(delay);
                delay = Math.min(delay * 2, 5000);
            }
        }
    }

    async call<T = unknown>(method: string, params?: unknown): Promise<T> {
        const req = createRequest(method, params);
        const res = await this.client.request({
            method: 'POST',
            path: '/',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(req),
        });
        const body = await res.body.json() as RpcResponse;
        if (body.error) throw new RpcError(body.error.code, body.error.message, body.error.data);
        return body.result as T;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        await this.client.close();
    }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
```

### 4.3 RPC Hub（hub.ts）

```typescript
import { UdsClient } from './transport';
import type { Recorder } from '../recorder';

export class RpcHub {
    private clients = new Map<string, UdsClient>();
    recorder: Recorder | null = null;

    // 透明 RPC 代理 — 业务代码零修改
    resolve<T>(pluginName: string): T {
        const client = this.clients.get(pluginName);
        if (!client) throw new Error(`Plugin "${pluginName}" not connected`);
        return new Proxy({} as T, {
            get: (_, method: string) => async (...args: unknown[]) => {
                const topic = `${pluginName}.${method}`;
                const start = performance.now();

                this.recorder?.record(topic, { plugin: pluginName, args, direction: 'out' });
                const result = await client.call(method, args[0]);
                const elapsed = performance.now() - start;
                this.recorder?.record(topic, { plugin: pluginName, result, elapsedMs: elapsed, direction: 'in' });

                return result;
            },
        });
    }

    // 事件广播 — fan-out 到所有插件
    async emit(event: string, data: unknown, source?: string): Promise<void> {
        this.recorder?.record(event, { source, data, direction: 'event' });
        for (const [name, client] of this.clients) {
            if (name !== source) {
                try {
                    await client.call('__event__', { event, data, source });
                } catch {
                    // 插件可能暂时不可用，不阻塞广播
                }
            }
        }
    }

    registerClient(name: string, client: UdsClient) { this.clients.set(name, client); }
    getClient(name: string) { return this.clients.get(name); }
}
```

### 4.4 ProcessManager（process-manager.ts）

```typescript
import { fork, type ChildProcess } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { UdsClient } from './rpc/transport';

interface ManagedProcess {
    name: string;
    proc: ChildProcess;
    socketPath: string;
    status: 'starting' | 'running' | 'crashed' | 'stopped';
    restartCount: number;
}

export class ProcessManager {
    private processes = new Map<string, ManagedProcess>();
    private readonly MAX_RESTART = 5;

    async startPlugin(name: string, entryFile: string): Promise<void> {
        const socketPath = `/tmp/modacs-${name}.sock`;
        try { await unlink(socketPath); } catch {}

        const proc = fork(entryFile, [], {
            env: {
                ...process.env,
                MODACS_PLUGIN_NAME: name,
                MODACS_SOCKET_PATH: socketPath,
            },
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        });

        const managed: ManagedProcess = { name, proc, socketPath, status: 'starting', restartCount: 0 };
        this.processes.set(name, managed);

        proc.on('exit', (code) => {
            if (managed.status === 'stopped') return;
            managed.status = 'crashed';
            console.log(`[ProcessManager] ${name} exited (code=${code}), restarting...`);

            if (managed.restartCount < this.MAX_RESTART) {
                const delay = Math.min(1000 * Math.pow(2, managed.restartCount), 30_000);
                managed.restartCount++;
                setTimeout(() => this.startPlugin(name, entryFile), delay);
            }
        });

        // 等待 UDS socket 就绪
        await this.waitForSocket(socketPath, 5000);
        managed.status = 'running';
        console.log(`[ProcessManager] ${name} running on ${socketPath}`);
    }

    private async waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
        const client = new UdsClient(socketPath);
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                await client.connect(0);
                await client.disconnect();
                return;
            } catch {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        throw new Error(`Socket not ready: ${socketPath}`);
    }

    getSocketPath(name: string): string | undefined {
        return this.processes.get(name)?.socketPath;
    }

    async stop(name: string): Promise<void> {
        const managed = this.processes.get(name);
        if (!managed) return;
        managed.status = 'stopped';
        managed.proc.kill('SIGTERM');
    }
}
```

### 4.5 插件入口（子进程端）

```typescript
// modules/mes/src/index.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

// RPC 端点
app.post('/', async (c) => {
    const { method, params, id } = await c.req.json();

    // 路由到对应 handler
    const handler = handlers[method];
    if (!handler) {
        return c.json({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id });
    }

    try {
        const result = await handler(params);
        return c.json({ jsonrpc: '2.0', result, id });
    } catch (err) {
        return c.json({
            jsonrpc: '2.0',
            error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
            id,
        });
    }
});

// 事件接收
app.post('/event', async (c) => {
    const { event, data, source } = await c.req.json();
    eventBus.emit(event, data, source);
    return c.json({ ok: true });
});

// 监听 UDS
const socketPath = process.env.MODACS_SOCKET_PATH!;
serve({ fetch: app.fetch }, { path: socketPath }, () => {
    console.log(`[MES] Running on ${socketPath}`);
});
```

### 4.6 Collection 基类

```typescript
import { pgTable, serial, varchar, timestamp, integer } from 'drizzle-orm/pg-core';
import { z } from 'zod';

// 1. 定义 Drizzle schema
export const workOrders = pgTable('mes_work_orders', {
    id: serial('id').primaryKey(),
    orderNumber: varchar('order_number', { length: 50 }).notNull(),
    productId: integer('product_id').notNull(),
    quantity: integer('quantity').notNull(),
    status: varchar('status', { length: 20 }).default('draft'),
    createdAt: timestamp('created_at').defaultNow(),
});

// 2. 定义 Zod 校验
export const workOrderSchema = z.object({
    orderNumber: z.string().min(1),
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    status: z.enum(['draft', 'pending', 'approved', 'in_progress', 'completed', 'rejected']),
});

// 3. 定义 Collection
export const workOrderCollection = defineCollection({
    name: 'work-orders',
    schema: workOrders,
    validate: workOrderSchema,
    actions: ['list', 'get', 'create', 'update', 'delete'],
    // 可选：ACL 规则
    acl: {
        list: ['admin', 'supervisor', 'operator'],
        create: ['admin', 'supervisor'],
        delete: ['admin'],
    },
});
```

### 4.7 UI Adapter 接口

```typescript
// packages/ui/src/adapter/types.ts

import type { ComponentProps, ReactNode } from 'react';

export interface ButtonProps {
    variant?: 'default' | 'outline' | 'ghost' | 'destructive';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onClick?: () => void;
    children: ReactNode;
}

export interface InputProps {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    error?: string;
}

export interface SelectProps {
    value?: string;
    onChange?: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    disabled?: boolean;
}

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
}

export interface DataTableProps<T> {
    data: T[];
    columns: ColumnDef<T>[];
    pagination?: { page: number; pageSize: number; total: number };
    onPageChange?: (page: number) => void;
    onRowClick?: (row: T) => void;
}

export interface FormBuilderProps {
    schema: z.ZodType;
    defaultValues?: Record<string, unknown>;
    onSubmit: (values: Record<string, unknown>) => void;
    fields: FieldConfig[];
}

export interface FieldConfig {
    name: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'date' | 'boolean' | 'foreign-key';
    options?: { label: string; value: string }[];
    required?: boolean;
}

// ... Toast, Tabs, Tooltip, Drawer, Dropdown, Popover, Checkbox, DatePicker
```

### 4.8 前端页面模板

```tsx
// 标准列表页模板
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '@modacs/ui';
import type { ButtonProps } from '@modacs/ui';

export function WorkOrderListPage() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['work-orders'],
        queryFn: () => api.get('/api/work-orders:list'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => api.post(`/api/work-orders:delete`, { id }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['work-orders'] }),
    });

    const columns = [
        { key: 'orderNumber', header: '工单号' },
        { key: 'productName', header: '产品' },
        { key: 'quantity', header: '数量' },
        { key: 'status', header: '状态' },
    ];

    return (
        <div className="p-6">
            <DataTable
                data={data?.items ?? []}
                columns={columns}
                pagination={data?.pagination}
                onPageChange={(p) => {/* */}}
                onRowClick={(row) => {/* navigate to detail */}}
            />
        </div>
    );
}
```

### 4.9 Foxglove Bridge

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { EventEmitter } from 'eventemitter3';

export class FoxgloveBridge {
    private wss: WebSocketServer;
    private channels = new Map<string, { id: number; topic: string }>();
    private clients = new Set<WebSocket & { subs: Set<number> }>();
    private channelId = 0;

    constructor(private eventBus: EventEmitter) {
        this.register('rpc.request');
        this.register('rpc.response');
        this.register('lifecycle');
        eventBus.on('rpc', (e) => this.publish(`rpc.${e.direction}`, e));
        eventBus.on('lifecycle', (e) => this.publish('lifecycle', e));
    }

    start(port = 8765) {
        this.wss = new WebSocketServer({ port, host: '127.0.0.1' });
        console.log(`[foxglove-bridge] ws://127.0.0.1:${port}`);
        this.wss.on('connection', (ws) => this.onConnection(ws));
    }

    private onConnection(ws: WebSocket) {
        const client = ws as WebSocket & { subs: Set<number> };
        client.subs = new Set();
        this.clients.add(client);

        ws.send(JSON.stringify({ op: 'serverInfo', name: 'MODACS' }));
        for (const ch of this.channels.values()) {
            ws.send(JSON.stringify({ op: 'advertise', channels: [ch] }));
        }

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw.toString());
            if (msg.op === 'subscribe')
                msg.subscriptions.forEach((s: any) => client.subs.add(s.channelId));
            else if (msg.op === 'unsubscribe')
                msg.subscriptions.forEach((s: any) => client.subs.delete(s.channelId));
        });
        ws.on('close', () => this.clients.delete(client));
    }

    private publish(topic: string, data: unknown) {
        const ch = this.channels.get(topic);
        if (!ch || this.clients.size === 0) return;
        const msg = JSON.stringify({ op: 'message', channel: ch.id, data: JSON.stringify(data) });
        for (const c of this.clients) if (c.subs.has(ch.id)) c.send(msg);
    }

    private register(topic: string) {
        this.channels.set(topic, { id: ++this.channelId, topic });
    }
}
```

---

## 5. 开发命令

```bash
# 环境
docker compose up -d db          # 启动 PostgreSQL
corepack enable && pnpm install

# 开发
pnpm dev                          # 后端 tsx watch
pnpm --filter @modacs/ui dev      # 前端 Vite
MODACS_DEBUG=1 pnpm dev           # 后端 + Foxglove Bridge

# 数据库
pnpm db:migrate                   # Drizzle Kit 迁移
pnpm db:studio                    # Drizzle Studio

# 测试
pnpm test:unit                    # 纯逻辑（vitest）
pnpm test:integration             # API + RPC + DB（vitest）
pnpm test:e2e                     # Playwright 端到端

# 构建
pnpm build                        # esbuild → dist/
```

---

## 6. 测试策略

| 组件 | 策略 | 工具 |
|------|------|------|
| protocol.ts, JWT, RBAC, DSL 解析 | **TDD**（先写测试） | vitest |
| ProcessManager, RPC Hub, Bridge | 先实现 → 后集成测试 | vitest（真实进程） |
| API CRUD | 集成测试 | vitest + undici |
| UI 页面 | e2e 关键路径 | Playwright |
| Slice 1（Spike） | **不写测试** | 手动 Demo Checklist |

```
规则：
  1. 纯逻辑组件必须 TDD（20 分钟，回报无限）
  2. 基础设施不 mock（mock 比代码长）— 用真实子进程
  3. UI 不测 CSS class — 测用户操作路径
  4. Slice 1 是 Spike — 接口还在变，测试是负担
  5. 每个 Slice 结尾 Demo Checklist 必须自动化
```

---

## 7. 开发路线（当前进度）

```
Slice 1  架构探针            Week 1-2     [ ] 未开始
Slice 2  数据层 + 认证       Week 3-4     [ ] 未开始
Slice 3  第一个 UI           Week 5-7     [ ] 未开始
Slice 4  MES 业务模块        Week 8-12    [ ] 未开始
Slice 5  工作流 + ACL        Week 13-14   [ ] 未开始
```

每个 Slice 的详细 Demo Checklist 见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md) §1.6-1.10。

---

## 8. 禁止清单（AI 生成代码时常见错误）

```
❌ 不要用 Bun 专有 API（Bun.serve, Bun.spawn, http://unix: 模式）
❌ 不要用 SQLite（用 PostgreSQL）
❌ 不要让子进程直连数据库（通过 UDS RPC 转发到 base 进程）
❌ 不要在模块代码中 import shadcn/ui 或 @radix-ui/*
❌ 不要引入 Redis（fan-out 够用）
❌ 不要引入 ZMQ / NNG / gRPC
❌ 不要做消息格式切换（JSON only）
❌ 不要做跨节点透明 RPC（集群走 HTTP API）
❌ 不要用 REST 风格 API 路径（用 /api/{collection}:{action}）
❌ 不要用 console.log 做日志输出（用统一 logger，stdout 会冲突）
   → 子进程中 console.log 会被 ProcessManager 捕获，但应用日志应用统一 logger
❌ 不要忘记 socket 文件清理（启动时 unlink 旧 socket）
❌ 不要在 Slice 1 阶段写测试（Spike 阶段接口不稳定）
❌ 不要用 import { fetch } from 'undici'（Node.js 内置 fetch 用不了 UDS，需 new Client）
❌ 不要在插件代码中直连 PostgreSQL（必须通过 RPC Hub → base 进程）
```

---

## 9. 关键设计决策索引

| 决策 | 文档位置 |
|------|----------|
| 多进程插件隔离 | [MODACS-Platform](./MODACS-Platform.md) §1 |
| UDS JSON-RPC over HTTP | [MODACS-Platform](./MODACS-Platform.md) §3.8 |
| 通信模式只做三种 | [MODACS-Platform](./MODACS-Platform.md) §3.8.1 |
| MCAP + Foxglove Bridge | [MODACS-Platform](./MODACS-Platform.md) §3.9 |
| UI 三层隔离 | [MODACS-Platform](./MODACS-Platform.md) §6 |
| 垂直切片 5 Slice / 14 周 | [MODACS-Platform-Dev](./MODACS-Platform-Dev.md) §1 |
| 选择性 TDD | [MODACS-Platform-Dev](./MODACS-Platform-Dev.md) §4.4 |
| 节点自包含集群 | [MODACS-Cluster](./MODACS-Cluster.md) §2 |
| 全部决策记录 | [MODACS-Overview](./MODACS-Overview.md) §8 |

---


## 10. 中文交互约束

### 10.1 交互语言
- AI 与用户的交互（问答、解释、方案说明、进度汇报）使用**中文**
- 代码审查反馈、PR 评论、技术讨论使用**中文**
- 专有名词和技术术语保持英文原样（如 WebSocket、JSON-RPC、TopicBus、MCAP）

### 10.2 代码内文本

| 场景 | 语言 | 说明 |
|------|------|------|
| 变量/函数/类型命名 | 英文 | 遵循命名规范（camelCase/PascalCase/UPPER_SNAKE） |
| 代码注释 | 英文 | 保持代码国际化，方便跨团队协作 |
| TODO/FIXME 注释 | 英文 | 便于工具检索 |
| 日志消息 | 英文 | 便于日志检索和国际化 |
| 用户面向 UI 文案 | 中文 | 根据产品需求，使用 i18n 资源文件管理 |
| 错误提示（用户可见） | 中文 | 面向操作人员的友好提示 |

### 10.3 文档与提交

| 场景 | 语言 | 说明 |
|------|------|------|
| 架构/设计文档（docs/） | 中文 | 项目文档面向中文团队 |
| 变更日志（changes/） | 中文 | 面向中文团队 |
| API 文档 | 中文 | 面向中文开发者 |
| Git commit message | 英文 | Conventional Commits 格式（`feat:` `fix:` `chore:` 等） |
| 分支命名 | 英文 | `feat/` `fix/` `chore/` 前缀 |
| PR 标题 | 英文 | 简洁描述变更内容 |

### 10.4 例外
- 引用外部文档或 issue 时保持原文语言
- 第三方库的 API 名称、配置项保持英文原样，不翻译
- Shell 命令、文件路径、代码片段保持英文

---


*本文档是 AI 辅助编码的规则手册，所有代码生成必须遵循。*
*架构设计见 [MODACS-Platform](./MODACS-Platform.md)，开发计划见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md)，项目总览见 [MODACS-Overview](./MODACS-Overview.md)。*
