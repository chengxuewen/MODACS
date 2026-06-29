# MODACS Vision：视频监控与AI分析平台

> **定位**：MODACS Act 执行层的首个独立产品。不依赖任何业务系统即可独立运行。
> **类比**：群晖 Surveillance Station —— 通用视频平台，通过 API 被其他系统复用。

---

## 1. 产品定义

### 1.1 核心能力（独立运行，不依赖外部系统）

| # | 能力 | 说明 |
|---|------|------|
| 1 | 相机管理 | 添加/删除/配置 RTSP/WebRTC/V4L2 相机 |
| 2 | 视频采集 | 多协议接入，RTSP/WebRTC/V4L2 |
| 3 | GPU 解码 | NVDEC 硬件解码，单 GPU 40+ 路 |
| 4 | 录制存储 | 按时间/事件录制，自动滚动清理 |
| 5 | 回放检索 | 时间轴浏览，按相机/时间/事件筛选 |
| 6 | 实时预览 | Web 端多路视频墙 |
| 7 | AI 推理 | 可插拔模型（YOLO/自定义），GPU 加速 |
| 8 | 事件引擎 | 检测结果→规则匹配→触发动作 |
| 9 | 动作输出 | Webhook/GPIO/Modbus/MQTT 多通道 |
| 10 | 可观测性 | 全链路录制(.drec) + OpenTelemetry |

### 1.2 明确不做的事（留给业务系统）

- ❌ 工单管理（MES 的事）
- ❌ BOM/质量追溯（MES 的事）
- ❌ 排程/OEE（MES 的事）
- ❌ AGV/机械臂调度（MES 的事）
- ❌ 用户权限/认证（业务系统的事，MODACS Vision 用 API Key）

---

## 2. 为什么独立项目

### 2.1 不是 MES 的功能，是一个产品

```
MODACS Vision 的复用场景：

| 项目 | 视频需求 | 复用方式 |
|------|---------|---------|
| MES（3D打印机监控） | 100路相机缺陷检测+停机 | 检测结果通过 Webhook 推给 MES |
| MaxSense/MSRTC | WebRTC 远程驾驶视频墙 | MODACS Vision 提供 RTSP→WebRTC 桥接 |
| CarlaSim | 仿真多相机数据采集 | 仿真相机→MODACS Vision→录制/分析 |
| MODACS 平台 | 平台级视频能力 | 作为 MODACS Act 标准视频组件 |
| 未来任何项目 | 需要视频的地方 | 装 MODACS Vision，配相机，接 Webhook |

→ 如果不独立，每次新项目都要 copy-paste 视频代码
```

### 2.2 群晖 Surveillance Station 模式

```
群晖 DSM                          MODACS Vision
─────────                        ─────────
Surveillance Station              MODACS Vision
├── 独立安装/升级/授权             ├── 独立安装/升级
├── 完整的相机管理/录制/回放        ├── 完整的相机管理/录制/回放
├── 通过 API 与其他系统联动        ├── 通过 API/Webhook 与其他系统联动
├── 不依赖 DSM 其他组件            ├── 不依赖 MODACS 其他套件
└── 任何需要视频监控的场景都能用     └── 任何需要视频的项目都能用
```

---

## 3. 技术架构

### 3.1 双域分离

```
世界 1：MES 业务域（慢世界）
├── 工单管理/BOM/质量记录/追溯
├── AGV 调度/机械臂任务下发
├── 数据频率：事件驱动，秒级
├── 通信方式：HTTP REST + WebSocket
└── 中间件需求：无

世界 2：实时视觉/控制域（快世界）← MODACS Vision
├── 100路视频流采集 + 解码
├── 解码帧在多消费者间共享（显示+录制+推理）
├── 缺陷检测推理 + 停机指令
├── 数据频率：30fps × 100路 = 3000帧/秒
├── 帧大小：8.3MB/帧（1080p RGBA）
└── 中间件需求：SHM + CUDA IPC（刚需）
```

### 3.2 为什么用 dora-rs（不是 ROS2）

