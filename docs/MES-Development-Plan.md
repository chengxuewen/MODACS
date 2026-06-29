# MES 开发方案

> 本文是 MODACS 首个落地应用（MES）的完整开发方案，基于 2026-06-23 多轮技术讨论整理。
> 与 [MODACS-Overview](./MODACS-Overview.md)（项目总览）互补，前者定义"做什么"，本文定义"怎么做"。
>
> **⚠️ 架构转向说明**（2026-06-26）：
> MODACS 平台已从 Rust/dora-rs/DSM 架构转向 **TS/Node.js/Hono + Odoo 式模块加载**架构。
> - MES 不再作为独立 Docker 套件，而是作为**进程内 Plugin** 动态加载到平台中。
> - Carbon 不再 fork 当平台，而是**提取业务逻辑**（数据模型、服务、UI 组件）为 MES 模块。
> - dora-rs 降级为 MODACS Link 模块内部使用，不再是平台核心运行时。
> - Supabase 依赖被 Drizzle ORM 替代。
> - 本文中的 dora-rs 桥接设计仍适用于 Vision 模块（Podman 隔离）与 MES 模块的通信。
> - 详细的模块化开发步骤见 [MODACS-Platform-Dev](./MODACS-Platform-Dev.md) Step 8。

---

## 一、技术选型决策

### 1.1 基座选择：Fork Carbon（非 Odoo）

| 决策因素 | Carbon | Odoo | 结论 |
|---------|--------|------|------|
| 你的 TS/React 基础 | ✅ 直接用 | ❌ 需学 OWL | Carbon 胜 |
| API-first 架构 | ✅ REST + Webhooks + MCP | 🟡 XML-RPC（社区版） | Carbon 胜 |
| 与 dora-rs 桥接难度 | ✅ 低（HTTP API） | 🟡 中（需 Python 桥接） | Carbon 胜 |
| Monorepo 结构 | ✅ pnpm workspace | ❌ 单体 addons | Carbon 胜 |
| MES 功能完整度 | 🟡 基本（ERP+MES+QMS） | ✅ 完整（MRP+车间+PLM+OEE） | Odoo 胜 |
| 社区成熟度 | 🟡 2K stars，1年 | ✅ 1500万用户，10年+ | Odoo 胜 |
| 版本迁移 | ✅ 自己控制 | ❌ 每年大版本迁移 | Carbon 胜 |

**核心逻辑**：瓶颈不是 MES 功能不够（可逐步补充），而是 TS/React 基础薄弱需要可读性强的代码库来学习。Carbon 的 TypeScript 代码比 Odoo 的 Python+OWL 更适合。

**Carbon 关键信息**：
- 仓库：https://github.com/crbnos/carbon
- 技术栈：React Router + TypeScript + Tailwind + Radix UI + Supabase (PostgreSQL)
- 架构：Monorepo (pnpm workspace)，API-first，Webhooks，MCP Client/Server
- 许可证：AGPL（自用不受影响；商业化时需购买商业许可或重写关键模块）

### 1.2 前端模式：前后端分离（无悬念）

```
决策：前后端分离
├── 蓝图编辑器 + 拖拽组态 = 必须有富客户端 JS，模板引擎做不了
├── dora-rs 桥接 = 需要 JSON API，模板引擎返回 HTML 不匹配
├── Carbon 已经是前后端分离（React + Supabase API）
└── MODACS 架构设计文档中已经选定了前后端分离

具体执行：
├── 前端：Fork Carbon，React + TypeScript
├── 后端：Carbon Supabase API + dora-rs Bridge Node
├── 通信：REST（CRUD）+ WebSocket（实时）+ Webhook（事件）
└── 不需要 SSR/SEO（MES 是内网工具）
```

### 1.3 通信中间件：dora-rs（非 ROS2）

```
MES 业务域：不需要中间件
├── 工单/BOM/质量/AGV调度：HTTP REST + WebSocket 足够
├── 数据频率：事件驱动，秒级
└── 加中间件 = 增加复杂度，不增加价值

视频/视觉/控制域：需要 dora-rs
├── 8.3MB/帧的视频不能在进程间复制
├── SHM/CUDA IPC 是"能不能跑"的问题，不是"快不快"的问题
└── dora-rs 提供 SHM + CUDA IPC + 录制 + 分布式

选择 dora-rs 而非 ROS2 的理由：
├── 1. CUDA IPC：dora-rs 原生支持 GPU 内存零拷贝，ROS2 不支持
├── 2. 部署简单：Rust 单二进制 vs ROS2 完整环境（Docker 2GB+）
├── 3. 与 MODACS/MODACS Act 架构一致（2026-06-16 已锁定）
├── 4. MODACS Link 演进路径：dora-rs → ROS2 Bridge → 自主实现
└── 5. Python 推理节点通过 Arrow 零拷贝接收帧
```

