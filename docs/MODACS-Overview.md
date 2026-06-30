---
title: "MODACS 项目总览"
tags:
  - "项目开发"
  - "个人项目"
  - "InfoSYS"
  - "MODACS"
date: 2026-06-29
version: v4.1
---

# MODACS：模块化企业应用与工业控制底座

**版本**：4.0  
**日期**：2026-06-29  

> 本文是 MODACS 项目的顶层总览文档，整合项目愿景、技术架构、工程组织与路线图。
> 命名详情见 [MODACS-Naming](./MODACS-Naming.md)，平台架构见 [MODACS-Platform](./MODACS-Platform.md)，开发步骤见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md)，各子产品见文末链接。

---

## 1. 执行摘要

**MODACS**（**Mo**dular **O**n-**D**emand **A**pplication **C**omposition **S**ystem）是一个开源、模块化、可组合的企业应用与工业控制开发底座。

本项目旨在解决企业数字化建设中长期存在的**系统割裂**、**重复开发**和**扩展困难**等核心问题。通过构建一个基于动态模块加载的统一平台，MODACS 让开发者能够像搭积木一样，按需组合出 MES、ERP、OA、排班等企业应用，并逐步向 PLC、CNC、DCS 等工业控制领域延伸。

---

## 2. 项目背景与愿景

### 2.1 行业痛点

| 痛点 | 描述 |
| :--- | :--- |
| **系统孤岛** | MES、ERP、OA 等系统独立建设，数据不通，流程割裂 |
| **重复造轮** | 每个系统都需重新实现用户管理、权限、工作流等通用能力 |
| **扩展困难** | 单体架构难以扩展，定制化成本高 |
| **技术债务** | 多数企业软件基于陈旧技术栈，维护成本高昂 |
| **开源断层** | Odoo 等现有方案技术栈老旧（Python 单体），难以满足现代化需求 |

### 2.2 项目愿景

构建一个**统一的、开放的、现代化的企业应用与工业控制开发底座**，让任何开发者都能：
- 快速搭建企业级应用
- 自由组合功能模块
- 无缝集成工业控制系统
- 享受 TypeScript 全栈类型安全与 Node.js 生态的现代化开发体验

### 2.3 核心定位

MODACS 是统一的工业软件平台品牌，旗下产品按"创建—运行—业务"三层组织：

| 产品 | 定位 | 对标 | ISA-95 |
| :--- | :--- | :--- | :--- |
| **MODACS Studio** | 统一编辑器/IDE（组态/工作流/数据模型/调试），插件扩展 | UE Editor / TIA Portal / Ignition Designer | — |
| **MODACS HMI** | 触摸屏/工控机运行时（组态画面渲染） | WinCC / Ignition Vision | Level 2 |
| **MODACS Edge** | 边缘采集运行时（串口/Modbus/OPC UA） | Ignition Edge | Level 1-2 |
| **MODACS Remote** | 远程监控运行时（浏览器） | Ignition Perspective | Level 2 |
| **MODACS Core** | 决策/规划/管理（MES/ERP/OA） | Odoo、ERPNext | Level 3-4 |
| **MODACS Act** | 执行/控制/驱动（PLC/CNC/DCS） | OpenPLC、Klipper | Level 0-1 |
| **MODACS Vision** | 视频监控与 AI 分析 | 群晖 Surveillance Station | 扩展 |
| **MODACS Link** | 通信中间件 | ROS2 RMW | 基础设施 |

**协同价值**：IT（企业应用）与 OT（工业控制）的融合，对标 Industry 4.0、智能制造。

> 命名决策详情与查重结论见 [MODACS-Naming](MODACS-Naming.md)。

---

## 3. 核心理念与设计哲学

### 3.1 Odoo 式模块化

MODACS 的核心设计哲学是**进程内动态模块加载**：

- 每个业务功能（用户管理、工单管理、库存管理）都是一个独立的模块（Plugin）
- 模块在运行时动态加载到平台进程中，共享同一个 PostgreSQL 数据库
- 模块之间通过类型安全的服务定位器（`container.resolve<T>()`）直接调用
- 异步通信用 Node.js EventEmitter，不需要外部消息队列

**为什么不用群晖 DSM 模式（Docker 套件）？**

MES、ERP、OA 是紧耦合的业务系统，频繁共享数据模型和业务逻辑。Docker 容器隔离会带来：
- 跨容器通信延迟和复杂度
- 数据库 schema 分裂，JOIN 变成跨服务调用
- 重复部署多个 Web 服务器、ORM、认证模块
- 一致的 UX 难以保证（每个套件独立前端）