| 能力 | dora-rs | ROS2 | 对 MODACS Vision 的价值 |
|------|---------|------|-------------------|
| **CUDA IPC** | ✅ 原生支持 | ❌ 不支持 | GPU 解码帧零拷贝给推理——**决定性差异** |
| **Zenoh SHM** | ✅ 零拷贝 | 🟡 Cyclone+iceoryx | 8.3MB/帧不复制——"能不能跑"的问题 |
| **视频帧录制** | ✅ record-node | 🟡 rosbag2（需转格式） | 可只录 H.264 包+推理结果，省 99% 空间 |
| **Python 推理节点** | ✅ Arrow 零拷贝 | 🟡 需反序列化 | YOLOv8 等模型是 Python 生态 |
| **多语言混合** | ✅ Rust+Python+C++ | 🟡 支持但 Python 慢 | 采集/解码用 Rust，推理用 Python |
| **部署** | ✅ 单二进制 <100MB | ❌ Docker 镜像 2GB+ | 3台 GPU 服务器部署 |
| **工业协议** | ❌ 需自己写 | ✅ 多个包 | MODACS Vision 的劣势，但可接受 |

**结论：CUDA IPC 是 dora-rs 对 ROS2 的决定性优势。** 解码帧在 GPU 内存，ROS2 拿不出来。

### 3.3 数据量分析

```
100 路 1080p H.264 视频：

编码后（网络传输）：
├── 每路 ~4Mbps → 100路 = 400 Mbps
├── 千兆网刚好够（留 40% 余量）
└── 万兆网轻松

解码后（内存中处理）：
├── 每帧 1920×1080×4(RGBA) = 8.3 MB
├── 30fps → 每路 249 MB/s
├── 100路同时解码 = 24.9 GB/s
├── 单台机器不可能——1张 GPU 的 NVDEC 最多解码 30-50 路
└── 需要 2-3 台 GPU 服务器分布式解码

推理后（缺陷检测结果）：
├── 每帧推理结果 = 几十字节
├── 100路 × 30fps = 3000 条/秒
└── 几十字节 × 3000 = ~150 KB/s → HTTP 都绰绰有余

→ 视频帧必须 SHM（8.3MB 不能复制）
→ 推理结果走 HTTP（几十字节无所谓）
→ 跨机器走网络（推理结果很小）
```

### 3.4 3D 打印机缺陷检测延迟预算

```
缺陷检测 → 停机指令的延迟预算：

3D 打印头移动速度：30-150 mm/s
缺陷从出现到恶化的距离：约 1-5mm
可用反应时间：10-50ms 中的"检测+决策"部分

实际延迟分解：
├── 相机采集延迟：33ms（1帧@30fps）
├── H.264 解码延迟：5-20ms（硬件解码）
├── AI 推理延迟：10-50ms（取决于模型）
├── 决策逻辑：< 1ms
├── 停机指令传输：< 10ms（GPIO/Modbus/TCP）
└── 总计：~50-115ms

→ 检测+推理是瓶颈（60-100ms），通信不是（<10ms）
→ 但推理结果帧要分发给多个消费者（录制+显示+日志），SHM 有价值
```

---

## 4. 系统架构

### 4.1 分布式部署

```
                    ┌─────────────────────┐
                    │    MES 服务器        │
                    │  (普通服务器 2核4G)   │
                    │  Carbon + PostgreSQL │
                    └──────────┬──────────┘
                               │
                        HTTP API + Webhook
                        (内网千兆，毫秒级)
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────┴───────┐ ┌─────┴──────┐ ┌───────┴─────┐
     │ GPU 服务器 1    │ │GPU 服务器 2 │ │GPU 服务器 3  │
     │ (打印机1-3)     │ │(打印机4-6)  │ │(打印机7-10) │
     │                │ │            │ │            │
     │ dora-rs        │ │ dora-rs    │ │ dora-rs    │
     │ dataflow:      │ │ dataflow:  │ │ dataflow:  │
     │ RTSP→NVDEC    │ │ 同左       │ │ 同左       │
     │ →推理→停机     │ │            │ │            │
     │ →录制(.drec)   │ │            │ │            │
     │ →Bridge(→MES) │ │            │ │            │
     │                │ │            │ │            │
     │ NVIDIA GPU     │ │ NVIDIA GPU │ │ NVIDIA GPU │
     │ 40路相机        │ │ 40路相机   │ │ 20路相机    │
     └────────────────┘ └────────────┘ └────────────┘

机器内部：SHM 零拷贝（解码 → 推理 → 录制）
机器之间：网络传输（推理结果 → MES 服务器）
```