### 1.4 数据库：PostgreSQL + TimescaleDB

```
一个数据库引擎，不需要第二个：
├── 业务关系数据 → PostgreSQL 常规表（ACID/外键/Carbon 原生支持）
├── 设备时序数据 → TimescaleDB hypertable（自动分区/压缩/连续聚合）
├── 配置数据 → PostgreSQL JSONB/TEXT
├── 审计日志 → PostgreSQL 表 + JSONB
└── 录制文件 → 文件系统（不进数据库）

TimescaleDB 是 PostgreSQL 扩展，一行命令启用：
  CREATE EXTENSION timescaledb;

不需要的数据库及原因：
├── InfluxDB：TimescaleDB 是 PG 扩展，同一数据库搞定，运维减半
├── MongoDB：PostgreSQL JSONB 做同样的事，且支持事务
├── ClickHouse：MES 数据量级别（千万级）PG 完全够
├── SQLite：不支持多进程并发写入
└── MySQL：Carbon 用 PG，换 MySQL = 重写数据库层
```

### 1.5 MES 与视频系统分离

```
MES（MODACS 决策层首个应用）
├── 仓库：mes-system
├── 技术栈：React + TypeScript + Supabase + PostgreSQL
├── 部署：普通服务器
└── 依赖 MODACS Vision 的 API（通过 HTTP 调用）

MODACS Vision（MODACS Act 执行层首个应用）⭐ 独立项目
├── 仓库：videohub
├── 技术栈：Rust + dora-rs + CUDA + Python
├── 部署：GPU 服务器
├── 独立运行，不依赖任何业务系统
└── 可被任何项目复用（MES/MaxSense/CarlaSim）

分离理由：
├── 技术栈完全不同（TS/React vs Rust/CUDA）
├── 硬件需求不同（普通服务器 vs GPU 服务器）
├── 故障影响不同（MES 挂了工人不能报工 vs 视频挂了漏检）
├── MODACS Vision 是可复用产品（类似群晖 Surveillance Station）
└── 完全符合 MODACS/MODACS Act 双层架构
```

---

## 二、通信分层策略

不要把 dora-rs 当成"所有通信都走它"的万能中间件。分层使用：

```
Layer 3: 业务通信（HTTP REST）
├── 前端 ↔ Carbon API（工单/BOM/质量 CRUD）
├── dora-rs Bridge Node ↔ Carbon API（事件同步）
├── 特点：请求-响应，秒级，可靠性优先
└── 不需要中间件：HTTP 就是最可靠的中间件

Layer 2: 设备数据流（dora-rs dataflow）
├── OPC UA Collector → Alarm Engine → Webhook Node
├── MQTT Collector → OEE Calculator → Record Node
├── 特点：pub/sub，1-10Hz，数据流管线
└── dora-rs 在这里：DAG 编排 + 录制 + 可观测

Layer 1: 设备协议（直接客户端）
├── Rust opcua crate 直接连 PLC
├── Rust paho-mqtt 直接连 MQTT broker
├── Rust tokio-modbus 直接连 Modbus 设备
├── 特点：点对点，不需要中间件
└── 协议客户端包在 dora-rs node 内部
```

### 录制/回放：双轨制

```
业务级录制（"谁在什么时候做了什么"）
├── PostgreSQL event_log 表
├── 查询：SELECT * FROM event_log WHERE work_order_id = ?
├── 回放：读记录 → 按时间戳排序 → 业务逻辑重演
└── 这是 MES 最常用的录制

数据流级录制（"设备数据当时是什么样的"）
├── dora-rs record-node → .drec 文件
├── 查询：按时间段 + 产线筛选 .drec 文件
├── 回放：dora-rs replay-node → 重放数据流
└── 这是调试设备问题时用的

两者通过 trace_id 关联：
├── event_log.trace_id = 'abc123'
├── .drec 中对应时间段的消息也带 trace_id = 'abc123'
└── 出了问题：查 event_log → 用 trace_id 找 .drec → 回放设备数据
```

