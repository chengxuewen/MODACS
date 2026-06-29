# MODACS 集群架构与模块平台设计

> 本文在 [MODACS-Platform](./MODACS-Platform.md)（单节点模块体系）基础上，补充**多系统集群管理**和**集群级模块版本管理**两个维度。
> 面向工业多厂区、多车间场景。
>
> **⚠️ 架构演进说明**（2026-06-29）：
> MODACS 已演进为多进程插件隔离架构（每个 TS 业务插件独立 Node.js 子进程，UDS JSON-RPC 通信）。
> 集群模式采用**节点自包含**——每台服务器是一个完整的 MODACS 节点（平台核心 + 所有 TS 插件 + UDS 通信），
> 跨节点走 HTTP API（不是跨节点 RPC）。这是社区共识（HA/Grafana/Odoo 都这样做）。
> 集群架构的核心概念（三级架构、联邦、集中升级）仍然适用。

---

## 1. 背景与动机

### 1.1 从单节点到集群

[MODACS-Platform](./MODACS-Platform.md) 已完成单节点层面的"平台 + 套件"设计（App Center、.mpk 包格式、事件总线等）。
但工业场景天然需要多节点：

```
典型场景：

工厂 A（3D 打印车间）              工厂 B（注塑车间）
┌──────────────────────┐         ┌──────────────────────┐
│  MES 服务器（普通）    │         │  MES 服务器（普通）    │
│  GPU 服务器 1（视觉）  │         │  GPU 服务器 1（视觉）  │
│  GPU 服务器 2（视觉）  │         │                      │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           └────────── 总部管理层 ──────────┘
                    │
           ┌────────┴────────┐
           │  统一仪表盘       │
           │  统一用户管理     │
           │  跨厂区报表       │
           │  集中升级管理     │
           └─────────────────┘
```

### 1.2 需求对照

| 需求 | 群晖/飞牛 NAS | MODACS 工业场景 |
|------|-------------|----------------|
| 多节点管理 | DSM 多设备管理 | 多工厂/多车间服务器统一管理 |
| 应用分发 | 套件中心推送安装 | 同一套件部署到多个节点 |
| 集中认证 | DSM 统一账户 | 总部一次登录，访问所有厂区 |
| 跨节点数据 | Drive ShareSync | 工单/质量数据跨厂区同步 |
| 集中监控 | 统一监控面板 | 所有厂区设备状态一览 |
| 版本管理 | 套件独立升级 + 兼容性检查 | 集群级滚动升级 + 回滚 |

### 1.3 核心原则：工业集群 ≠ K8s 集群

| 特性 | K8s 集群（云原生） | MODACS 集群（工业） |
|------|-------------------|---------------------|
| 节点数量 | 几十到几千 | 2-10 台（一个厂区） |
| 网络质量 | 数据中心级 | 工厂网络，可能不稳定 |
| 节点异构 | 通用算力 | GPU 服务器 / PLC 控制器 / 普通服务器 |
| 实时性 | 无硬实时要求 | 控制层有亚毫秒级要求 |
| 运维能力 | 专职 SRE 团队 | 工厂 IT，能力有限 |
| 离线能力 | 不需要 | 工厂断网时必须独立运行 |

**结论：不直接用 K8s，参考群晖/飞牛的轻量级集群方案。**

---