### 4.2 单台 GPU 服务器的 dataflow

```yaml
# dataflows/printer-defect-detection.yml
# 单台 3D 打印机的缺陷检测 dataflow

nodes:
  # === 采集层 ===
  - id: rtsp_capture
    path: ./nodes/rtsp_capture_node
    inputs:
      tick: dora/timer/33ms        # ~30fps
    outputs:
      - h264_packet
    env:
      RTSP_URL: "rtsp://printer-cam-01/stream"

  # === 解码层 ===
  - id: hw_decoder
    path: ./nodes/nvdec_node
    inputs:
      h264_packet: rtsp_capture
    outputs:
      - rgb_frame
    env:
      USE_CUDA_IPC: "true"          # GPU 内存零拷贝

  # === 推理层 ===
  - id: defect_detector
    path: ./nodes/inference_node    # Python + ONNX/TensorRT
    inputs:
      rgb_frame: hw_decoder
    outputs:
      - detection_result
    env:
      MODEL_PATH: "./models/defect_yolov8.onnx"
      CONFIDENCE_THRESHOLD: "0.75"

  # === 决策层 ===
  - id: decision_engine
    path: ./nodes/decision_node
    inputs:
      detection_result: defect_detector
    outputs:
      - stop_command
      - alarm_event
    env:
      STOP_RULES: |
        critical_defects: [layer_shift, warping, stringing]
        consecutive_frames: 2

  # === 执行层 ===
  - id: printer_control
    path: ./nodes/modbus_node
    inputs:
      stop_command: decision_engine
    env:
      PLC_ADDRESS: "192.168.1.50:502"
      STOP_REGISTER: "DO:0"

  # === 可观测层 ===
  - id: record_node
    path: dora-rs/rust/record
    inputs:
      h264_packet: rtsp_capture
      detection_result: defect_detector
      stop_command: decision_engine
      alarm_event: decision_engine
    env:
      FILE: "./recordings/printer_${SESSION_ID}.drec"

  - id: bridge_node
    path: ./nodes/bridge_node
    inputs:
      alarm_event: decision_engine
      detection_result: defect_detector
    env:
      MES_API_URL: "http://mes-server:3000/api"
```

### 4.3 SHM 发挥作用的关键路径

```
rtsp_capture → hw_decoder：
  H.264 包，~50KB/包 → TCP/SHM 都行

hw_decoder → defect_detector：⭐ SHM 关键路径
  解码帧 8.3MB/帧 × 30fps = 249MB/s
  NVDEC 输出在 GPU 内存 → CUDA IPC 直接共享给推理
  不经系统内存，零拷贝

hw_decoder → record_node：⭐ SHM 关键路径
  同一帧同时给推理和录制
  SHM 让两个消费者读同一块内存，不复制

defect_detector → decision_engine：
  检测结果几十字节 → HTTP 都行

decision_engine → printer_control：
  停机指令几字节 → Modbus 直连

decision_engine → bridge_node：
  报警事件几百字节 → HTTP POST
```

---

## 5. API 设计

### 5.1 REST API