---

## 三、系统架构

### 3.1 双域分离 + 桥接

```
┌──────────────────────────────────────────────────────────┐
│              世界 1：MES 业务域                            │
│              (Carbon + PostgreSQL)                        │
│  工单管理 / BOM / 质量追溯 / OEE / AGV调度                │
│  通信：HTTP REST + WebSocket                              │
│  无中间件                                                 │
└───────────────────────┬──────────────────────────────────┘
                        │
                  Bridge Node (HTTP ↔ dora-rs)
                        │
┌───────────────────────┴──────────────────────────────────┐
│              世界 2：实时视觉/控制域                       │
│              (dora-rs dataflow)                           │
│  RTSP采集 → NVDEC解码 → 推理 → 停机指令                   │
│  通信：Zenoh SHM（机内零拷贝）+ Zenoh TCP（跨机器）        │
│  录制：record-node（全链路 .drec）                         │
└──────────────────────────────────────────────────────────┘
```

### 3.2 完整部署拓扑

```
              ┌─────────────────────┐
              │    MES 服务器        │
              │  (普通服务器 2核4G)   │
              │  React + TS + PG    │
              │  :3000 :5432        │
              └──────────┬──────────┘
                         │
                  HTTP API + Webhook
                  (内网千兆，毫秒级)
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   ┌──────┴──────┐ ┌────┴──────┐ ┌────┴──────┐
   │ GPU 服务器 1 │ │GPU 服务器 2│ │GPU 服务器 3│
   │ (1-40路相机) │ │(41-80路)  │ │(81-100路) │
   │ dora-rs     │ │ dora-rs   │ │ dora-rs   │
   │ RTSP→NVDEC  │ │ 同左      │ │ 同左      │
   │ →推理→停机  │ │           │ │           │
   │ →录制(.drec)│ │           │ │           │
   │ →Bridge→MES│ │           │ │           │
   └─────────────┘ └───────────┘ └───────────┘
```

---

## 四、渐进式开发路线图

### 总览：4 个阶段 × 6 个月

```
Phase 1 (Week 1-6)   最小可用 MES + 全链路可观测     ← 上线简易版
Phase 1.5(Week 7-10) 单路视频验证（MODACS Vision 原型）   ← 新增
Phase 2 (Week 11-16) 多路视频 + 报警 + OEE
Phase 3 (Week 17-22) 蓝图编辑器 + 组态界面
Phase 4 (Week 23-28) 100路扩展 + AGV/机械臂 + 追溯
```

### Phase 1：最小可用 MES + 全链路可观测（第 1-6 周）

**目标**：工厂能用工单、工人在平板上报工、所有操作可追溯可回放

#### 功能范围

```
必须有的（5 个核心功能）：
├── ① 工单管理：创建/分配/启动/完成/暂停
├── ② 车间终端：平板界面，工人扫码报工
├── ③ BOM 管理：产品→物料清单
├── ④ 质量记录：合格/不合格/不合格原因
└── ⑤ 生产日志：谁在什么时间做了什么操作

明确不做的（留到后面）：
├── ❌ 设备实时监控（Phase 2）
├── ❌ 自动排程（Phase 2）
├── ❌ OEE 计算（Phase 2）
├── ❌ 蓝图编辑器（Phase 3）
├── ❌ 组态界面（Phase 3）
├── ❌ SPC/控制图（Phase 4）
├── ❌ 多工厂/多产线（Phase 4）
└── ❌ AI/ML（Phase 4）
```

#### 三层可观测体系（Day 1 内置）

```
Layer 1: 业务事件日志（Who did What, When）
├── 实现：PostgreSQL 触发器 + 审计表 event_log
├── 每次工单状态变更，触发器自动写入
└── 字段：timestamp/actor/action/entity_type/entity_id/before_state/after_state/metadata/trace_id

Layer 2: dora-rs 数据流录制（What happened in the system）
├── 实现：dora-rs record-node + 自定义 bridge-node
├── 所有前端 API 调用经过 bridge-node → record-node 录制
├── 回放：dora-rs replay-node 读取 .drec → 重新走一遍数据流
└── 价值：复现任何一次操作的完整上下文

Layer 3: 系统健康指标（How is the system doing）
├── 今日工单数（创建/进行中/完成/异常）
├── 平均工单完成时长
├── 质量合格率
├── API 响应时间（P50/P99）
└── 错误率（4xx/5xx）
```

