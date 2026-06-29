# 开源平台架构对比分析：CasaOS / Runtipi / 1Panel / NocoBase / Odoo

> 本文深度拆解多个主流开源项目的架构，为 MODACS 平台开发提供具体可借鉴的设计模式。
>
> **⚠️ 架构转向说明**（2026-06-26）：
> MODACS 已从"群晖 DSM 式 Docker 套件"架构转向"Odoo 式进程内模块加载"架构。
> - 第 2-4 节（CasaOS/Runtipi/1Panel 分析）仍作为**事实性参考**保留，这些项目的桌面 UI、App Store、生命周期管理等模式仍有借鉴价值。
> - 第 5 节（MODACS 借鉴建议）已**完全重写**，反映新的 TS/Node.js/Hono + Odoo 模式技术栈。
> - 第 6 节（NocoBase + Odoo 分析）为**新增内容**，是当前架构的主要参考来源。
>
> 开发步骤见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md)，架构设计见 [MODACS-Platform](./MODACS-Platform.md)。

---

## 1. 总览对比

| 维度            | CasaOS                        | Runtipi                                      | 1Panel                        |
| ------------- | ----------------------------- | -------------------------------------------- | ----------------------------- |
| **定位**        | 家庭云 OS                        | 自托管应用平台                                      | 服务器管理面板                       |
| **Stars**     | ~34K                          | ~9.5K                                        | ~36K                          |
| **后端语言**      | Go                            | TypeScript (NestJS)                          | Go                            |
| **前端框架**      | Vue 3                         | React (React Router)                         | Vue 3 + Element Plus          |
| **Web 框架**    | Echo v4                       | NestJS (Express)                             | Gin                           |
| **数据库**       | SQLite (GORM)                 | PostgreSQL (Drizzle ORM)                     | SQLite (GORM)                 |
| **Docker 管理** | 独立服务 + Docker Compose         | Docker Compose CLI                           | Docker SDK + Compose CLI      |
| **反向代理**      | 自研 Gateway 服务                 | Traefik                                      | OpenResty (Nginx)             |
| **应用打包**      | docker-compose.yml + x-casaos | docker-compose.yml + config.json + x-runtipi | docker-compose.yml + data.yml |
| **应用商店**      | Git 仓库（可第三方）                  | Git 仓库（多源）                                   | 远程 API 同步                     |
| **实时通信**      | WebSocket + Socket.io         | SSE (Server-Sent Events)                     | WebSocket                     |
| **多节点**       | ❌                             | ❌                                            | ✅ Core/Agent（Pro 版）           |
| **前端嵌入**      | go:embed 到后端二进制               | ServeStaticModule 嵌入 NestJS                  | go:embed 到 Core 二进制           |
| **许可证**       | Apache 2.0                    | GPL v3                                       | GPL v3                        |

---

## 2. CasaOS 架构

### 2.1 核心设计：微服务 + 文件发现

CasaOS **不是单二进制**，而是拆分为多个协作服务，通过运行时目录中的 URL 文件互相发现：

```
┌──────────────────────────────────────────────────┐
│              CasaOS Gateway (:80)                 │
│         反向代理 / API 网关 / 静态文件             │
└──────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
 ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
 │ CasaOS   │ │ App    │ │ User   │ │MessageBus│
 │ Main     │ │ Manage │ │Service │ │          │
 │ (本仓库)  │ │ (独立)  │ │ (独立)  │ │ (独立)   │
 └──────────┘ └────────┘ └────────┘ └──────────┘

服务发现机制：
  /var/run/casaos/
  ├── management.url      ← Gateway 地址
  ├── app-management.url  ← 应用管理服务地址
  ├── message_bus.url     ← 消息总线地址
  └── user.url            ← 用户服务地址
  每个服务启动时写入自己的地址，其他服务读取连接。
```

### 2.2 仓库结构

```
CasaOS/
├── main.go                 # CasaOS Main 服务入口
├── service/                # 业务逻辑层（Repository 模式）
│   ├── service.go          # 服务注册中心（全局单例 MyService）
│   ├── system.go           # 硬件信息（gopsutil）
│   ├── file.go             # 文件管理
│   ├── storage.go          # 磁盘/存储管理
│   ├── socket.go           # WebSocket 实时推送
│   ├── connections.go      # Samba 连接管理
│   ├── notify.go           # 通知系统
│   └── health.go           # 健康检查
├── route/                  # HTTP 路由（v1/v2/v3 三版本）
├── model/                  # 数据模型
├── pkg/                    # 可复用包
│   ├── config/             # 配置管理（INI 格式）
│   ├── sqlite/             # SQLite 初始化（pure-Go，无 CGO）
│   ├── cache/              # 内存缓存
│   └── utils/              # 工具函数
├── UI/                     # Vue 前端（git submodule）
├── codegen/                # OpenAPI 自动生成代码
└── build/                  # 构建脚本 + 打包
```

### 2.3 服务层：Repository 模式

```go
// service/service.go — 全局服务注册中心
type Repository interface {
    Casa() CasaService
    Gateway() external.ManagementService   // 网关路由管理
    Health() HealthService
    Notify() NotifyServer                  // 通知（GORM 持久化）
    System() SystemService                 // 硬件/系统配置
    Storage() StorageService               // 存储管理
    MessageBus() *message_bus.ClientWithResponses  // 事件总线客户端
    // ...
}

// main.go:78 — 全局单例
service.MyService = service.NewService(db)
```

**关键设计**：
- `MyService` 是全局单例，在 `main()` 中初始化
- 需要持久化的服务接收 `*gorm.DB`，无状态服务不接收
- `Gateway()` 和 `MessageBus()` 是跨服务 HTTP 客户端，不含业务逻辑

### 2.4 Docker 集成方式

**CasaOS Main 本身不直接操作 Docker**。Docker 操作在独立的 App Management 服务中：

```
CasaOS Main  --HTTP-->  App Management Service  --Docker Compose-->  容器
                           │
                           ├── docker-compose up -d
                           ├── docker-compose down
                           └── 容器状态查询
```

App Management 通过 HTTP API 对外提供服务：
- `GET /v2/app_management/store` — 浏览应用商店
- `POST /v2/app_management/compose` — 安装应用
- `PUT /v2/app_management/compose/{id}/status` — 启停应用

### 2.5 应用商店格式

**Git 仓库**，每个应用一个目录：

```
CasaOS-AppStore/
├── Apps/
│   ├── Jellyfin/
│   │   ├── docker-compose.yml    # 标准 Compose + x-casaos 扩展
│   │   ├── icon.svg
│   │   └── screenshot-1.png
│   ├── Nextcloud/
│   │   └── ...
├── store-config.json              # 商店配置
├── category-list.json             # 分类
└── featured-apps.json             # 推荐
```

**x-casaos 扩展字段**：