```
# 相机管理
GET    /api/cameras                    # 相机列表
POST   /api/cameras                    # 添加相机
DELETE /api/cameras/{id}               # 删除相机
GET    /api/cameras/{id}/status        # 相机状态

# 视频流
GET    /api/cameras/{id}/live          # 实时视频流(WebSocket/HLS)
GET    /api/cameras/{id}/snapshot      # 截图

# 录制管理
POST   /api/cameras/{id}/record/start  # 开始录制
POST   /api/cameras/{id}/record/stop   # 停止录制
GET    /api/recordings                 # 录制列表
GET    /api/recordings/{id}/play       # 回放流
DELETE /api/recordings/{id}            # 删除录制

# AI 推理
POST   /api/cameras/{id}/analysis/start  # 启动AI分析
POST   /api/cameras/{id}/analysis/stop   # 停止AI分析
GET    /api/detections                   # 检测结果查询

# 事件与动作
GET    /api/events                     # 事件列表
POST   /api/webhooks                   # 注册 Webhook
POST   /api/actions                    # 配置动作(GPIO/Modbus/MQTT)

# 健康检查
GET    /api/health                     # GPU/CPU/存储/相机数
```

### 5.2 Webhook 推送

```json
// 检测到缺陷
POST {business_webhook_url}
{
  "event": "detection",
  "camera_id": "cam-01",
  "timestamp": "2026-06-23T14:30:00Z",
  "detections": [
    {"label": "layer_shift", "confidence": 0.92, "bbox": [...]}
  ],
  "image_path": "/snapshots/20260623_143000.jpg",
  "trace_id": "trace_abc123"
}

// 规则触发的停机动作
POST {business_webhook_url}
{
  "event": "action_triggered",
  "camera_id": "cam-01",
  "action": "stop_printer",
  "rule": "consecutive_2_frames_critical",
  "latency_ms": 8,
  "trace_id": "trace_abc123"
}
```

---

## 6. 仓库结构

```
videohub/                       # 独立仓库
├── Cargo.toml                  # Rust workspace
├── justfile                    # 统一构建入口
│
├── crates/                     # Rust 核心库
│   ├── core/                   # 核心类型/配置/错误处理
│   ├── capture/                # RTSP/WebRTC/V4L2 采集
│   ├── decoder/                # NVDEC 硬解码
│   ├── inference/              # AI 推理引擎（Python FFI）
│   ├── recorder/               # 录制管理(.drec)
│   ├── events/                 # 事件引擎 + 规则匹配
│   ├── actions/                # 动作输出(Webhook/GPIO/Modbus/MQTT)
│   └── api/                    # REST API 服务器(axum)
│
├── nodes/                      # dora-rs 节点
│   ├── capture_node/           # 采集节点
│   ├── decoder_node/           # 解码节点
│   ├── inference_node/         # 推理节点（Python + PyO3）
│   ├── decision_node/          # 决策节点
│   ├── action_node/            # 动作节点
│   └── record_node/            # 录制节点
│
├── dataflows/                  # dora-rs dataflow 模板
│   ├── basic-record.yml        # 纯录制（无AI）
│   ├── defect-detection.yml    # 缺陷检测+停机
│   └── multi-camera.yml        # 多路相机
│
├── frontend/                   # 轻量管理界面
│   ├── index.html              # 单页 HTML
│   ├── app.js                  # Alpine.js
│   └── style.css               # Tailwind (CDN)
│
├── models/                     # 预置 AI 模型
│   └── defect_yolov8.onnx
│
├── config/
│   ├── default.toml
│   └── cameras.example.yaml
│
├── docker-compose.yml
└── README.md
```

### 6.1 前端技术选择

```
MODACS Vision 自带轻量管理界面（不引入 React 大工程）：

├── 相机管理页（列表+添加+状态）
├── 视频墙页（多路实时预览，网格布局）
├── 回放页（时间轴+播放器）
├── 检测结果页（缺陷图片列表+筛选）
├── 规则配置页（简单表单）
└── 系统状态页（GPU利用率/存储/相机在线率）

推荐：纯 HTML + Alpine.js + Tailwind（最简，像 OpenMES）
原因：MODACS Vision 的前端很简单，不需要 React
```

---

## 7. 与 MES 的协作场景

### 7.1 正常生产流程