#### 数据模型（最小集）

```sql
-- Phase 1 只需要 6 张表（Carbon 已有大部分，微调即可）
-- 1. products（Carbon 已有）
-- 2. bill_of_materials（Carbon 已有）
-- 3. work_orders（Carbon 已有，需加字段：status/assigned_to/work_center/planned_start等）
-- 4. quality_checks（Carbon 已有）
-- 5. event_log（新增：审计日志）
-- 6. recording_index（新增：关联 .drec 文件）
```

#### 前端页面清单（共 7 个页面）

| 页面 | 来源 | 工作量 |
|------|------|--------|
| 工单列表 | Carbon 已有 | 改字段 |
| 工单详情 | Carbon 已有 | 改字段 |
| 创建工单 | Carbon 已有 | 改表单 |
| 车间终端 | Carbon 有模板 | 重点定制 |
| BOM 管理 | Carbon 已有 | 微调 |
| 操作日志 | 新增 | 中 |
| 系统仪表盘 | 新增 | 中 |

#### 每周计划

```
Week 1-2: 环境搭建 + Carbon 跑通
Week 3: 数据模型调整 + 事件日志
Week 4: dora-rs 桥接 + 录制
Week 5: 前端定制
Week 6: 集成测试 + 上线
```

### Phase 1.5：单路视频验证（第 7-10 周）

**目标**：1 台 3D 打印机 + 1 个相机，验证缺陷检测全链路

```
├── dora-rs dataflow：RTSP → NVDEC → 推理 → 停机
├── 验证 CUDA IPC 零拷贝
├── 验证缺陷检测模型准确率
├── 验证停机指令延迟（目标 < 200ms）
├── 录制回放验证
└── bridge-node 推送结果到 Carbon
```

### Phase 2：多路视频 + 报警 + OEE（第 11-16 周）

```
新增功能：
├── ⑥ 设备实时监控：OPC UA / MQTT 读 PLC 数据
├── ⑦ 报警引擎：阈值触发 → 界面弹窗 + 日志记录
├── ⑧ OEE 计算：可用率 × 性能率 × 质量率
├── ⑨ 实时仪表盘：设备状态/产量曲线/报警列表
└── ⑩ Webhook 推送：dora-rs 事件 → Carbon API 实时更新
```

### Phase 3：蓝图编辑器 + 组态界面（第 17-22 周）

```
新增功能：
├── ⑪ 蓝图编辑器：React Flow 拖拽编排 dataflow
├── ⑫ 组态界面设计器：dnd-kit 拖拽搭建仪表盘/工位界面
├── ⑬ 配置即部署：蓝图 YAML → dora-rs 启动 dataflow
├── ⑭ 界面配置存储：JSON 保存到数据库，运行时渲染
└── ⑮ 模板库：常用节点组合/界面模板可复用
```

### Phase 4：100路扩展 + AGV/机械臂 + 追溯（第 23-28 周）

```
新增功能：
├── ⑯ SPC 统计过程控制
├── ⑰ 完整追溯：原料→工序→操作人→设备→质量→出库
├── ⑱ 多产线/多工作中心管理
├── ⑲ 排程优化：有限产能排程 + 甘特图拖拽
├── ⑳ 维护管理：预防性维护计划 + 设备台账
├── ㉑ API 开放平台
└── ㉒ 数据导出
```

---

## 五、3D 打印机缺陷检测 Dataflow

```yaml
# dora-config/dataflows/printer-defect-detection.dataflow.yml
nodes:
  # 采集层
  - id: rtsp_capture
    path: ./nodes/rtsp_capture_node
    inputs: { tick: dora/timer/33ms }
    outputs: [h264_packet]
    env: { RTSP_URL: "rtsp://printer-cam-01/stream" }

  # 解码层（CUDA IPC 关键路径）
  - id: hw_decoder
    path: ./nodes/nvdec_node
    inputs: { h264_packet: rtsp_capture }
    outputs: [rgb_frame]
    env: { USE_CUDA_IPC: "true" }

  # 推理层
  - id: defect_detector
    path: ./nodes/inference_node
    inputs: { rgb_frame: hw_decoder }
    outputs: [detection_result]
    env: { MODEL_PATH: "./models/defect_yolov8.onnx", CONFIDENCE_THRESHOLD: "0.75" }

  # 决策层
  - id: decision_engine
    path: ./nodes/decision_node
    inputs: { detection_result: defect_detector }
    outputs: [stop_command, alarm_event]
    env: { STOP_RULES: "critical_defects: [layer_shift, warping, stringing], consecutive_frames: 2" }

  # 执行层
  - id: printer_control
    path: ./nodes/modbus_node
    inputs: { stop_command: decision_engine }
    env: { PLC_ADDRESS: "192.168.1.50:502", STOP_REGISTER: "DO:0" }

  # 可观测层
  - id: record_node
    path: dora-rs/rust/record
    inputs: { h264_packet: rtsp_capture, detection_result: defect_detector, stop_command: decision_engine, alarm_event: decision_engine }
    env: { FILE: "./recordings/printer_${SESSION_ID}.drec" }

  - id: bridge_node
    path: ./nodes/bridge_node
    inputs: { alarm_event: decision_engine, detection_result: defect_detector }
    env: { CARBON_API_URL: "http://mes-server:3000/api" }
```