## 2. 三级架构设计

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                  Level 3: 联邦（Federation）                  │
│                                                            │
│    总部仪表盘：跨集群报表、全局用户、集中升级分发              │
│    （轻量 HTTP 聚合，不强一致）                               │
├───────────────┬──────────────────┬──────────────────────────┤
│               │                  │                          │
│  ┌────────────┴─────────┐  ┌────┴───────────┐  ┌──────────┴──────┐
│  │ Level 2: 集群 Cluster │  │ 集群 B         │  │ 集群 C          │
│  │ （工厂 A，内网）       │  │ （工厂 B）     │  │ （研发测试）     │
│  │                      │  │                │  │                │
│  │  Master 节点         │  │  Master 节点   │  │  Master 节点    │
│  │  ┌────────────────┐  │  │  ┌──────────┐  │  │                │
│  │  │ MODACS Core    │  │  │  │ MODACS   │  │  │                │
│  │  │ + Cluster Mgr  │  │  │  │ Core     │  │  │                │
│  │  └───────┬────────┘  │  │  └────┬─────┘  │  │                │
│  │          │           │  │       │        │  │                │
│  │  ┌───────┴────────┐  │  │  ┌────┴──────┐ │  │                │
│  │  │ Worker 节点     │  │  │  │ Worker    │ │  │                │
│  │  │ MES + ERP      │  │  │  │ MES       │ │  │                │
│  │  └────────────────┘  │  │  └───────────┘ │  │                │
│  │  ┌────────────────┐  │  │                │  │                │
│  │  │ Worker 节点     │  │  │                │  │                │
│  │  │ GPU + Vision   │  │  │                │  │                │
│  │  └────────────────┘  │  │                │  │                │
│  └──────────────────────┘  └────────────────┘  └────────────────┘
│                                                            │
│  Level 1: 节点（Node）—— 即现有单节点设计，完全不变           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 各层职责

| 层级 | 职责 | 技术方案 |
|------|------|---------|
| **Level 1: 节点** | 现有单节点设计完全复用 | Docker + MODACS Core（见 [MODACS-Platform](./MODACS-Platform.md)） |
| **Level 2: 集群** | 一个 Master + 多个 Worker，套件分发和监控 | 自研 Cluster Manager（Node.js） |
| **Level 3: 联邦** | 多集群松耦合聚合，跨厂区报表和统一登录 | 轻量 HTTP 聚合层 |

### 2.3 核心原则

- **Level 1 零修改**：现有 [MODACS-Platform](./MODACS-Platform.md) 的 .mpk 格式、App Center、事件总线设计完全不变
- **Level 2 增量扩展**：Master 上的 Cluster Manager 是 MODACS Core 的可选模块
- **Level 3 松耦合**：联邦层不强制一致性，断网时各集群独立运行
- **降级安全**：Worker 断网时自动降级为单节点模式，业务不受影响

---

## 3. 集群管理设计

### 3.1 Cluster Manager 架构

```
┌─────────────────────────────────────────────────────┐
│                Cluster Manager                       │
│            （MODACS Core 扩展模块）                    │
├──────────────┬──────────────┬───────────────────────┤
│  节点注册     │  套件调度     │  集群监控             │
│              │              │                       │
│ Worker 上线  │ 按能力调度    │ 节点健康状态          │
│ → 注册能力   │ GPU→视觉套件  │ 套件运行状态          │
│   (CPU/RAM/  │ PLC→控制套件  │ 资源使用率            │
│    GPU/PLC)  │ 普通→MES/ERP  │ 跨节点事件流          │
├──────────────┼──────────────┼───────────────────────┤
│  集中认证     │  版本管理     │  数据同步             │
│              │              │                       │
│ 集群级 SSO   │ 滚动升级      │ 平台数据：PG 流复制   │
│ 用户/角色     │ 版本兼容检查  │ 套件数据：按需同步    │
│ 全集群生效    │ 回滚机制      │ 文件数据：NFS/同步    │
└──────────────┴──────────────┴───────────────────────┘
```

### 3.2 节点注册与发现

```
节点上线流程：

1. Worker 节点安装 MODACS Core（轻量版，不含 App Center UI）
2. Worker 向 Master 注册：
   POST /api/cluster/nodes/register
   {
     "node_id": "worker-gpu-01",
     "address": "192.168.1.50",
     "capabilities": {
       "cpu": "Intel i7-12700",
       "ram_gb": 64,
       "gpu": "RTX 4090",
       "gpu_count": 1,
       "labels": ["gpu", "vision", "edge"]
     },
     "modacs_version": "0.3.0"
   }
3. Master 验证 → 颁发节点证书 → 加入集群
4. Master 定期心跳检测（每 10s），3 次失败标记为 offline
5. Worker 断网 → 自动降级为单节点模式，本地套件继续运行
```