只有 Vision（GPU 视频分析）和 Act（实时控制）这类技术栈完全不同、资源隔离需求强的模块，才使用 Podman 容器隔离。

### 3.2 借鉴 NocoBase 六大核心概念

不 fork NocoBase（其 70% 代码不需要，Sequelize/Formily/Koa 三个核心绑定不可接受），但借鉴其 6 个核心设计模式，用 Hono + Drizzle + React 重新实现：

| 概念 | 作用 |
| :--- | :--- |
| **插件生命周期** | `afterAdd → beforeLoad → load → install → upgrade → beforeUninstall` |
| **两阶段加载** | Phase 1 全部 `beforeLoad`；Phase 2 `@hapi/topo` 拓扑排序后 `load` |
| **Resource Manager** | 定义 Collection 即自动生成 CRUD API，不需手写路由 |
| **Field Interface** | 语义类型 → DB 列 + Zod 校验 + React 组件，一处定义三层打通 |
| **ACL** | 策略模板（readonly/own/all）+ 运行时过滤注入 + 字段级权限 |
| **Event Bus** | EventEmitter 实现，进程内异步通信 |

### 3.3 前端双 UI 模式

平台提供两种可切换的 UI 风格，用户一键切换，偏好持久化：

| 模式 | 适用场景 | 特点 |
| :--- | :--- | :--- |
| **桌面窗口式** | 车间一体机、产线看板、触屏 | 多窗口并存、拖拽缩放、桌面图标 + 任务栏 |
| **Admin 面板式** | 办公室 PC、管理终端、鼠标键盘 | 侧边栏导航、全屏内容区、一次看一页 |

两种模式共享 ~90% 代码（所有模块页面组件、UI 组件、API 调用逻辑完全相同），只有布局壳不同。

### 3.4 TypeScript 全栈

- **前后端类型共享**：Drizzle schema 同时生成数据库迁移和前端 TypeScript 类型
- **Carbon 业务代码移植**：MES 首个模块从 Carbon（TS + React + Supabase）提取业务逻辑
- **esbuild 单文件部署**：`esbuild --bundle --platform=node` 打包为单文件 JS + node 二进制，部署零依赖

### 3.5 可选容器隔离

- 默认所有模块以进程方式运行，零容器开销
- 仅 Vision/Act 等需要 GPU、特殊依赖、资源隔离的模块使用 Podman
- Podman 是 daemonless 的，按需启动，不是平台必备依赖
- 平台内置 Hono proxy 处理 Podman 模块的路由

---

## 4. 技术架构

### 4.1 总体架构