```yaml
# docker-compose.yml
x-casaos:
  architectures: [amd64, arm64]
  main: jellyfin                    # 主服务名
  category: Media
  title: { en_US: Jellyfin }
  description: { en_US: "..." }
  icon: https://cdn.jsdelivr.net/.../icon.svg
  port_map: "8097"                  # Web UI 端口
  index: /                          # Web UI 路径
  version: "10.11.10"

services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    x-casaos:
      envs:
        - container: TZ
          description: { en_US: TimeZone }
      ports:
        - container: "8096"
          description: { en_US: WebUI HTTP Port }
      volumes:
        - container: /config
          description: { en_US: Config directory }
```

**运行时变量**：`$PUID`、`$PGID`、`$TZ`、`$AppID` 在安装时自动替换。

### 2.6 应用安装流程

```
1. UI 请求 App Management：GET /v2/app_management/store
2. 用户选择应用，填写端口/环境变量
3. UI 发送：POST /v2/app_management/compose { appId, config }
4. App Management 服务：
   a. 从 Git 仓库获取 docker-compose.yml
   b. 替换运行时变量（$AppID, $PUID, $TZ）
   c. 创建数据目录 /DATA/AppData/$AppID/
   d. 写入处理后的 compose 文件
   e. 执行 docker-compose up -d
5. 注册路由到 Gateway：/{appId}/ → 容器端口
6. MessageBus 发出事件，UI 更新状态
```

### 2.7 关键特征总结

| 特征 | 设计 |
|------|------|
| 架构风格 | 微服务，文件发现 |
| 服务拆分 | Gateway / Main / AppManage / UserBus / MessageBus |
| 前端嵌入 | go:embed 到 Gateway 二进制 |
| 认证 | JWT（ECDSA 签名，来自 User Service） |
| API 版本 | v1/v2/v3 共存，自定义多路复用器路由 |
| 硬件监控 | gopsutil，每 5s WebSocket 推送 |
| 第三方商店 | ✅ 支持添加第三方 Git 仓库 |

---

## 3. Runtipi 架构

### 3.1 核心设计：NestJS 单体 + 队列异步

Runtipi 是 **Turborepo monorepo**，后端为 NestJS 单体应用，通过 RabbitMQ 队列处理异步生命周期操作：

```
┌──────────────────────────────────────────────────────┐
│                    浏览器                              │
│               (React SPA, 嵌入后端)                    │
└────────────────────┬─────────────────────────────────┘
                     │ REST + SSE
                     ▼
┌──────────────────────────────────────────────────────┐
│              Runtipi 后端 (NestJS, :3000)              │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │ Auth    │  │ Apps     │  │ App Lifecycle     │   │
│  │ Module  │  │ Module   │  │ Module            │   │
│  └─────────┘  └──────────┘  └────────┬──────────┘   │
│                                      │ publish       │
│                              ┌───────▼────────┐      │
│                              │ App Events     │      │
│                              │ Queue (RabbitMQ)│      │
│                              └───────┬────────┘      │
│                                      │ consume       │
│                              ┌───────▼────────┐      │
│                              │ Worker (同进程) │      │
│                              │ - Command 模式  │      │
│                              │ - Mutex 锁      │      │
│                              │ - Docker Compose│      │
│                              └────────────────┘      │
└──────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌────────────────┐          ┌────────────────┐
│ PostgreSQL 14  │          │    Traefik     │
│ (app/user/     │          │  (:80/:443)    │
│  store/link)   │          │  Docker Label  │
└────────────────┘          │  自动路由       │
                            └────────────────┘
```

### 3.2 仓库结构

```
runtipi/
├── packages/
│   ├── backend/               # NestJS 后端（主体）
│   │   └── src/
│   │       ├── main.ts        # 入口
│   │       ├── app.module.ts  # 模块注册
│   │       ├── core/          # 基础设施模块
│   │       │   ├── config/    # 配置
│   │       │   ├── database/  # Drizzle ORM + PG
│   │       │   ├── sse/       # 实时推送
│   │       │   ├── logger/    # 日志
│   │       │   └── health/    # 健康检查
│   │       └── modules/       # 业务模块
│   │           ├── auth/      # 认证（session/JWT/TOTP）
│   │           ├── apps/      # 应用 CRUD
│   │           ├── app-lifecycle/  # ★ 核心：安装/卸载/升级引擎
│   │           ├── app-stores/    # 应用商店 Git 管理
│   │           ├── docker/        # Docker API 客户端
│   │           ├── network/       # 子网管理
│   │           ├── queue/         # RabbitMQ 队列
│   │           └── backups/      # 备份恢复
│   ├── frontend/              # React SPA
│   └── common/                # 共享类型 + ArkType schemas
├── docker-compose.prod.yml    # 生产编排
├── Dockerfile                 # 构建后端+前端
└── runtipi-cli                # 独立 CLI 二进制
```

### 3.3 应用生命周期引擎（核心）

这是 Runtipi 最值得借鉴的部分——**Command 模式 + 队列异步 + Mutex 锁**：

```
                    API 请求
                       │
                       ▼
              ┌────────────────┐
              │ InstallAppHandler│  ← 同步部分
              │ 1. 校验请求      │
              │ 2. 写 DB (installing)
              │ 3. 生成 requestId│
              │ 4. publish 队列  │ → 立即返回 { requestId }
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  RabbitMQ Queue │  ← 异步解耦
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────────┐
              │ AppLifecycleService │  ← Worker 消费
              │ 1. 获取 Mutex 锁    │  (同应用 URN 串行)
              │ 2. Factory 创建命令 │
              │ 3. 执行 Command    │
              │ 4. 返回结果        │
              └───────┬────────────┘
                      │
                      ▼
              ┌────────────────────┐
              │ InstallAppCommand   │  ← 具体命令
              │ 1. 生成环境变量     │
              │ 2. 复制应用到安装目录│
              │ 3. 处理 docker-compose│
              │    (变量替换+架构覆盖)│
              │ 4. 生成 Traefik labels│
              │ 5. docker compose up │
              └────────────────────┘
                      │
                      ▼
              ┌────────────────────┐
              │ SSE 事件推送        │
              │ install_success /  │
              │ install_error      │
              └────────────────────┘
```

**命令类型**：`start | stop | install | uninstall | reset | restart | generate_env | backup | update | restore`

**Mutex 机制**：每个应用 URN 一把异步锁，防止对同一应用并发操作。

### 3.4 应用商店与格式

**Git 仓库克隆到本地**，支持多源：

```
runtipi/
├── repos/
│   ├── migrated/              # 官方商店（slug: migrated）
│   │   └── apps/
│   │       ├── hello-world/
│   │       │   ├── config.json          # 应用元数据
│   │       │   ├── docker-compose.yml   # 容器定义 + x-runtipi
│   │       │   └── metadata/
│   │       │       └── logo.jpg
│   │       └── nextcloud/
│   │           └── ...
│   └── my-custom-store/       # 第三方商店
│       └── apps/
│           └── ...
```