### 3.3 套件调度

manifest.yaml 扩展集群调度字段：

```yaml
# manifest.yaml 集群扩展
name: videohub
version: 0.2.0

# 现有字段保持不变（见 MODACS-Platform 第 4 节）
requirements:
  min_ram: 2GB
  gpu: required
  disk: 10GB

# ★ 新增：集群调度策略
scheduling:
  mode: single-node        # single-node | replicated | distributed
  constraints:
    - node_label: gpu      # 必须部署到有 GPU 标签的节点
  replication: 1           # 每个符合条件的节点部署 1 个实例
  anti_affinity: false     # 允许多实例在同一节点

# ★ 新增：跨节点通信声明
cluster:
  events:
    propagate: true        # 事件是否传播到集群其他节点
  api:
    expose: true           # API 是否对集群其他节点可见
```

调度模式说明：

| 模式 | 含义 | 典型场景 |
|------|------|---------|
| `single-node` | 只部署到一个节点 | ERP、OA（轻量，单实例够用） |
| `replicated` | 每个符合条件的节点都部署 | MODACS Vision（每台 GPU 服务器各跑一路） |
| `distributed` | 跨节点分布式部署 | SoftPLC（多节点协同控制） |

### 3.4 集群级事件总线

```
单节点事件总线（现有）：         集群级事件总线（扩展）：

节点内部：                       Master：
├── UDS JSON-RPC notification    ├── 集群事件路由器（NATS）
├── 插件 A → 插件 B              │   ├── 跨节点事件转发
└── 本地事件                     │   ├── 事件过滤与订阅管理
                                 │   └── 事件持久化（可选）
节点内部：
├── UDS JSON-RPC notification    节点 1 ←→ Master ←→ 节点 2
├── 插件 C → 插件 D              ├── 本地事件：UDS（快）
└── 本地事件                     └── 跨节点事件：NATS（可靠）
```

**设计要点**：
- 本地事件走 UDS JSON-RPC notification（微秒级，不变）
- 跨节点事件走 NATS（毫秒级，可靠传递）
- 不是所有事件都需要跨节点传播，由 `cluster.events.propagate` 控制
- 断网时本地事件正常工作，跨节点事件缓存待恢复

---

## 4. 应用版本管理设计

### 4.1 版本兼容性模型

```yaml
# manifest.yaml 版本管理扩展
name: videohub
version: 0.2.0

# ★ 新增：平台兼容性
compatibility:
  min_platform: 0.2.0      # 最低要求 MODACS Core 版本
  max_platform: 1.0.0      # 最高兼容平台版本（可选）

# ★ 新增：升级策略
upgrade:
  from:
    - version: ">=0.1.0"   # 从哪些版本可以升级
  migration: true           # 是否需要数据迁移
  rollback: true            # 是否支持回滚
  breaking_changes:         # 破坏性变更声明
    - "API /cameras/{id} 响应格式变更"

# ★ 新增：套件间版本依赖
depends:
  - name: modacs-core
    min_version: 0.2.0
  - name: modacs-link
    min_version: 0.1.0
    optional: true          # 可选依赖
```

### 4.2 集群级升级流程

```
集群升级流程：

1. 在 App Center 选择套件新版本
2. Cluster Manager 检查：
   ├── 平台版本兼容性（min_platform / max_platform）
   ├── 套件间依赖兼容性（depends）
   ├── 数据迁移脚本是否存在（upgrade.migration）
   └── 各节点资源是否满足新版本要求
3. 选择升级策略：
   │
   ├── 滚动升级（适用于 replicated 模式）
   │   节点1升级 → 健康检查通过 → 节点2升级 → ...
   │   任一节点失败 → 暂停升级，已升级节点保留
   │
   ├── 原地升级（适用于 single-node 模式）
   │   停止 → 备份数据 → 升级 → 启动 → 健康检查
   │   失败 → 自动回滚到备份版本
   │
   └── 蓝绿部署（适用于关键套件）
       新版本并行启动 → 流量切换 → 旧版本保留（可回滚）
4. 升级完成 → 更新集群版本注册表
5. 升级失败 → 自动回滚 + 告警通知
```