```
┌──────────────────────────────────────────────────────────────┐
│                        前端应用层                             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            Layout Provider（布局提供者）                 │  │
│  │     桌面窗口模式 ←→ Admin 面板模式（一键切换）            │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────┴───────────────────────────────┐  │
│  │            Module Renderer（模块渲染器）                 │  │
│  │     模块页面组件（WorkOrderList, BomEditor...）          │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  React 19 + TanStack Router + Tailwind                      │
├──────────────────────────────────────────────────────────────┤
│                     MODACS 平台核心                           │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Plugin   │ │ Resource │ │  ACL     │ │  Event   │       │
│  │ Manager  │ │ Manager  │ │ (权限)   │ │  Bus     │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Auth     │ │ Workflow │ │ Field    │ │ Podman   │       │
│  │ (JWT)    │ │ Engine   │ │ Interface│ │ Proxy    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐                                              │
│  │ Hono     │                                              │
│  │ Server   │                                              │
│  └──────────┘                                              │
│                                                              │
│  TypeScript + Node.js + Hono + Drizzle                          │
├──────────────────────────────────────────────────────────────┤
│                        模块层                                 │
│                                                              │
│  进程内模块（共享 PG）：                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  MES    │ │  ERP    │ │  OA     │ │ 排班    │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                              │
│  Podman 隔离模块（独立容器）：                                 │
│  ┌─────────────────┐ ┌─────────────────┐                   │
│  │ MODACS Vision   │ │ MODACS Act      │                   │
│  │ (GPU 视频分析)  │ │ (实时控制)       │                   │
│  └─────────────────┘ └─────────────────┘                   │
├──────────────────────────────────────────────────────────────┤
│                 PostgreSQL（共享数据库）                      │
├──────────────────────────────────────────────────────────────┤
│                   Linux / Podman（可选）                     │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 关键技术选型

| 层面          | 选型                                      | 理由                                                                              |
| :---------- | :-------------------------------------- | :------------------------------------------------------------------------------ |
| **核心语言**    | TypeScript                              | 前后端类型共享；Carbon 业务代码可直接移植；Go 缺运行时动态模块加载；Python 无法复用 Carbon TS 代码                 |
| **运行时**     | Node.js 24 LTS                          | 15 年生产验证，长运行稳定，HTTPS 无 bug；不用 Bun（1.3.x 有 HTTPS 挂起 bug + 内存泄漏 + 4.8k 未解决 issue） |
| **包管理**     | pnpm                                    | Monorepo 最佳实践；硬链接省磁盘 60%+；严格依赖隔离杜绝幽灵依赖；比 npm 快 3-4 倍                            |
| **TS 执行**   | tsx（开发）/ esbuild（构建）                    | tsx 比 ts-node 快 10 倍；esbuild 打包为单文件 JS + node 二进制部署                             |
| **测试**      | Vitest                                  | 原生 TypeScript；比 Jest 快 3-4 倍；Monorepo 友好                                        |
| **Web 框架**  | Hono + @hono/node-server                | 轻量，运行时无关（未来可切 Bun）；不绑 ORM；不用 NestJS/Koa（过重或过旧）                                  |
| **ORM**     | Drizzle                                 | TS 原生、类型安全、零运行时开销；替代 Carbon 的 Supabase 依赖                                       |
| **数据库**     | PostgreSQL                              | 所有子进程共享一个实例，通过 schema 隔离                                                        |
| **容器隔离**    | Podman（可选）                              | daemonless、按需启动；仅 Vision/Act 使用                                                 |
| **插件间 IPC** | UDS JSON-RPC                            | ~20μs 延迟；社区共识：Grafana/HashiCorp/VS Code 都用单 IPC                                 |
| **进程管理**    | ProcessManager（node:child_process fork） | 子进程启动/监控/崩溃重启；借鉴 VS Code Extension Host                                         |
| **数据流通信**   | Zenoh（TS+Python 官方 SDK）                 | 大 payload SHM 零拷贝；用于 Vision/Act 数据流                                             |
| **实时可观测**   | OpenTelemetry                           | RPC 调用链追踪；后端 Jaeger/Grafana Tempo                                               |
| **录制回放**    | MCAP + Foxglove                         | 旁路录制所有 RPC+事件；ROS2 默认格式；"record once, read forever"                             |
| **前端框架**    | React 19                                | 与 Carbon 一致，组件可移植                                                               |
| **UI 组件库**  | shadcn/ui + TanStack Table              | Tailwind 原生 + Carbon 兼容；源码在手可自由定制；通过三层 UI 隔离（Adapter 接口）未来可切换框架                 |
| **前端路由**    | TanStack Router                         | 支持运行时动态路由注册（模块加载后注册路由）                                                          |
| **前端样式**    | Tailwind CSS v4                         | 与 Carbon + shadcn/ui 一致；CSS 变量主题支持暗色模式                                          |
| **客户端推送**   | SSE（Server-Sent Events）                 | 单向推送；Hono 原生支持；浏览器自动重连                                                          |
| **拓扑排序**    | @hapi/topo                              | 模块两阶段加载的依赖排序                                                                    |
| **表单校验**    | Zod                                     | 与 Drizzle + Field Interface 配合                                                  |
| **工作流引擎**   | 内置 DAG 引擎（借鉴 n8n + Coze + Dify）         | OA 审批/MES 流程/ERP 流转都需要，统一引擎避免重复实现                                               |
| **许可证**     | Apache 2.0                              | 商业友好，无 GPL 依赖                                                                   |

### 4.3 NocoBase 概念集成策略

- **不 fork**：NocoBase 70% 代码不需要，3 个核心绑定（Sequelize/Formily/Koa）不可接受
- **重新实现 6 大概念**：插件生命周期、两阶段加载、Resource Manager、Field Interface、ACL、Event Bus
- **技术映射**：Sequelize → Drizzle，Formily → React + Zod，Koa → Hono

### 4.4 工程目录结构

采用 **pnpm workspace monorepo**：

```
modacs/                           # Git 根仓库（monorepo）
├── package.json                  # pnpm workspace 配置
├── packages/
│   ├── core/                     # 平台核心
│   │   └── src/
│   │       ├── application.ts    # Application 入口（Hono server + 生命周期）
│   │       ├── plugin-manager.ts # PluginManager（加载/卸载/依赖排序）
│   │       ├── plugin.ts         # Plugin 基类（生命周期钩子）
│   │       ├── resourcer/        # Resource Manager（Collection → CRUD API）
│   │       ├── field-interface/  # Field Interface（语义类型 → DB + Zod + React）
│   │       ├── acl/              # ACL（策略模板 + 运行时过滤）
│   │       ├── event-bus/        # EventEmitter 封装
│   │       ├── workflow/         # 工作流引擎（DAG + 中断恢复，借鉴 n8n/Coze/Dify）
│   │       ├── auth/             # JWT 认证
│   │       └── podman-proxy/     # Podman 模块 HTTP 代理
│   ├── ui/                       # 共享前端
│   │   └── src/
│   │       ├── layout/           # 布局壳（DesktopLayout + AdminLayout）
│   │       ├── components/       # 共享 UI 组件（Table, Form, Modal...）
│   │       ├── module-renderer/  # 模块渲染器（模式无关）
│   │       └── stores/           # Zustand 状态（偏好、用户、模块列表）
│   └── shared/                   # 共享类型 + 工具
├── modules/                      # 进程内业务模块
│   ├── mes/                      # MES 模块（从 Carbon 提取）
│   ├── erp/                      # ERP 模块（未来）
│   └── oa/                       # OA 模块（未来）
├── modules-isolated/             # Podman 隔离模块
│   ├── vision/                   # MODACS Vision（GPU 视频分析）
│   └── act/                      # MODACS Act（实时控制）
└── docs/                         # 平台文档 + 模块开发规范
```

---

## 5. 与主流开源项目的对比

| 特性 | MODACS | Odoo | NocoBase | n8n | CasaOS | Runtipi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **核心语言** | TypeScript | Python | TypeScript | TypeScript | Go | TypeScript |
| **架构** | 进程内模块 + 可选 Podman | 单体 + Python addon | 单体 + Koa 插件 | 单体 + DAG 引擎 | Docker 套件 | Docker 套件 |
| **模块加载** | 运行时动态加载 | 启动时加载 | 运行时加载 | 节点注册 | 独立容器 | 独立容器 |
| **数据库共享** | ✅ 共享 PG | ✅ 共享 PG | ✅ 共享 PG | ✅ 共享 | ❌ 独立 | ❌ 独立 |
| **工作流引擎** | ✅ 内置 DAG + 中断恢复 | ❌ | ❌ | ✅ 核心 | ❌ | ❌ |
| **技术栈自由** | ⚠️ TS 优先（Podman 可异构） | ❌ 仅 Python | ❌ 仅 TS | ❌ 仅 TS | ✅ 任意 | ✅ 任意 |
| **前端模式** | 桌面 + Admin 双模式 | Admin 面板 | Admin 面板 | 可视化画布 | 桌面 | Dashboard |
| **类型安全** | ✅ 全栈 TS | ❌ | ✅ | ✅ | ❌ | ✅ |
| **单二进制部署** | ⚠️ esbuild bundle | ❌ | ❌ | ❌ | ✅ | ❌ |
| **实时控制** | ✅ Act 模块 | ❌ | ❌ | ❌ | ❌ | ❌ |

**借鉴要点**：

| 项目 | 借鉴点 | 本项目差异 |
| ---- | ------ | ---------- |
| **Odoo** | 进程内模块、模块依赖、auto_install | TypeScript + Node.js，不绑 OWL，支持 Podman 隔离 |
| **NocoBase** | 插件生命周期、两阶段加载、Resource Manager、Field Interface、ACL | 不 fork，用 Drizzle 替代 Sequelize，React 替代 Formily，Hono 替代 Koa |
| **n8n** | DAG 工作流引擎（栈 + 等待队列）、部分执行、执行恢复 | 仅借鉴设计模式（n8n 是 Fair-code 非开源）；节点是模块服务而非集成连接器 |
| **Coze（扣子）** | 工作流中断恢复（Interrupt & Resume）、State 状态管理、复合节点/子图 | 仅借鉴公开文档描述的设计模式（闭源）；不需要 ReAct Agent |
| **Dify** | 工作流 YAML DSL、变量作用域、插件六分类法 | 不需要 RAG/LLM 能力；用 TS 替代 Python |
| **CasaOS** | 桌面式 UI 交互 | 桌面模式作为可选 UI，不是唯一模式 |
| **群晖 DSM** | 桌面窗口体验、App Center 概念 | 模块不是 Docker 容器，而是进程内插件 |
| **飞牛 fnOS** | .fpk 包格式、桌面入口 | manifest.yaml 融合 Odoo/NocoBase/Grafana/Strapi |

---

## 6. 开发路线图

### 阶段一：平台骨架（第 1-3 周）

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M1 | pnpm workspace 骨架 + Hono server 启动 | 🔲 待完成 |
| M2 | Plugin 基类 + PluginManager + 两阶段加载 | 🔲 待完成 |
| M3 | Drizzle 集成 + PostgreSQL 连接 + 迁移机制 | 🔲 待完成 |
| M4 | Admin Layout 前端骨架 + 模块动态渲染 | 🔲 待完成 |

### 阶段二：核心能力（第 4-9 周）

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M5 | Resource Manager（Collection → CRUD API 自动生成） | 🔲 待完成 |
| M6 | Field Interface（语义类型 → DB + Zod + React） | 🔲 待完成 |
| M7 | ACL（策略模板 + 运行时过滤 + 字段级权限） | 🔲 待完成 |
| M8 | 工作流引擎（DAG 执行器 + 中断恢复 + YAML DSL） | 🔲 待完成 |
| M9 | JWT 认证 + 用户管理 | 🔲 待完成 |

### 阶段三：首个业务模块（第 10-15 周）

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M10 | Admin Layout 前端骨架 + 模块动态渲染 | 🔲 待完成 |
| M11 | Carbon 业务逻辑提取 → MES 模块（数据模型 + 服务） | 🔲 待完成 |
| M12 | MES 模块前端页面（工单/BOM/工艺路线） | 🔲 待完成 |
| M13 | 桌面窗口模式 UI（WindowManager + 桌面 + 任务栏） | 🔲 待完成 |
| M14 | 双 UI 模式切换 + 偏好持久化 | 🔲 待完成 |

### 阶段四：Podman 集成（第 16-20 周）

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M15 | Podman Proxy（HTTP 代理到隔离模块容器） | 🔲 待完成 |
| M16 | manifest.yaml 模块包格式 + 安装/卸载流程 | 🔲 待完成 |
| M17 | MODACS Vision 模块接入（Podman 隔离） | 🔲 待完成 |
| M18 | 端到端演示（MES 工单 → Vision 检测 → OA 工作流审批） | 🔲 待完成 |

### 阶段五：发布与社区（第 21-26 周）

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M19 | App Center（模块商店浏览/安装/升级） | 🔲 待完成 |
| M20 | 系统监控 + 备份恢复 | 🔲 待完成 |
| M21 | v0.1.0 正式发布 + 文档 | 🔲 待完成 |

> 集群扩展（多节点部署、联邦架构）见 [MODACS-Cluster](MODACS-Cluster.md)，作为 Phase 6+ 规划。
> MES 首个落地应用的详细开发方案见 [MES开发方案](MES开发方案.md)。

---

## 7. 待定与开放问题

- [ ] **模块包格式细节**：manifest.yaml 字段最终确认（融合 Odoo/NocoBase/Grafana/Strapi/DSM）
- [ ] **Podman 模块通信协议**：HTTP API 还是 gRPC？性能 vs 简单性权衡
- [ ] **Carbon 代码提取边界**：哪些组件可直接移植，哪些需要适配 Drizzle（脱离 Supabase）
- [ ] **社区治理模型**：是否成立技术指导委员会？外部贡献者协议？

---

## 8. 关键决策记录

| 日期 | 决策内容 |
| :--- | :--- |
| 2026-06-16 | 放弃 "OpenXXX" 命名路线，因全球范围内冲突严重 |
| 2026-06-16 | 确定主项目名为 **MODACS**（Modular On-Demand Application Composition System） |
| 2026-06-16 | 双项目架构：MODACS（决策层）+ Actuaium（执行层），共享 generic-core |
| 2026-06-23 | MES 首个应用基于 **Carbon (crbnos/carbon)** fork，技术栈 TS+React+Supabase |
| 2026-06-23 | 通信中间件选定 **dora-rs**（非 ROS2） |
| 2026-06-23 | 数据库选定 **PostgreSQL + TimescaleDB**，不引入 InfluxDB/MongoDB |
| 2026-06-23 | 视频系统独立为 **MODACS Vision** 项目，参考群晖 Surveillance Station |
| 2026-06-23 | **MODACS 升级为平台品牌**，系列产品统一命名：Sense/Core/Act/Vision/Link |
| 2026-06-23 | Actuaium → MODACS Act；VideoHub → MODACS Vision；MLA → MODACS Link |
| 2026-06-26 | **架构范式从群晖 DSM 模式改为 Odoo 模式**：进程内动态模块加载，共享 PG，不用 Docker 套件 |
| 2026-06-26 | **核心语言从 Rust 改为 TypeScript**：前后端类型共享，Carbon 业务代码可移植，Bun 单二进制部署 |
| 2026-06-26 | **运行时选定 Bun + Hono**：Bun 编译单二进制，Hono 轻量 Web 框架 |
| 2026-06-26 | **ORM 选定 Drizzle**：TS 原生类型安全，替代 Carbon 的 Supabase 依赖 |
| 2026-06-26 | **不 fork NocoBase**：借 6 大概念重新实现，3 个核心绑定不可接受 |
| 2026-06-26 | **不 fork Carbon 作为平台**：提取业务逻辑为首个 MES 模块，平台从零构建 |
| 2026-06-26 | **Podman 替代 Docker**：daemonless，容器是例外不是常态，仅 Vision/Act 使用 |
| 2026-06-26 | **放弃 Traefik/Redis**：Hono proxy 替代 Traefik，EventEmitter 替代 Redis Pub/Sub |
| 2026-06-26 | **前端选定 React 19 + TanStack Router + Tailwind**：动态路由注册，Carbon 组件可移植 |
| 2026-06-26 | **双 UI 模式**：桌面窗口式 + Admin 面板式，一键切换，~90% 代码共享 |
| 2026-06-26 | **dora-rs 降级**：不再作为平台核心运行时，降为 MODACS Link 模块内部使用 |
| 2026-06-26 | **新增工作流引擎**：内置 DAG 引擎，借鉴 n8n（执行器）+ Coze（中断恢复）+ Dify（YAML DSL），为 OA/MES/ERP 提供统一流程编排 |
| 2026-06-26 | **工作流中断恢复**：借鉴 Coze InterruptError + State 快照持久化，支持跨天/跨周审批流程 |
| 2026-06-26 | **工作流定义格式**：YAML DSL（借鉴 Dify），可导出/导入/版本控制 |
| 2026-06-26 | **n8n 许可证注意**：n8n 是 Fair-code（非 OSI 开源），仅借鉴设计模式，不复制代码 |
| 2026-06-29 | **架构演进为多进程插件隔离**：每个 TS 业务插件独立 Bun 子进程，崩溃不影响平台；社区先例 Grafana/HashiCorp/VS Code |
| 2026-06-29 | **插件间 IPC 选定 UDS JSON-RPC**：~20μs 延迟；单一 IPC 通吃 RPC+事件+流式；社区共识 |
| 2026-06-29 | **数据流通信选定 Zenoh**：高频大 payload 走 Zenoh SHM 零拷贝；TS+Python 官方 SDK |
| 2026-06-29 | **客户端推送选定 SSE**：单向推送场景；Hono 原生支持；浏览器自动重连 |
| 2026-06-29 | **录制回放选定 MCAP + Foxglove**：旁路录制所有 RPC+事件零侵入；ROS2 默认格式 |
| 2026-06-29 | **实时可观测选定 OpenTelemetry**：RPC 调用链追踪；后端 Jaeger/Grafana Tempo |
| 2026-06-29 | **集群模式选定节点自包含**：每节点完整自包含（UDS 内部通信），跨节点走 HTTP API |
| 2026-06-29 | **运行时从 Bun 改为 Node.js 24 LTS**：Bun 1.3.x 有 HTTPS 挂起 bug + 长运行内存泄漏 + 4.8k 未解决 issue；Node.js 15 年生产验证，稳定第一；加 DB 后性能差距仅 3% |
| 2026-06-29 | **包管理选定 pnpm**：Monorepo 最佳实践（workspaces + 硬链接省磁盘 + 严格依赖隔离）；不用 npm（慢 + 幽灵依赖）；不用 bun install（卡死报告） |
| 2026-06-29 | **构建选定 tsx + esbuild**：tsx 开发热重载；esbuild bundle → 单文件 JS + node 二进制部署；不用 Bun 专有 API，代码运行时无关 |
| 2026-06-29 | **多进程隔离改为 Node.js fork**：node:child_process.fork 替代 Bun.spawn；UDS HTTP 用 undici Agent；Hono 用 @hono/node-server |
| 2026-06-29 | **UI 组件库选定 shadcn/ui + TanStack Table**：Tailwind 原生（Carbon 兼容）；源码在手可自由定制；不选 Ant Design（Less 与 Tailwind 冲突 + Carbon 移植成本高） |
| 2026-06-29 | **前端三层 UI 隔离**：UI Adapter 接口 + 平台复合组件 + Field Interface 注册表；模块代码不直接 import UI 框架；切换框架成本 ~1 周（vs 不隔离 ~4 周） |
| 2026-06-29 | **数据库选定 PostgreSQL**：平台需并发写/RLS/并行查询/在线备份；Carbon 从 Supabase（PG）迁移零成本；SQLite 不支持多进程并发写，否决 |
| 2026-06-29 | **Foxglove WebSocket Bridge**：与 Recorder 共享 Event Bus，实时推送 RPC/事件到 Foxglove App；`MODACS_DEBUG=1` 按需开启；Recorder = 黑匣子（离线），Bridge = 监控屏（实时） |
| 2026-06-29 | **JSON-RPC 协议全自建**：~50 行代码，不引入 procwire/node-ipc-jsonrpc 等库；借鉴 procwire 的 ProcessManager 设计 + node-ipc-jsonrpc 的 auto-reconnect 模式 |
| 2026-06-29 | **消息格式不做切换**：JSON 够用（性能瓶颈在 DB，序列化占 < 0.5%）；MessagePack/Arrow 破坏 JSON-RPC 2.0 标准 + MCAP 可读性；高通量场景走 Zenoh 独立通道 |
| 2026-06-29 | **UDS 经社区验证**：Home Assistant 2026.02 从 TCP 迁移到 UDS（隐式信任 + 免 token + 性能）；Grafana/HashiCorp 也用 UDS（gRPC）；MODACS = HA 传输层 + Odoo 协议层 |
| 2026-06-29 | **UDS 不影响集群**：UDS 管节点内通信，集群走 HTTP API + NATS；社区共识：不做跨节点透明 RPC（部分失败/网络分区/调试困难/安全边界） |
| 2026-06-29 | **开发计划改为垂直切片**：5 Slice / 14 周（原 12 Step / 21 周）；每 2 周可演示；首次 UI Week 5（原 Week 12）；架构验证 Week 2（原 Week 4） |
| 2026-06-29 | **测试策略：选择性 TDD**：纯逻辑 TDD（protocol/RBAC/DSL）+ 基础设施集成测试 + UI Playwright e2e；Slice 1 不写测试（Spike）；时间成本 +15% |
| 2026-06-29 | **通信模式只做三种**：req/rep（HTTP RPC）+ pub/sub（fan-out event）+ streaming（SSE+Zenoh）；不做 push/pull（非消息队列）、不引入 ZMQ/NNG（破坏调试+MCAP）、不做 gRPC stream（Zenoh 已覆盖高通量） |
| 2026-06-29 | **产品命名重构**：取消 Sense 中间层品牌；统一编辑器 = MODACS Studio（UE/VS Code/TIA Portal 模式，插件扩展）；运行时独立产品 = HMI/Edge/Remote；行业先例验证 Ignition/Siemens/AVEVA 均无中间层品牌 |

> 命名查重与分析详情见 [MODACS-Naming](MODACS-Naming.md)。

---

## 9. 术语表

| 术语 | 释义 |
| :--- | :--- |
| **MODACS** | Modular On-Demand Application Composition System（平台品牌） |
| **MODACS Studio** | 统一编辑器/IDE（画面组态/工作流/数据模型/调试），插件扩展新编辑器 |
| **MODACS HMI** | 触摸屏/工控机运行时（组态画面渲染 + 操作交互） |
| **MODACS Edge** | 边缘采集运行时（串口/USB/Modbus/OPC UA + Store-and-Forward） |
| **MODACS Remote** | 远程监控运行时（浏览器，只读/可操作） |
| **MODACS Core** | 决策层产品（MES/ERP/OA），即 MODACS 平台核心 |
| **MODACS Act** | 执行层产品（PLC/CNC/DCS） |
| **MODACS Vision** | 视频监控与 AI 分析产品 |
| **MODACS Link** | 通信中间件产品 |
| **Node.js** | JavaScript 运行时（V8 引擎），15 年生产验证；MODACS 使用 24 LTS |
| **pnpm** | 包管理器，硬链接省磁盘 + 严格依赖隔离 + Monorepo workspaces 原生支持 |
| **tsx** | TypeScript 执行器，比 ts-node 快 10 倍；MODACS 开发时用 |
| **esbuild** | JS/TS 打包器，比 webpack 快 100 倍；MODACS 构建时用 |
| **shadcn/ui** | React UI 组件方案（非传统 npm 库，源码 copy-paste），基于 Tailwind + Radix；MODACS 通过 UI Adapter 接口隔离 |
| **UI Adapter** | 框架无关的 UI 组件接口，切换 UI 框架只需重写 adapter 实现 |
| **TanStack Table** | Headless 数据表格库（排序/筛选/分页/虚拟滚动），不绑 UI 框架 |
| **Drizzle** | TypeScript 原生 ORM，类型安全，零运行时开销 |
| **Podman** | daemonless 容器引擎，MODACS 用于可选模块隔离 |
| **Plugin** | MODACS 模块，运行在独立子进程中（或 inline 在平台核心） |
| **UDS JSON-RPC** | 插件间通信协议，基于 Unix Domain Socket，~20μs 延迟 |
| **ProcessManager** | 平台核心组件，管理子进程启动/监控/重启 |
| **RPC Hub** | 平台核心组件，UDS JSON-RPC 路由 + 事件广播 + 旁路录制 |
| **MCAP** | 开源录制格式（Foxglove/MIT），ROS2 默认日志格式，MODACS 用于录制回放 |
| **Foxglove** | 可视化工具，可打开 MCAP 文件回放，支持 3D/Plot/表格等面板 |
| **SSE** | Server-Sent Events，平台向浏览器推送告警/状态的机制 |
| **Zenoh** | 高性能 pub/sub 协议，MODACS 用于 Vision/Act 数据流通信 |
| **Collection** | NocoBase 概念，数据模型定义，自动生成 CRUD API |
| **Field Interface** | 语义类型 → DB 列 + Zod 校验 + React 组件的映射 |
| **Resource Manager** | 从 Collection 定义自动生成 REST API 的机制 |
| **Workflow Engine** | 平台内置 DAG 工作流引擎，支持中断恢复，为 OA/MES/ERP 提供流程编排 |
| **Interrupt & Resume** | 工作流中断恢复机制（借鉴 Coze），人工审批节点暂停执行，外部条件满足后恢复 |
| **Workflow DSL** | YAML 格式工作流定义（借鉴 Dify），可导出/导入/版本控制 |
| **Carbon** | crbnos/carbon，开源 MES 系统，MODACS MES 模块的业务逻辑来源 |
| **NocoBase** | 开源无代码平台，MODACS 借鉴其 6 大核心概念 |
| **n8n** | 工作流自动化平台，MODACS 借鉴其 DAG 执行器设计（Fair-code，仅借鉴设计不复制代码） |
| **Dify** | LLM 应用开发平台，MODACS 借鉴其工作流 DSL 和插件分类法 |
| **Coze（扣子）** | AI Bot 开发平台，MODACS 借鉴其工作流中断恢复和状态管理设计 |
| **MES** | Manufacturing Execution System |
| **ERP** | Enterprise Resource Planning |
| **PLC** | Programmable Logic Controller |

---

## 相关文档

| 文档 | 内容 |
| :--- | :--- |
| [MODACS-Naming](MODACS-Naming.md) | 命名白皮书：查重分析、系列产品命名决策 |
| [MODACS-Platform](MODACS-Platform.md) | 平台架构：多进程插件隔离、UDS JSON-RPC、工作流引擎、MCAP 可观测 |
| [MODACS-Platform-Dev](MODACS-Platform-Dev.md) | 平台开发计划：垂直切片 5 Slice / 14 周（含 Demo Checklist） |
| [MODACS-AI-Dev](MODACS-AI-Dev.md) | AI 开发指南：技术栈约束、代码模板、禁止清单、测试策略 |
| [MODACS-Platform-Ref](MODACS-Platform-Ref.md) | 开源参考：CasaOS / Runtipi / 1Panel / NocoBase / n8n / Dify / Coze 架构深度对比 |
| [MODACS-Cluster](MODACS-Cluster.md) | 集群架构：多节点管理、模块调度、版本管理 |
| [MODACS-Act](MODACS-Act.md) | 执行层产品：软 PLC、CNC、DCS |
| [MODACS-Link](MODACS-Link.md) | 通信中间件：中间件抽象层设计 |
| [MODACS-Vision](MODACS-Vision.md) | 视频产品：视频监控与 AI 分析平台 |
| [MES开发方案](MES开发方案.md) | MES 开发方案：技术选型、渐进式路线图 |
| [嵌入式学习路线](嵌入式学习路线.md) | 独立开发者嵌入式进阶路径（位于 `人生规划/`） |