```
1. MES 创建工单（WO-001，产品：3D打印零件A）
2. 工人启动工单 → MES 状态变为 in_progress
3. MES 调 MODACS Vision API：POST /api/cameras/cam-01/analysis/start
   body: { work_order_id: "WO-001", printer_id: "P-01" }
4. MODACS Vision 启动 dataflow（RTSP采集→解码→推理→录制）
5. 3D 打印机开始打印
6. MODACS Vision 持续检测，每帧推理结果存数据库
7. 打印完成，工人报工 → MES 调 MODACS Vision API：POST /cameras/cam-01/analysis/stop
8. MODACS Vision 停止 dataflow，关闭录制
```

### 7.2 检测到缺陷→停机

```
1. 推理节点检测到缺陷（confidence=0.92, type=layer_shift）
2. 决策引擎：连续2帧同类缺陷 → 触发停机
3. 停机指令 → Modbus 写 PLC → 打印机停止           ← < 10ms
4. 决策引擎输出 alarm_event → bridge-node
5. bridge-node → POST /api/mes/alarms               ← < 100ms
6. MES 收到报警 → 更新工单状态为 paused
7. MES WebSocket 推送 → 前端弹窗显示报警
8. 工人查看报警 → 处理 → 恢复打印或报废
```

### 7.3 事后追溯回放

```
1. 质量问题：客户反馈某批次零件有缺陷
2. MES 查工单 WO-001 → event_log 找到 trace_id=trace_abc123
3. MES 调 MODACS Vision API：GET /api/detections?trace_id=trace_abc123
4. MES 调 MODACS Vision API：GET /api/recordings?camera=cam-01&from=...&to=...
5. MODACS Vision 回放 .drec → 完整还原视频流+推理结果+停机指令
6. 完整追溯：哪个相机、什么时间、检测到什么、为什么停机
```

---

## 8. 数据库设计

```sql
-- MODACS Vision 自己的 schema（与 MES 共享 PostgreSQL 实例）
CREATE SCHEMA vision;

CREATE TABLE vision.detection_results (
    id          BIGSERIAL PRIMARY KEY,
    camera_id   TEXT NOT NULL,
    printer_id  TEXT,
    work_order_id BIGINT,              -- 关联工单（可为空）
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    defect_type TEXT,
    confidence  DOUBLE PRECISION,
    bbox        JSONB,
    image_path  TEXT,
    action_taken TEXT,                 -- stopped / logged / ignored
    trace_id    TEXT                   -- 关联 .drec 录制
);

CREATE TABLE vision.cameras (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    rtsp_url    TEXT NOT NULL,
    printer_id  TEXT,
    gpu_server  TEXT,
    status      TEXT DEFAULT 'offline'
);

CREATE TABLE vision.stop_events (
    id          BIGSERIAL PRIMARY KEY,
    printer_id  TEXT NOT NULL,
    camera_id   TEXT NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    defect_type TEXT NOT NULL,
    stop_command_sent BOOLEAN DEFAULT false,
    printer_stopped BOOLEAN DEFAULT false,
    stop_latency_ms INTEGER,
    trace_id    TEXT
);
```

---

## 9. 映射到架构体系

```
MODACS（平台愿景）
├── MODACS（决策层/业务系统）
│   ├── mes-system          ← 第一个应用（Carbon fork）
│   ├── erp-system          ← 未来
│   └── oa-system           ← 未来
│
├── MODACS Act（执行层/实时系统）
│   ├── videohub            ← 第一个应用 ⭐ 本文档
│   ├── soft-plc            ← 未来
│   └── motion-controller   ← 未来
│
└── generic-core（共享层）
    ├── MODACS Link 中间件抽象
    └── dora-rs 封装

→ MODACS Vision 是 MODACS Act 的首个独立产品
→ 今天服务 MES，明天服务 MaxSense，后天服务任何需要视频的项目
→ 完全独立的仓库、独立部署、独立版本号
```

---

*本文档与 [MODACS-Overview](./MODACS-Overview.md)、[MODACS-Act](./MODACS-Act.md) 互补。前者定义平台架构，本文档定义 MODACS Act 的首个落地产品。*