**config.json 字段**：

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "latest",
  "tipi_version": 6,
  "categories": ["utilities"],
  "description": "...",
  "short_desc": "...",
  "author": "crccheck",
  "source": "https://github.com/...",
  "port": 8000,
  "available": true,
  "exposable": true,
  "dynamic_config": true,
  "min_tipi_version": "4.5.0",
  "supported_architectures": ["amd64"],
  "form_fields": [
    {
      "type": "text",
      "label": "Admin Username",
      "env_variable": "ADMIN_USER",
      "required": true
    }
  ]
}
```

**docker-compose.yml + x-runtipi**：

```yaml
x-runtipi:
  schema_version: 2

services:
  app:
    image: myapp:latest
    x-runtipi:
      is_main: true              # 主服务，自动获得 Traefik 路由
      internal_port: 8080        # Traefik 路由到的内部端口
      add_to_main_network: true  # 加入共享网络（跨应用通信）
```

### 3.5 Traefik 集成

**Docker Provider 自动发现**——不需要手写路由配置：

```
Runtipi 启动 → 生成 docker-compose.generated.yml
  → 包含自动生成的 Traefik labels
  → docker compose up
  → Traefik 扫描 Docker 容器 labels
  → 自动创建路由 + TLS 证书

每个应用自动生成：
  ├── HTTP → HTTPS 重定向
  ├── 互联网域名路由（{app}.{domain}）
  ├── 本地域名路由（{app}.{local_domain}）
  └── Forward Auth 中间件（转发到 /api/auth/traefik 验证登录）