### SHM 发挥作用的关键路径

```
hw_decoder → defect_detector：⭐ SHM 关键
  解码帧 8.3MB/帧 × 30fps = 249MB/s
  NVDEC 输出在 GPU 内存 → CUDA IPC 直接共享给推理
  不经系统内存，零拷贝

hw_decoder → record_node：⭐ SHM 关键
  同一帧同时给推理和录制
  SHM 让两个消费者读同一块内存，不复制

defect_detector → decision_engine：
  检测结果几十字节，HTTP 都行

decision_engine → printer_control：
  停机指令几字节，Modbus 直连

decision_engine → bridge_node：
  报警事件几百字节，HTTP POST
```

---

## 六、性能预估

| 场景 | 数据量 | PostgreSQL + TimescaleDB 表现 |
|------|--------|------------------------------|
| 工单查询 | 万级 | < 10ms |
| 10 台设备 × 1Hz 写入 | 86万条/天 | 轻松，压缩后 < 100MB/天 |
| 100 台设备 × 10Hz 写入 | 8600万条/天 | 压缩后 ~5GB/天 |
| 审计日志查询 | 百万级 | JSONB GIN 索引，< 20ms |
| 仪表盘加载（含聚合） | — | 连续聚合预计算，< 100ms |
| 1 年数据（100台设备） | ~300亿条 | 原始 ~300GB，压缩 ~30GB，聚合 ~1GB |

视频流性能：
- 100 路 1080p H.264：编码后 400Mbps，千兆网够
- 解码后：8.3MB/帧 × 30fps × 100路 = 24.9GB/s，需要 2-3 台 GPU 服务器
- 推理结果：几十字节/帧 × 3000帧/秒 = ~150KB/s，HTTP 绰绰有余

---

## 七、第一步行动

```
今天：
├── Fork Carbon 到 GitHub
├── git clone && docker compose up
├── 打开 http://localhost:3000，跑通 MES app
└── 创建一个工单，走完整个流程

明天：
├── 阅读 apps/mes/ 下的源码
├── 找到工单相关的路由/组件/服务
├── 用 Supabase 管理台看数据库结构
└── 记录理解的数据流到 vault

本周：
├── 安装 dora-rs（cargo install dora-cli）
├── 跑通 dora-rs 官方 example
├── 理解 record-node 的使用方式
└── 写一个最简 bridge-node 连接 Carbon API
```

---

## 附录：关键决策记录

| 日期 | 决策 |
|------|------|
| 2026-06-23 | MES 基座选择 Fork Carbon（非 Odoo） |
| 2026-06-23 | 前端模式：前后端分离（Carbon SPA） |
| 2026-06-23 | 通信中间件：dora-rs（非 ROS2） |
| 2026-06-23 | 数据库：PostgreSQL + TimescaleDB |
| 2026-06-23 | MES 与视频系统分离为独立项目 |
| 2026-06-23 | 录制/回放：双轨制（PG event_log + dora-rs .drec） |
| 2026-06-23 | 渐进式路线：4 阶段 6 个月，Phase 1 先上线简易版 |

---

*本文档与 [MODACS-Overview](./MODACS-Overview.md)、[MODACS-Link](./MODACS-Link.md) 互补。前者定义架构愿景，本文定义落地执行方案。*
*MODACS Vision 独立产品定义见 [MODACS-Vision](./MODACS-Vision.md)。*
*MODACS 平台套件体系见 [MODACS-Platform](./MODACS-Platform.md)。*