### 4.3 版本注册表

```
集群级版本状态（存储在 Master 的 PostgreSQL）：

modacs_cluster.app_versions
┌────────────┬─────────┬──────────┬────────────┬───────────┐
│ app_name   │ version │ node_id  │ status     │ updated   │
├────────────┼─────────┼──────────┼────────────┼───────────┤
│ videohub   │ 0.2.0   │ gpu-01   │ running    │ 2026-06-25│
│ videohub   │ 0.2.0   │ gpu-02   │ running    │ 2026-06-25│
│ videohub   │ 0.1.0   │ gpu-03   │ running    │ 2026-06-20│ ← 待升级
│ mes        │ 0.3.0   │ mes-01   │ running    │ 2026-06-25│
│ mes        │ 0.3.0   │ mes-02   │ upgrading  │ 2026-06-25│ ← 升级中
└────────────┴─────────┴──────────┴────────────┴───────────┘
```

---

## 5. 参考开源项目

### 5.1 平台 + 应用商店（DSM 模式）

这些项目实现了"平台 + 应用商店"架构，是 MODACS 套件体系的直接参考：

| 项目 | Stars | 技术栈 | 应用打包 | 多节点 | 许可证 | 参考价值 |
|------|-------|--------|---------|--------|--------|---------|
| **[CasaOS](https://github.com/IceWhaleTech/CasaOS)** | ~34K | Go + Vue | Docker Compose + JSON | ❌ | Apache 2.0 | ⭐⭐⭐⭐⭐ 架构最接近，Go 后端 + Docker 应用 |
| **[Runtipi](https://github.com/runtipi/runtipi)** | ~9.5K | NestJS + React | Docker Compose + config.json | ❌ | GPL v3 | ⭐⭐⭐⭐⭐ 应用商店分离最佳实践 |
| **[1Panel](https://github.com/1Panel-dev/1Panel)** | ~36K | Go + Vue | Docker + 应用模板 | 仅 Pro版 | GPL v3 | ⭐⭐⭐⭐ 中文生态，应用商店丰富 |
| **[Coolify](https://github.com/coollabsio/coolify)** | ~57K | PHP/Laravel | Docker + Git 部署 | ✅ SSH 多服务器 | Apache 2.0 | ⭐⭐⭐⭐ 多服务器管理参考 |
| **[Umbrel](https://github.com/getumbrel/umbrel)** | ~11K | React + Node | Docker Compose + YAML | ❌ | 非开源 | ⭐⭐⭐ 全 OS 镜像方式参考 |
| **[Cosmos Cloud](https://github.com/azukaar/Cosmos-Server)** | ~6K | Go | Docker + 反向代理 | 部分 | 非标准 | ⭐⭐⭐ 安全优先设计参考 |
| **[Dokploy](https://github.com/Dokploy/dokploy)** | ~35K | Next.js | Docker Swarm | ✅ Swarm 原生 | Apache 2.0 | ⭐⭐⭐⭐ Swarm 多节点参考 |

#### 重点参考分析

**CasaOS — 架构参考首选**

```
CasaOS 架构（Go + Vue）：
├── CasaOS 核心服务
│   ├── 应用管理（Docker Compose 封装）
│   ├── 文件管理
│   ├── 系统监控
│   └── 用户管理
├── App Store（独立 Git 仓库）
│   ├── 每个应用 = 一个目录
│   ├── docker-compose.yml + 配置
│   └── Git PR = 应用提交流程
└── 前端（Vue SPA）

MODACS 可借鉴：
├── Node.js 后端 + React 前端 ← 已选 TS + React
├── App Store 独立 Git 仓库 ← .mpk 仓库化
├── Docker Compose 作为应用封装 ← 已采用
└── 应用安装 = docker compose up ← 已采用
```

**Runtipi — 应用商店分离模式**

```
Runtipi 的应用商店设计：
├── 应用商店 = 独立 Git 仓库（runtipi/runtipi-appstore）
├── 每个应用包含：
│   ├── config.json      # 元数据 + 表单字段
│   ├── docker-compose.yml  # 容器定义
│   │   + x-runtipi 扩展字段（路由、端口）
│   └── metadata/
│       ├── logo.jpg
│       └── description.md
├── 支持第三方应用商店（多源）
└── 应用数据统一在 app-data/ 目录

MODACS 可借鉴：
├── .mpk 仓库化 → 独立 Git 仓库
├── manifest.yaml 扩展表单字段（安装时配置）
├── 第三方套件源（企业内部套件仓库）
└── x-modacs Docker Compose 扩展字段
```

**Dokploy — Docker Swarm 多节点**

```
Dokploy 的多服务器方案：
├── 基于 Docker Swarm 原生多节点
├── 主节点通过 SSH 连接 Worker
├── 应用部署 = docker stack deploy
├── 每个服务器可独立管理
└── Traefik 自动路由

MODACS 可借鉴：
├── Docker Swarm 作为轻量级集群底座
├── Master → Worker 的 SSH 管理通道
└── Traefik 作为集群级反向代理
```

### 5.2 轻量级容器编排（K8s 替代方案）

| 项目 | Stars | 特点 | 多节点 | 适合 MODACS？ |
|------|-------|------|--------|--------------|
| **[k3s](https://github.com/k3s-io/k3s)** | ~33K | 单二进制 K8s，HA，ARM，离线部署 | ✅ 内置 | ⭐⭐⭐ 太重，工厂 IT 运维难 |
| **Docker Swarm** | 内置 | 最简单，Docker 原生 | ✅ 内置 | ⭐⭐⭐⭐⭐ 最适合，但进入维护模式 |
| **[Nomad](https://github.com/hashicorp/nomad)** | ~16.6K | 非 K8s，支持容器+原生进程+VM | ✅ 联邦 | ⭐⭐⭐ 灵活但 BSL 许可证 |
| **[k0s](https://github.com/k0sproject/k0s)** | ~6.2K | 零依赖 K8s，离线原生 | ✅ | ⭐⭐ 仍是 K8s 复杂度 |

#### 编排方案选择

```
推荐方案：Docker Swarm + 自研调度层

理由：
├── Docker Swarm 是 Docker 原生功能，无需额外安装
├── 工厂 IT 已熟悉 Docker，学习成本最低
├── docker stack deploy 即可完成多节点部署
├── 服务发现、负载均衡内置
├── 断网时各节点独立运行（Swarm 模式降级）
└── 虽然 Docker Swarm 进入 LTS 维护（到 2030），但功能已足够

不选 K8s/k3s 的理由：
├── 工厂 IT 团队没有 K8s 运维能力
├── K8s 的 Pod/Service/Ingress/ConfigMap 概念过于复杂
├── 资源开销大（k3s 最少 512MB，Swarm 几乎零开销）
├── 离线场景支持差
└── MODACS 套件已经是 Docker 容器，不需要 K8s 的 Pod 抽象

自研调度层职责：
├── 基于节点标签的调度（GPU→视觉，PLC→控制）
├── 套件版本兼容性检查
├── 滚动升级编排
└── 健康检查与自动恢复
```

### 5.3 可参考的技术组件

| 能力 | 推荐组件 | 替代方案 | 理由 |
|------|---------|---------|------|
| 容器编排 | Docker Swarm | — | Docker 原生，零额外开销 |
| 服务发现 | Docker Swarm DNS | etcd / Consul | Swarm 内置，无需额外部署 |
| 反向代理 | Traefik | Nginx | 自动服务发现，自动 TLS |
| 跨节点事件 | NATS | — | 轻量，支持持久化，工业级 |
| 本地 RPC | UDS JSON-RPC | — | ~20μs，curl 可调试，HA 2026 已迁移到 UDS |
| 数据库同步 | PostgreSQL 流复制 | — | PG 已是选型，流复制成熟 |
| 文件同步 | Syncthing | NFS | 去中心化，支持断网恢复 |
| 集群通信 | HTTP API | gRPC | 管理面 HTTP（不跨节点透明 RPC） |
| 配置中心 | etcd | Consul | 轻量，Raft 共识 |

---

## 6. 渐进式开发计划

### 6.1 总览

```
                    MODACS 平台渐进式开发路线图

单节点 MVP（Slice 1-5，见 MODACS-Platform-Dev）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Slice 1-5  架构探针→数据→UI→MES→工作流+ACL   Week 1-14（~3.5 月）
           产出：完整可用的单节点 MES 平台
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 4   集群管理（本文）                      Month 4-7（Slice 完成后）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 5   联邦与生态                            Month 8+
```

### 6.2 单节点 MVP：Slice 1-5（概要回顾）

详见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md)，核心产出：

| Slice | 时间 | 目标 | 产出 |
|-------|------|------|------|
| Slice 1 | Week 1-2 | 架构探针 | UDS + MCAP + Foxglove 验证 |
| Slice 2 | Week 3-4 | 数据层 + 认证 | Postgres + Collection + JWT |
| Slice 3 | Week 5-7 | 第一个 UI | shadcn/ui + Admin Layout + CRUD |
| Slice 4 | Week 8-12 | MES 业务模块 | 6-8 个 Collection + 工单全链路 |
| Slice 5 | Week 13-14 | 工作流 + ACL | DAG 引擎 + RBAC + 中断恢复 |

**Slice 5 结束 = 单节点 MVP 交付**：
- [ ] 完整可用的 MES 平台（工单 CRUD + 审批流程 + 权限）
- [ ] MCAP 录制 + Foxglove 回放
- [ ] UI 三层隔离架构验证通过

### 6.3 Phase 4：集群管理

#### Phase 4a：多节点注册与套件跨节点部署（Month 4-6）

**目标**：一个 Master 管理多个 Worker，套件可按节点能力部署

```
Phase 4a 交付物：

集群基础设施：
├── Docker Swarm 初始化（Master + Worker 加入）
├── 节点注册 API（POST /api/cluster/nodes/register）
├── 节点能力声明（CPU/RAM/GPU/标签）
├── 心跳检测与节点状态管理
└── modacs cluster CLI 工具
    ├── modacs cluster init          # 初始化集群
    ├── modacs cluster node add      # 添加节点
    ├── modacs cluster node list     # 查看节点
    └── modacs cluster node remove   # 移除节点

套件调度：
├── manifest.yaml 扩展 scheduling 字段
├── 基于节点标签的调度引擎
├── docker stack deploy 多节点部署
└── App Center 显示集群拓扑 + 节点选择

反向代理：
├── Traefik 替代手动 Nginx 配置
├── 自动服务发现与路由
└── 跨节点 API 访问
```

**学习与参考**：
- 阅读 CasaOS 源码：应用管理部分（Go，可直接参考架构模式）
- 阅读 Dokploy 源码：Docker Swarm 多节点管理部分
- 阅读 Runtipi 文档：应用商店分离模式

**验证场景**：
```
1. Master + 2 Worker 集群搭建
2. 在 App Center 安装 MODACS Vision → 自动调度到 GPU 节点
3. 在 App Center 安装 MES → 部署到普通节点
4. 从任一节点访问 → Traefik 自动路由到正确节点
5. GPU 节点断网 → MES 继续工作，Vision 本地继续运行
```

#### Phase 4b：集群级 SSO 与跨节点事件（Month 10-11）

**目标**：集群统一认证，事件跨节点传播

```
Phase 4b 交付物：

集群级认证：
├── Master 统一 JWT 签发
├── Worker 节点 JWT 验证（无需回查 Master，用公钥验签）
├── 用户/角色集群级同步
└── 断网降级：Worker 用缓存的用户信息继续认证

跨节点事件总线：
├── NATS 部署在 Master
├── 每个 Worker 运行 NATS 边车
├── 事件分级：
│   ├── 本地事件：UDS JSON-RPC notification（不变）
│   └── 集群事件：NATS（propagate=true 的事件）
├── 事件过滤：Worker 只接收订阅的事件
└── 断网缓存：跨节点事件本地持久化，恢复后重发

集群监控：
├── 各节点资源使用率聚合
├── 套件运行状态全局视图
├── 节点离线告警
└── 集群仪表盘 UI
```

#### Phase 4c：集群级版本管理（Month 12）

**目标**：集群级滚动升级、回滚、兼容性检查

```
Phase 4c 交付物：

版本管理：
├── manifest.yaml 扩展 compatibility + upgrade 字段
├── 集群版本注册表（PostgreSQL）
├── 版本兼容性检查引擎
│   ├── 平台版本检查
│   ├── 套件依赖检查
│   └── 数据迁移检查
└── App Center 版本管理 UI

升级引擎：
├── 滚动升级（replicated 模式）
│   逐节点升级 → 健康检查 → 继续/暂停
├── 原地升级（single-node 模式）
│   备份 → 升级 → 健康检查 → 失败回滚
├── 蓝绿部署（关键套件）
│   新版本并行启动 → 流量切换 → 旧版本保留
└── 升级历史记录与审计

modacs cluster CLI 扩展：
├── modacs cluster upgrade <app> <version>
├── modacs cluster rollback <app>
├── modacs cluster status           # 集群状态
└── modacs cluster health           # 健康检查
```

**Phase 4 结束时的交付标准**：
- [ ] 2+ 节点集群可正常工作
- [ ] 套件按节点能力自动调度
- [ ] 集群统一 SSO，一次登录访问所有节点
- [ ] 事件跨节点传播，断网可恢复
- [ ] 套件可集群级滚动升级，失败可回滚
- [ ] 节点断网不影响其他节点和本地套件

### 6.4 Phase 5：联邦与生态（Month 13+）

```
Phase 5a：联邦层
├── 多集群统一登录（OIDC 联邦）
├── 跨集群报表聚合（HTTP 聚合层）
├── 跨集群套件分发（总部推送升级到各厂区）
└── 联邦仪表盘

Phase 5b：生态建设
├── 套件开发 SDK（TypeScript）
├── 套件开发者文档
├── 第三方套件源支持
├── 套件市场（公开/私有）
└── 社区贡献流程
```

---

## 7. 技术选型总表

| 能力 | 选型 | 理由 |
|------|------|------|
| **平台后端** | Node.js + Hono | 与 MODACS 技术栈一致 |
| **前端** | React + TypeScript + shadcn/ui | 与 MES 技术栈一致 |
| **容器运行时** | Docker + Docker Swarm | 原生多节点，工厂 IT 可运维 |
| **反向代理** | Traefik | 自动服务发现，Swarm 原生支持 |
| **服务发现** | Swarm DNS | 内置，无需额外组件 |
| **集群事件** | NATS | 轻量，支持持久化，工业级 |
| **本地事件** | UDS JSON-RPC notification | 微秒级，单节点内通信 |
| **本地 RPC** | UDS JSON-RPC over HTTP | ~20μs，curl 可调试 |
| **数据库** | PostgreSQL + 流复制 | 已选型，集群级强一致 |
| **配置存储** | etcd | Raft 共识，集群元数据 |
| **文件同步** | Syncthing | 去中心化，断网恢复 |
| **集群通信** | HTTP API | 管理面 HTTP（不跨节点 RPC） |
| **套件包格式** | .mpk（tar.gz + manifest.yaml） | 已定义，扩展集群字段 |
| **App Store** | 独立 Git 仓库 | 参考 Runtipi 模式 |

---

## 8. 风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| **平台过度设计** | 🔴 高 | 严格遵循"先有应用再抽象平台"，集群功能在 Phase 3 完成后才开始 |
| **Docker Swarm 维护模式** | 🟡 中 | LTS 到 2030 年足够；如需要可迁移到自研调度 + Docker API |
| **集群分裂脑** | 🟡 中 | Master 用 RAFT 选举（etcd），Worker 断网时降级为单节点 |
| **数据一致性** | 🟡 中 | 平台数据强一致（PG 流复制），套件数据最终一致（事件同步） |
| **运维复杂度** | 🟡 中 | `modacs cluster` CLI 封装所有操作；提供 Web UI |
| **网络分区** | 🟡 中 | Worker 必须能独立运行，断网时降级为单节点模式 |
| **套件兼容性** | 🟡 中 | manifest.yaml 的 compatibility 字段 + 升级前自动检查 |

---

## 9. 关键决策记录（2026-06-25 / 2026-06-29 更新）

| 决策 | 选择 | 理由 |
|------|------|------|
| 集群架构模式 | 三级：节点→集群→联邦 | 渐进式扩展，每层独立可用 |
| 容器编排 | Docker Swarm | 轻量，Docker 原生，工厂可运维 |
| 不选 K8s | k3s 仍然太复杂 | 工厂 IT 无 K8s 能力，资源开销大 |
| 跨节点事件 | NATS | 轻量可靠，支持持久化和断网恢复 |
| 跨节点通信 | HTTP API（不跨节点 RPC） | 社区共识：HA/Grafana/Odoo 均不跨节点透明 RPC |
| 本地 RPC | UDS JSON-RPC over HTTP | ~20μs，HA 2026.02 已迁移到 UDS，curl 可调试 |
| 反向代理 | Traefik | Swarm 原生集成，自动服务发现 |
| App Store | 独立 Git 仓库 | 参考 Runtipi，支持第三方源 |
| 参考项目 | CasaOS + Runtipi + Dokploy | 架构 + 应用商店 + 多节点 |
| 平台后端 | Node.js + Hono | 与 MODACS 单节点技术栈一致（2026-06-29 更新） |

---

## 10. 文档体系

```
MODACS docs/ 目录文档体系：

MODACS-Overview.md（项目总览）
├── 项目愿景、痛点、技术选型、路线图、决策记录

MODACS-Naming.md（命名白皮书）
├── MODACS 命名历程、查重结论、系列产品命名

MODACS-Platform.md（单节点架构）
├── 多进程插件隔离、UDS JSON-RPC、工作流引擎、MCAP + Foxglove Bridge 可观测
└── 集群能力预留（scheduling 字段等在本文扩展）

MODACS-Cluster.md（本文，集群架构）
├── 三级架构：节点→集群→联邦
├── 集群管理：节点注册、套件调度、跨节点事件
├── 版本管理：兼容性检查、滚动升级、回滚
├── 参考开源项目：CasaOS / Runtipi / Dokploy
└── 渐进式计划：Phase 4 集群 / Phase 5 联邦

MODACS-Act.md（执行层产品）
├── MODACS Act 定位（PLC/CNC/DCS/SCADA）

MODACS-Link.md（通信中间件）
├── 通信抽象层设计

MODACS-Vision.md（视频产品）
├── MODACS Vision 套件的完整产品设计

MES-Development-Plan.md（MES 开发方案）
├── MES 套件的完整开发方案
```

---

*本文档与 [MODACS-Platform](./MODACS-Platform.md)、[MODACS-Overview](./MODACS-Overview.md) 互补。*
*单节点套件体系见 [MODACS-Platform](./MODACS-Platform.md)，项目总览见 [MODACS-Overview](./MODACS-Overview.md)。*