```

### 3.6 数据库 Schema（PostgreSQL）

仅 4 张表，极其精简：

```
app              → 安装的套件实例（状态/版本/端口/域名/配置）
app_store        → 应用商店源（slug/URL/分支/hash）
user             → 用户（用户名/密码/TOTP/角色）
link             → 仪表盘快捷链接
```

### 3.7 运行时目录结构

```
runtipi/
├── app-data/             # 套件持久化数据
│   └── {store}/{app}/
├── apps/                 # 已安装的套件定义
│   └── {store}/{app}/
│       ├── config.json
│       ├── docker-compose.yml
│       └── docker-compose.generated.yml  # 处理后生成的
├── repos/                # 克隆的应用商店仓库
├── backups/              # 套件备份
├── state/                # 实例状态
│   └── settings.json
├── traefik/              # Traefik 配置
├── user-config/          # 用户覆盖配置
├── logs/
├── media/                # 共享媒体目录
└── .env                  # 运行时环境变量
```

### 3.8 关键特征总结

| 特征 | 设计 |
|------|------|
| 架构风格 | NestJS 单体 + RabbitMQ 异步队列 |
| 生命周期管理 | Command 模式 + Factory + Mutex 锁 |
| 实时通信 | SSE（非 WebSocket），RxJS Subject 管理 |
| Traefik 集成 | Docker Provider + 自动 labels |
| 认证 | Session + Forward Auth（Traefik 中间件） |
| 应用标识 | URN 格式：`{appId}:{storeSlug}` |
| 用户覆盖 | user-config/ 目录支持自定义 compose |
| CLI | 独立二进制 `runtipi-cli`，运行在宿主机 |

---

## 4. 1Panel 架构

### 4.1 核心设计：Core/Agent 主从模式

1Panel v2 最重要的架构演进是 **Core + Agent 分离**：

```
┌─────────┐     HTTP/HTTPS      ┌───────────┐    Unix Socket    ┌──────────┐
│ 浏览器   │ ──────────────────→ │   Core    │ ───────────────→ │  Agent   │
│         │   /api/v2/*         │ (1panel-  │  /etc/1panel/    │ (master) │
│         │  CurrentNode header │  core)    │  agent.sock      │          │
└─────────┘                     └─────┬─────┘                  └──────────┘
                                      │
                                      │ HTTPS + mTLS
                                      │ (客户端证书)
                                      ▼
                                ┌──────────┐
                                │  Agent   │  (远程节点)
                                │ (1panel- │
                                │  agent)  │
                                └──────────┘
```

**职责分离**：

| 组件 | 职责 | 服务数 |
|------|------|--------|
| **Core** | 认证、UI 服务、请求代理、设置、日志 | 9 个 service |
| **Agent** | Docker、应用、网站、数据库、文件、防火墙、监控 | 80+ 个 service |

### 4.2 仓库结构

```
1Panel/
├── core/                    # Go 模块：管理平面
│   ├── cmd/server/
│   │   ├── main.go          # Core 入口
│   │   └── web/             # 嵌入的前端静态文件
│   ├── app/
│   │   ├── api/v2/          # Gin HTTP handlers
│   │   ├── service/         # 业务逻辑（9 个文件）
│   │   │   ├── auth.go      # 登录/MFA/Passkey/API Key
│   │   │   ├── setting.go   # 系统设置
│   │   │   ├── upgrade.go   # 面板升级
│   │   │   └── ...
│   │   └── dto/             # 数据传输对象
│   ├── init/
│   │   ├── proxy/           # ★ 代理到 Agent（Unix socket / mTLS）
│   │   └── router/          # 路由 + 代理中间件
│   └── utils/xpack/         # Pro 版功能（build tags 控制）
│
├── agent/                   # Go 模块：节点工作器
│   ├── cmd/server/
│   │   └── main.go          # Agent 入口
│   ├── app/
│   │   ├── api/v2/          # Gin HTTP handlers
│   │   ├── service/         # 业务逻辑（80+ 个文件）
│   │   │   ├── app.go           # 应用目录/搜索/详情 (30K)
│   │   │   ├── app_install.go   # 已安装应用 CRUD (30K)
│   │   │   ├── app_utils.go     # 安装/升级/卸载逻辑 (74K)
│   │   │   ├── container.go     # 容器生命周期 (66K)
│   │   │   ├── website.go       # 网站管理 (73K)
│   │   │   ├── nginx.go         # OpenResty 管理 (13K)
│   │   │   └── ...
│   │   ├── model/           # GORM 模型
│   │   ├── repo/            # 数据访问层
│   │   ├── dto/             # 传输对象
│   │   └── task/            # 异步任务系统
│   ├── utils/
│   │   ├── docker/          # Docker SDK 封装
│   │   ├── compose/         # Compose CLI 封装
│   │   ├── nginx/           # ★ 自研 Nginx 配置 AST 解析器
│   │   └── cloud_storage/   # S3/OSS/COS/MinIO 抽象
│   └── utils/xpack/         # Pro 版功能
│
├── frontend/                # Vue 3 SPA
│   ├── src/
│   │   ├── api/modules/     # 22 个 API 模块
│   │   ├── views/           # 页面（app-store/container/website/...）
│   │   └── stores/          # Pinia 状态管理
│   └── package.json
└── Makefile                 # 构建两个二进制 + 前端
```

### 4.3 Docker 管理：SDK + CLI 双轨

1Panel 同时使用两种方式操作 Docker：

```
Docker SDK (github.com/docker/docker)
├── 容器操作：创建/启动/停止/删除/日志
├── 镜像操作：拉取/删除/列表
├── 网络操作：创建/删除
├── 卷操作：创建/删除
└── 镜像拉取进度流（JSON 解析，实时 UI 反馈）

Docker Compose CLI (docker compose v2)
├── Up()     → docker compose up -d
├── Down()   → docker compose down
├── Stop()   → docker compose stop
├── Restart()→ docker compose restart
├── DownAndUp()→ 重新部署
└── 20 分钟超时
```

**流程**：先通过 SDK 预拉取镜像（带进度），再通过 Compose CLI 启动。

### 4.4 应用安装流程

```
1. UI 请求：POST /apps/install { key, name, params, advanced }
2. Agent service:
   a. 确保 1panel-network 存在
   b. 校验：名称唯一、端口可用、应用实例数限制
   c. 获取 AppDetail（版本特定 compose 模板 + 参数定义）
   d. 解析 compose YAML → map
   e. 注入公共参数（网络、端口）
   f. 重新序列化为 YAML
   g. 写 DB（AppInstall 记录，状态：Installing）
   h. 创建异步任务：
      ├── copyData()：下载/解压/复制应用文件
      ├── 写 .env + docker-compose.yml 到安装目录
      ├── runScript("init")：执行 init.sh
      ├── Docker SDK 拉取镜像（进度流）
      └── compose.Up()：docker compose up -d
   i. 更新状态为 Running
3. WebSocket 推送进度
```

### 4.5 应用打包格式

```
{appKey}/{version}/
├── docker-compose.yml    # Compose 模板（带环境变量占位符）
├── data.yml              # 动态表单定义（参数/端口/环境变量）
├── .env                  # 默认环境变量
├── scripts/
│   ├── init.sh           # 安装后脚本
│   ├── upgrade.sh        # 升级后脚本
│   └── uninstall.sh      # 卸载前脚本
├── config/               # 配置文件模板
└── icon.png
```

### 4.6 异步任务系统

```
task.db (独立 SQLite)
┌──────────────────────────────────────────────┐
│ tasks 表                                      │
├──────────┬──────────┬──────────┬─────────────┤
│ name     │ type     │ scope    │ status      │
├──────────┼──────────┼──────────┼─────────────┤
│ install  │ TaskInstall│TaskScopeApp│ pending   │
│ upgrade  │ TaskUpgrade│TaskScopeApp│ running   │
│ backup   │ TaskBackup │TaskScopeApp│ success   │
└──────────┴──────────┴──────────┴─────────────┘

每个任务：
├── 日志文件（磁盘，流式写入）
├── 关联记录 ID（appInstall.ID）
├── context.CancelFunc（可取消）
└── WebSocket 推送进度
```

### 4.7 Nginx 配置管理（自研 AST 解析器）

1Panel 最独特的设计——**完整的 Nginx 配置语法分析器**：

```
agent/utils/nginx/
├── parser/
│   ├── lexer.go        # 词法分析器（tokenizer）
│   ├── parser.go       # 递归下降解析器
│   └── flag/           # Token 类型
├── components/
│   ├── block.go        # 块 AST 节点
│   ├── config.go       # 配置根
│   ├── directive.go    # 指令 AST 节点
│   ├── http.go         # http {} 块
│   ├── server.go       # server {} 块 (13K)
│   ├── location.go     # location {} 块 (11K)
│   ├── upstream.go     # upstream {} 块
│   └── lua_block.go    # Lua 块支持
└── dumper.go           # AST → Nginx 配置文本

能力：解析 → 修改 AST → 重新生成配置文本
用途：程序化管理网站反向代理、负载均衡、WAF 规则
```

### 4.8 多节点架构（Pro 版）

通过 **Go build tags** 控制版本：

```go
//go:build !xpack && !enterprise    // 社区版（开源）
//go:build xpack                     // Pro 版
//go:build enterprise                 // 企业版
```

**Provider 模式**：

```
社区版：community.go  → 空实现（no-op）
Pro 版：providers/     → 真实实现

MultiNodeProvider 接口：
├── Proxy(c *gin.Context, node)     → 代理到远程 Agent
├── ValidateCertificate(c)          → mTLS 证书验证
├── Sync(dataType)                  → 跨节点数据同步
├── LoadNodeInfo(node)              → 节点信息
└── PushSSLToNode(ssl)              → 推送 SSL 证书
```

### 4.9 关键特征总结

| 特征 | 设计 |
|------|------|
| 架构风格 | Core/Agent 主从（v2 演进） |
| 通信 | 本地：Unix socket；远程：mTLS HTTPS |
| Docker 管理 | SDK + Compose CLI 双轨 |
| 反向代理 | OpenResty + 自研 Nginx AST 解析器 |
| 异步任务 | 独立 task.db + 日志文件 + WebSocket |
| 应用表单 | data.yml 动态表单定义 |
| 版本控制 | Go build tags（community/pro/enterprise） |
| 数据库 | 多 SQLite（core.db/agent.db/task.db/monitor.db） |
| 安全 | Session + MFA + Passkey + CSRF + IP 白名单 |

---

## 5. 横向对比与 MODACS 借鉴建议（已更新 v4.0）

> **架构转向说明**：MODACS 已从 DSM 式 Docker 套件转向 Odoo 式进程内模块加载。
> 以下建议已更新为 TS/Node.js/Hono 技术栈视角。

### 5.1 架构模式对比

```
CasaOS:  微服务 + 文件发现 + Docker 套件
         MODACS 借鉴：桌面 UI 交互模式（可选桌面窗口模式）

Runtipi: 单体 + 队列异步 + Traefik + Docker 套件
         MODACS 借鉴：App Store Git 仓库模式、生命周期 Command 模式

1Panel:  Core/Agent 主从 + Docker 管理
         MODACS 借鉴：多节点架构（Phase 5+ 集群参考）

NocoBase: Koa 单体 + Sequelize + Formily + 插件系统
          MODACS 借鉴：6 大核心概念（插件生命周期、Resource Manager、Field Interface、ACL、两阶段加载、Event Bus）

Odoo:    Python 单体 + ORM + OWL + addon 模块
         MODACS 借鉴：进程内模块加载模式、模块依赖声明、auto_install
```

### 5.2 MODACS 推荐借鉴（v4.0 更新）

| 能力 | 推荐借鉴 | 来源 | 理由 |
|------|---------|------|------|
| **整体架构** | 进程内模块加载 | Odoo / NocoBase | MES/ERP/OA 紧耦合，进程内调用比跨容器高效 |
| **插件生命周期** | afterAdd→beforeLoad→load→install→upgrade→beforeUninstall | NocoBase | 完整的模块安装/加载/卸载流程 |
| **两阶段加载** | Phase 1 全部 beforeLoad → Phase 2 拓扑排序 load | NocoBase (@hapi/topo) | 解决模块间依赖顺序 |
| **CRUD 自动生成** | Collection 定义 → REST API | NocoBase Resource Manager | 不需要手写路由 |
| **字段语义类型** | Field Interface → DB + Zod + React | NocoBase | 一处定义三层打通 |
| **权限控制** | 策略模板 + 运行时过滤 + 字段级 | NocoBase ACL | 灵活且不侵入业务代码 |
| **模块依赖** | depends / auto_install | Odoo | 声明式依赖管理 |
| **manifest 格式** | 融合 Odoo+NocoBase+Grafana+Strapi+DSM | 多家融合 | 取各家之长 |
| **桌面 UI** | 桌面窗口 + 任务栏 | CasaOS / 群晖 DSM | 可选桌面模式（车间触屏） |
| **App Store** | Git 仓库 + 多源 | Runtipi / CasaOS | Git PR = 模块提交 |
| **生命周期脚本** | pre/post install/upgrade/uninstall | DSM / 飞牛 fnOS | 兼容隔离模块 |
| **容器隔离** | Podman（daemonless） | 无直接来源 | 仅 Vision/Act 使用，按需启动 |
| **单文件部署** | esbuild --bundle --platform=node | Bun --compile | 零依赖部署 |
| **前端嵌入** | esbuild bundle + node 二进制 | CasaOS (go:embed) | 单文件部署 |
| **多节点** | 预留 Core/Agent | 1Panel | Phase 5+ 集群参考 |

### 5.3 不建议借鉴的设计

| 设计 | 来源 | 不推荐原因 |
|------|------|-----------|
| Docker 套件作为默认模块方式 | CasaOS/Runtipi | MES/ERP/OA 紧耦合，容器隔离增加复杂度 |
| 微服务 + 文件发现 | CasaOS | 初期太复杂 |
| Traefik 外部代理 | Runtipi | Hono proxy 内置即可，不需要额外依赖 |
| Redis Pub/Sub 事件总线 | 旧 MODACS 设计 | EventEmitter 进程内异步足够 |
| 自研 Nginx AST 解析器 | 1Panel | 工作量巨大，不需要 |
| PostgreSQL + RabbitMQ | Runtipi | 依赖太重 |
| NocoBase fork | NocoBase | 70% 代码不需要，3 个核心绑定不可接受 |
| Formily 表单引擎 | NocoBase | 过重，用 React + Zod 替代 |
| OWL 框架 | Odoo | 技术栈老旧，用 React 19 替代 |

### 5.4 MODACS 最终架构（v4.0）

```
┌──────────────────────────────────────────────────────────────┐
│                        用户界面层                             │
│                                                              │
│  Layout Provider：桌面窗口模式 ←→ Admin 面板模式（一键切换）   │
│  Module Renderer：模块页面组件（模式无关）                     │
│  React 19 + TanStack Router + Tailwind + Zustand            │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────┐
│                MODACS 平台核心 (Node.js + Hono)                   │
│                                                              │
│  PluginManager | ResourceManager | ACL | EventBus | Auth     │
│  FieldInterface | PodmanProxy | CollectionRegistry          │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────┐
│                        模块层                                 │
│                                                              │
│  进程内模块（动态加载，共享 PG）：                              │
│  MES | ERP | OA | 排班 | base                                │
│                                                              │
│  Podman 隔离模块（独立容器，HTTP 通信）：                      │
│  MODACS Vision (GPU) | MODACS Act (实时控制)                 │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────┐
│              PostgreSQL（共享，schema 隔离）                  │
└──────────────────────────────────────────────────────────────┘
```

**核心设计决策**：

| 决策 | 选择 | 对标 | 理由 |
|------|------|------|------|
| 后端 | TypeScript + Node.js + Hono | NocoBase (TS+Koa) | 全栈类型安全，esbuild 单文件 |
| ORM | Drizzle | NocoBase (Sequelize) | TS 原生类型安全，零运行时 |
| 数据库 | PostgreSQL | NocoBase / Runtipi | 共享 DB，schema 隔离 |
| 模块加载 | 进程内动态加载 | Odoo / NocoBase | 紧耦合业务模块高效通信 |
| 容器隔离 | Podman（可选） | 无直接对标 | daemonless，仅 Vision/Act |
| 前端 | React 19 + TanStack Router | Runtipi (React) | 动态路由注册 |
| 前端嵌入 | esbuild bundle + node 二进制 | CasaOS (go:embed) | 单文件部署 |
| 反向代理 | Hono proxy（内置） | — | 不需要 Traefik |
| 事件总线 | EventEmitter | NocoBase | 进程内异步足够 |
| 模块包格式 | manifest.yaml | Odoo+NocoBase+DSM 融合 | 取各家之长 |
| 认证 | JWT | Runtipi / CasaOS | 平台管认证，模块管权限 |
| 多节点 | 预留 Core/Agent | 1Panel | Phase 5+ 集群参考 |

---

## 6. NocoBase 核心概念深度分析（新增）

> NocoBase 是 MODACS 当前架构的**主要参考来源**。以下是其 6 大核心概念的分析，
> MODACS 借鉴这些概念但用 Hono + Drizzle + React 重新实现。

### 6.1 插件生命周期

NocoBase 定义了完整的插件生命周期，MODACS 直接借鉴：

```
afterAdd → beforeLoad → load → install → upgrade → beforeUninstall

afterAdd:        插件代码加载到进程，注册到 PluginManager
beforeLoad:      声明依赖、注册 Collection、声明事件（此时不能访问其他插件的服务）
load:            注册路由、菜单、Field Interface（此时可以访问依赖插件的服务）
install:         首次安装：数据库迁移、默认数据、权限初始化
upgrade:         版本升级：增量迁移
beforeUninstall: 卸载前清理
```

### 6.2 两阶段加载

```
Phase 1：所有插件同时执行 beforeLoad
         → 此时各插件只声明自己的 Collection 和事件，不依赖其他插件
         → 确保所有 Collection 定义都已就绪

Phase 2：拓扑排序后按依赖顺序执行 load
         → 使用 @hapi/topo 按 depends 字段排序
         → 后加载的插件可以访问先加载插件的服务
         → 例如：MES depends ERP，则 ERP.load() 先于 MES.load() 执行
```

### 6.3 Resource Manager

```
定义 Collection（数据模型）→ 自动生成 CRUD API

Collection 定义：
  app.collection({
    name: 'mes_work_orders',
    fields: [
      { type: 'string', name: 'order_number', required: true },
      { type: 'enum', name: 'status', values: ['draft', 'confirmed', 'done'] },
    ],
  })

自动生成的 API：
  GET    /api/mes_work_orders:list        列表（分页/筛选/排序）
  GET    /api/mes_work_orders:get         详情
  POST   /api/mes_work_orders:create      创建
  PUT    /api/mes_work_orders:update      更新
  DELETE /api/mes_work_orders:destroy     删除
```

**MODACS 差异**：用 Drizzle 替代 Sequelize 实现 Collection → DB 映射。

### 6.4 Field Interface

```
语义类型 → DB 列 + Zod 校验 + React 组件

注册 Field Interface：
  app.fieldInterface.register('money', {
    column: { type: 'decimal', precision: 12, scale: 2 },
    validate: z.number().nonnegative(),
    editor: MoneyInput,
    viewer: MoneyDisplay,
  })

在 Collection 中使用：
  app.collection({
    name: 'orders',
    fields: [{ type: 'money', name: 'total_amount' }],
  })

效果：
  - DB 层：自动创建 decimal(12,2) 列
  - API 层：自动用 Zod 校验输入
  - 前端层：自动用 MoneyInput 编辑、MoneyDisplay 展示
```

**MODACS 差异**：用 Zod 替代 Formily 做校验，用 React 组件替代 Formily Schema。

### 6.5 ACL

```
策略模板 + 运行时过滤注入 + 字段级权限

定义角色策略：
  app.acl.defineRole('shop_floor_worker', {
    'mes_work_orders': {
      strategy: 'own',           // 只看自己创建的
      actions: ['list', 'get', 'update'],
      fields: { exclude: ['cost'] },  // 不能看成本
    },
  })

运行时效果：
  - worker 查询工单 → SQL 自动加 WHERE created_by = <current_user>
  - worker 查看工单详情 → cost 字段自动过滤掉
  - worker 尝试删除 → 403 Forbidden
```

内置策略模板：`all` / `own` / `readonly` / `department`

### 6.6 为什么不直接 fork NocoBase

| 原因 | 详情 |
|------|------|
| 70% 代码不需要 | NocoBase 包含大量无代码 UI Builder、工作流设计器等，MODACS 不需要 |
| Sequelize 绑定 | NocoBase 深度绑定 Sequelize ORM，MODACS 用 Drizzle |
| Formily 绑定 | NocoBase 前端深度绑定 Formily，MODACS 用 React + Zod |
| Koa 绑定 | NocoBase 后端用 Koa，MODACS 用 Hono（@hono/node-server） |
| 重新实现成本 < 适配成本 | 6 个概念的核心逻辑不复杂，重新实现比适配 NocoBase 的绑定更容易 |

---

## 7. 各项目关键源码索引

### CasaOS

| 文件/目录 | 内容 | 参考价值 |
|-----------|------|---------|
| `service/service.go` | 服务注册中心（Repository 模式） | ⭐⭐⭐ 服务组织方式 |
| `route/v1.go` | Echo 路由 + 中间件 | ⭐⭐ 路由组织 |
| `UI/` | Vue 桌面式前端 | ⭐⭐⭐⭐ 桌面 UI 交互参考 |
| `CasaOS-AppStore/` | 应用商店 Git 仓库 | ⭐⭐⭐⭐ App Store 格式 |

### Runtipi

| 文件/目录 | 内容 | 参考价值 |
|-----------|------|---------|
| `packages/backend/src/modules/app-lifecycle/` | 应用生命周期引擎 | ⭐⭐⭐⭐ 生命周期管理 |
| `packages/backend/src/modules/app-stores/` | 应用商店 Git 管理 | ⭐⭐⭐⭐ |
| `packages/backend/src/core/database/schema.ts` | 数据库 Schema | ⭐⭐⭐ 极简设计 |
| `runtipi-appstore/apps/hello-world/` | 应用示例 | ⭐⭐⭐⭐ 应用格式 |

### 1Panel

| 文件/目录 | 内容 | 参考价值 |
|-----------|------|---------|
| `core/init/proxy/proxy.go` | Core→Agent 代理 | ⭐⭐⭐⭐ 多节点通信参考 |
| `agent/app/service/app_utils.go` | 安装/升级/卸载逻辑 | ⭐⭐⭐⭐ 生命周期参考 |
| `agent/app/task/task.go` | 异步任务系统 | ⭐⭐⭐ |

### NocoBase

| 文件/目录 | 内容 | 参考价值 |
|-----------|------|---------|
| `packages/core/server/src/plugin-manager/` | 插件管理器 + 生命周期 | ⭐⭐⭐⭐⭐ 最核心 |
| `packages/core/server/src/resourcer/` | Resource Manager | ⭐⭐⭐⭐⭐ CRUD 自动生成 |
| `packages/core/server/src/acl/` | ACL 实现 | ⭐⭐⭐⭐⭐ 权限设计 |
| `packages/core/server/src/collections/` | Collection 定义 | ⭐⭐⭐⭐ 数据模型 |
| `packages/core/client/src/schema-component/` | Formily 前端组件 | ⭐⭐ 前端模式参考（不用 Formily） |

---

## 8. n8n / Dify / Coze 架构分析（新增）

> 这三个项目是 MODACS **工作流引擎**的主要参考来源。
> MODACS 不需要 AI/LLM 能力，但工作流编排、DAG 执行、中断恢复等设计模式直接可借鉴。

### 8.1 总览对比

| 维度 | n8n | Dify | Coze（扣子） |
|------|-----|------|-------------|
| **定位** | 工作流自动化平台 | LLM 应用开发平台 | AI Bot/Agent 开发平台 |
| **后端语言** | **TypeScript** | Python (Flask) | Go (Eino 框架) |
| **前端** | Vue 3 | React | — |
| **许可证** | ⚠️ Fair-code（Sustainable Use License） | Apache 2.0 | 闭源 |
| **开源** | 源码可见，非 OSI 开源 | ✅ 完全开源 | ❌ |
| **Stars** | ~194K | ~80K+ | — |
| **与 MODACS 技术栈契合度** | ⭐⭐⭐⭐⭐ TS 全栈 | ⭐⭐⭐ 前端 TS | ⭐⭐ Go |
| **MODACS 借鉴度** | ⭐⭐⭐⭐⭐ DAG 执行器 | ⭐⭐⭐⭐ DSL + 插件分类 | ⭐⭐⭐⭐ 中断恢复 |

### 8.2 n8n 架构

#### 核心设计：WorkflowExecute 类

n8n 的工作流引擎核心是 `WorkflowExecute` 类（`packages/core/src/execution-engine/workflow-execute.ts`），约 1250 行 TypeScript：

```
执行流程：
run()
  → 初始化 nodeExecutionStack（起始节点入栈）
  → processRunExecutionData() 主循环：
      ├── 弹出栈顶节点
      ├── 检查输入是否就绪（多输入合并）
      │   └── 未就绪 → 存入 waitingExecution，等上游到齐
      ├── 执行节点 execute()
      │   ├── 触发 nodeExecuteBefore 钩子
      │   ├── 求值表达式参数（{{ $json.field }}）
      │   ├── 执行节点逻辑
      │   └── 触发 nodeExecuteAfter 钩子
      ├── 记录执行结果到 runData
      └── 将输出路由到下游节点（入栈）
  → 栈空 → 返回 IRun 结果
```

#### 关键设计

| 设计 | 说明 | MODACS 借鉴 |
|------|------|------------|
| **栈 + 等待队列** | nodeExecutionStack（待执行）+ waitingExecution（输入未就绪） | ✅ DAG 执行器核心 |
| **多输入合并** | Merge 节点等所有上游到齐才执行 | ✅ merge 节点类型 |
| **部分执行** | `runPartialWorkflow2` 从任意节点开始（编辑器调试） | ✅ 工作流调试 |
| **执行恢复** | `ExecutionRecoveryService` 进程崩溃后恢复 | ✅ 长流程容错 |
| **节点类型分类** | Trigger / Action / Core / Cluster | ✅ 节点类型设计参考 |
| **双模式执行** | Regular（单进程）+ Queue（Redis + BullMQ） | ❌ 不需要 Queue Mode |
| **表达式沙箱** | `{{ $json.field }}` 沙箱求值 | ❌ 用 TS 直接写逻辑 |
| **400+ 集成节点** | Slack/Google/HTTP/DB... | ❌ MODACS 不是集成平台 |

#### 许可证注意

n8n 使用 **Sustainable Use License**（Fair-code），不是 OSI 开源许可证。
- ✅ 可以借鉴公开的架构设计模式
- ❌ 不能直接复制代码
- MODACS 需参考其设计重新实现

### 8.3 Dify 架构

#### 核心设计：工作流 DSL + 插件分类

Dify v1.0 的两个关键设计对 MODACS 有参考价值：

**1. 六种插件类型分类法**：

| Dify 插件类型 | 作用 | MODACS 对应 |
|--------------|------|------------|
| Model | LLM 提供商适配 | 未来 AI 模块 |
| Tool | 外部 API 调用 | 模块 exports 的服务 |
| Data Source | 数据库/文件连接器 | Collection 定义 |
| Trigger | 事件触发工作流 | 事件总线订阅 |
| Agent Strategy | 自定义推理逻辑 | 未来 AI Agent |
| Endpoint | HTTP 端点 | Podman 隔离模块 API |

**2. 工作流 DSL（YAML 定义）**：

```
Dify DSL 特点：
├── YAML 格式，可导出/导入/版本控制
├── 40+ 节点类型（LLM/Code/HTTP/Knowledge/If-Else/Loop...）
├── 变量作用域：System / Environment / Conversation / NodeOutput
├── DAG 拓扑排序执行
├── 并行执行（无依赖的节点并行）
└── 两种应用类型：Workflow（无状态）vs Chatflow（多轮对话）
```

#### 不借鉴的设计

| 设计 | 原因 |
|------|------|
| Python 后端 | MODACS 用 TypeScript |
| Plugin Daemon（独立 Go 服务） | MODACS 用 Podman 替代 |
| RAG Pipeline | 不是 MODACS 核心需求 |
| 100+ 模型提供商 | MODACS Vision 只需 GPU 推理 |
| Flask + Celery | MODACS 用 Hono + EventEmitter |

### 8.4 Coze（扣子）架构

#### 核心设计：中断恢复 + 状态管理

Coze 的工作流引擎有两个设计特别值得 MODACS 借鉴：

**1. 中断与恢复（Interrupt & Resume）**：

```
Coze 工作流执行：
  节点需要等待外部输入时
    → 返回 InterruptError
    → 引擎捕获错误
    → 持久化 {中断点, 工作流状态} 到数据库
    → 工作流暂停

  外部条件满足（如用户点击"通过"）
    → 加载快照
    → 从断点恢复执行
    → 带着新输入继续

这是 MODACS OA 审批场景的核心需求：
  创建工单 → 主管审批 → [暂停数小时/数天] → 恢复 → 总经理审批 → [暂停] → 完成
```

**2. State 状态管理**：

```
每个工作流实例有独立的 State 对象：
├── 全局变量（贯穿整个生命周期）
├── 节点输出（各节点执行结果）
├── 当前执行位置
└── 可序列化/反序列化（用于持久化）
```

**3. 复合节点/子图**：

```
Loop/Batch 节点内部包含子工作流（子 DAG）：
├── 编译阶段递归编译子图
├── 父节点执行时调用内部 Runnable
└── 优雅解决无限嵌套复杂性
```

#### 不借鉴的设计

| 设计 | 原因 |
|------|------|
| ReAct Agent 引擎 | MODACS 不需要 AI 推理循环 |
| Eino 框架（Go） | MODACS 用 TypeScript |
| 多平台发布 | 不相关 |
| Prompt 工程 | 不是核心需求 |

### 8.5 MODACS 工作流引擎借鉴总结

| 能力 | 借鉴来源 | 借鉴程度 |
|------|---------|---------|
| DAG 执行器（栈 + 等待队列） | n8n `WorkflowExecute` | ✅ 核心设计，重新实现 |
| 多输入合并（Merge 节点） | n8n | ✅ 节点类型 |
| 部分执行（调试） | n8n `runPartialWorkflow2` | ✅ 调试能力 |
| 执行恢复（崩溃恢复） | n8n `ExecutionRecoveryService` | ✅ 容错能力 |
| 中断与恢复 | Coze InterruptError | ✅ **最核心**，人工审批必需 |
| State 状态管理 | Coze State 对象 | ✅ 跨天流程状态保持 |
| 复合节点/子图 | Coze Loop/Batch | ✅ 批量操作 |
| YAML DSL 定义格式 | Dify Dify DSL | ✅ 可导出/版本控制 |
| 变量作用域 | Dify 四层作用域 | ✅ 数据传递 |
| 节点类型分类法 | n8n + Dify | ✅ 设计参考 |
| 节点桥接模块服务 | MODACS 原创 | action 节点 → container.resolve |

### 8.6 各项目关键源码索引

#### n8n

| 文件/目录 | 内容 | 参考价值 |
|-----------|------|---------|
| `packages/core/src/execution-engine/workflow-execute.ts` | DAG 执行器核心（~1250 行 TS） | ⭐⭐⭐⭐⭐ 最核心 |
| `packages/workflow/src/graph/` | DAG 图遍历算法 | ⭐⭐⭐⭐ |
| `packages/workflow/src/expression.ts` | 表达式引擎 | ⭐⭐ 简化版参考 |
| `packages/cli/src/workflow-runner.ts` | 工作流启动器 | ⭐⭐⭐ |

#### Dify

| 文件/目录 | 内容 | 参考价值 |
|-----------|------|---------|
| `api/core/workflow/` | 工作流引擎 | ⭐⭐⭐⭐ DAG 执行 |
| `api/core/workflow/nodes/` | 节点工厂 | ⭐⭐⭐⭐ 节点类型 |
| `api/core/plugin/` | 插件系统集成 | ⭐⭐⭐ 插件分类参考 |

#### Coze

| 来源 | 内容 | 参考价值 |
|------|------|---------|
| Coze Studio 工作流引擎（公开文档） | 编译时/运行时分离、中断恢复 | ⭐⭐⭐⭐⭐ 中断恢复设计 |
| Coze Plus 智能体架构（公开文档） | State 管理、复合节点 | ⭐⭐⭐⭐ |

---

## 9. 多进程插件 IPC 社区实践对比（新增）

> 本节分析主流开源项目的插件进程隔离和 IPC 通信方案，
> 为 MODACS 的多进程 UDS JSON-RPC 设计提供社区先例支撑。

### 9.1 社区三种模式

| 模式 | 代表项目 | 隔离粒度 | IPC 传输 | 协议数 |
|------|---------|---------|---------|--------|
| **所有插件共享一个隔离进程** | VS Code | 所有扩展 1 个 Extension Host | MessagePort RPC | 1 |
| **每插件一个子进程** | Grafana / HashiCorp | 每插件 1 个子进程 | gRPC | 1 |
| **每插件一个容器** | Home Assistant | 每插件 1 个 Docker 容器 | Unix Socket + HTTP | 1-2 |

**关键发现：没有人做多通道分离。** 四个项目，每个都只用一种 IPC 协议做插件通信。

### 9.2 VS Code：Extension Host

```
VS Code 进程架构：
├── Main Process（Electron 主进程，UI shell）
├── Renderer Process（Web 页面渲染）
└── Extension Host（1 个 Node.js 进程，所有扩展跑在里面）
    ├── Git 扩展
    ├── TypeScript 扩展
    └── ... 全部在这里
```

- **IPC**：Channel-based RPC over MessagePort
- **60+ service pair**（ExtHost* ↔ MainThread*），单条 MessagePort 多路复用
- **Proxy 对象**让远程调用看起来像本地调用
- **不做每扩展一个进程**——内存开销太大（20 扩展 × 30MB = 600MB）

### 9.3 Grafana / HashiCorp go-plugin

```
Grafana 架构：
├── Grafana Server（主进程，Go）
│   ├── Plugin Manager（管理子进程生命周期）
│   └── gRPC Client（调用插件）
├── Plugin: Prometheus（子进程 1，Go 二进制）
├── Plugin: Loki（子进程 2，Go 二进制）
└── Plugin: Custom DB（子进程 3，任意语言）
```

- **IPC**：gRPC（HashiCorp go-plugin 系统）
- **HashiCorp go-plugin** 被 Terraform/Vault/Nomad/Packer 共用
- **插件接口极简**：QueryData / CheckHealth / CallResource / RunStream
- **一个 gRPC 连接通吃**：查询、健康检查、自定义 API、流式数据
- **崩溃自动重启**，stdout/stderr 镜像回 Host

### 9.4 Home Assistant：Supervisor + Unix Socket

```
Home Assistant 架构：
├── Supervisor（管理进程）
├── HA Core（1 个 Docker 容器）
├── Add-on: Node-RED（1 个容器）
└── Add-on: MQTT Broker（1 个容器）
```

- **Supervisor ↔ Core**：**Unix Socket**（2026 年 2 月从 TCP 切换，PR #6590）
- 切换理由："Unix socket is only reachable by processes on the same host, requests arriving over it are implicitly trusted and authenticated. This removes the token round-trip... reduces attack surface... avoids port conflicts."
- **Supervisor ↔ Add-ons**：HTTP over Docker 内部网络

### 9.5 MODACS 的定位

```
MODACS 多进程模式 = Grafana 模式（每插件独立进程）+ HA 传输（UDS）+ VS Code 透明代理

├── 隔离粒度：每 TS 插件 1 个 Node.js 子进程（类 Grafana）
├── IPC 传输：UDS JSON-RPC（类 HA 的 Unix Socket）
├── 透明代理：container.resolve 返回 Proxy（类 VS Code getProxy）
├── 单 IPC 通吃：RPC + 事件 + 流式 + 健康检查（类 Grafana gRPC）
└── 可观测性：MCAP 旁路录制（类 ROS2 rosbag2）
```

### 9.6 通信延迟 Benchmark

来自 [trading-ipc-bench](https://github.com/suenot/trading-ipc-bench)（同机 round-trip）：

| 传输方式 | p50 延迟 | 吞吐 msg/s | MODACS 使用场景 |
|---------|---------|-----------|----------------|
| **Unix Domain Socket** | **20.2μs** | **46,512** | **插件间 RPC（主选）** |
| Named Pipe | 26.3μs | 36,673 | — |
| TCP loopback | 41.7μs | 22,425 | 跨节点 HTTP（备选） |
| gRPC over UDS | 396.7μs | 2,505 | 不选（框架开销太大） |
| gRPC over TCP | 423.0μs | 2,341 | 不选 |
| Redis Pub/Sub | 513.0μs | 1,957 | 不选（额外依赖） |

**MODACS 选择 UDS 的理由**：20μs 延迟，比 gRPC 快 20 倍，零额外依赖，curl 可调试。

### 9.7 集群部署时 UDS 的适用性

社区共识：**节点自包含 + 跨节点 HTTP API**。

| 项目 | 集群模式 | 节点内通信 | 跨节点通信 |
|------|---------|-----------|-----------|
| Home Assistant | 多 HA 实例 | UDS | HTTP REST API |
| Grafana | 多 Grafana 实例 | gRPC（子进程） | 共享 DB + HTTP |
| Odoo | 多实例 + db_filter | 进程内 | 共享 PG + Nginx |

**没有一个项目做跨节点 RPC。** 跨节点一律走 HTTP API。UDS 不会成为集群化的障碍——集群化增加的是节点间 HTTP 通信，不是节点内 IPC 的变更。

如果未来极端情况下要跨主机分布插件，JSON-RPC 从 UDS 切到 TCP 只需要改一行配置：

```typescript
// 同机：UDS
'erp': 'http://unix:/tmp/modacs-erp.sock',

// 跨机：TCP（只改这一行）
// 'erp': 'http://192.168.1.10:3001',
```

---

*本文档与 [MODACS-Platform](./MODACS-Platform.md)、[MODACS-Platform-Dev](./MODACS-Platform-Dev.md)、[MODACS-Cluster](./MODACS-Cluster.md) 互补。*
*架构设计见 [MODACS-Platform](./MODACS-Platform.md)，开发步骤见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md)，集群扩展见 [MODACS-Cluster](./MODACS-Cluster.md)。*
