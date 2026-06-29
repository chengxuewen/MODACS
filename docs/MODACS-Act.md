# MODACS Act

> **2026-06-23 更名**：Actuaium → MODACS Act。作为 MODACS 平台品牌的执行层产品。
>
> **⚠️ 架构定位说明**（2026-06-26）：
> MODACS 平台核心已迁移至 TypeScript + Node.js + Hono，采用 Odoo 式进程内模块加载。
> MODACS Act 是 **Podman 隔离模块**，使用 Rust + dora-rs 技术栈，通过 HTTP API 与平台核心通信。
> 下方"generic-core 共享层"概念已废弃，Act 不再与平台共享 Rust 核心库，而是独立容器化部署。
> 产品描述中的技术能力（软 PLC、CNC、SCADA）仍然有效。

以下是为 **MODACS Act** 项目撰写的官方描述，适合置于 GitHub README、项目官网或技术文档中。

---

## MODACS Act

**实时工业控制底座 —— 扎根执行层，驱动物理世界**

### 🎯 项目定位

**MODACS Act** 是一个基于 [dora-rs](https://github.com/dora-rs/dora) 构建的**高性能实时工业控制平台**。聚焦于 **PLC、CNC、DCS、SCADA** 等执行层场景，提供亚毫秒级确定性控制、实时数据采集与设备抽象。与同族产品 [MODACS Core](https://github.com/modacs)（企业应用平台）协同，构成从车间到决策层的完整工业软件栈。

```
MODACS Core（决策层）      MODACS Act（执行层）
┌─────────────────┐       ┌─────────────────────┐
│ ERP / OA        │  ←→  │ 软 PLC (IEC 61131-3) │
│ MES / 排班      │       │ CNC / DCS            │
│ 数据模型 / BI   │       │ SCADA (Modbus/OPC)   │
└─────────────────┘       └─────────────────────┘
        ↕                         ↕
   generic-core (Rust + dora-rs 共享层)
```

### 🧱 核心能力

- **软 PLC 引擎**：基于数据流模型的实时逻辑执行，支持 IEC 61131-3 标准指令集（规划中），提供亚毫秒级确定性控制。
- **CNC / 运动控制**：多轴插补、轨迹规划、G 代码解析，面向机床与机器人。
- **DCS 分布式控制**：多节点协同、冗余容错、确定性网络通信。
- **SCADA 监控层**：实时数据采集、报警管理、历史趋势，兼容 Modbus、OPC UA、MQTT、Profinet、EtherCAT 等主流工业协议。
- **HMI 可视化**：Web 组态界面，可拖拽构建仪表盘与操作面板。

### ⚙️ 技术架构

- **底层引擎**：[dora-rs](https://github.com/dora-rs/dora) —— 零拷贝、共享内存数据流，比 ROS 2 快 10–17 倍。
- **开发语言**：Rust（核心） + Python/C++（插件节点），多语言 SDK 自由混用。
- **通信模型**：声明式数据流图（YAML），支持运行时动态增减节点（热插拔）。
- **部署方式**：单机、边缘集群、云端（原生支持 SSH 集群与 Kubernetes）。
- **实时性**：基于 Linux PREEMPT_RT / Xenomai，支持硬实时调度。
- **可观测性**：内置 OpenTelemetry 分布式追踪 + 命令行监控工具 `dora top`。

### 🔌 模块化设计 —— "控制底座 + 协议插件"

Actuaium 遵循 **"一处核心，无限扩展"** 的设计哲学：

- **底座（Actuaium Core）**：提供数据流编排、设备抽象、实时调度引擎、安全认证等基础服务。
- **插件（Actuaium Plugins）**：通过 YAML 定义的数据流节点实现功能热插拔，支持：

  - 工业协议驱动（Modbus、Profinet、EtherCAT、OPC UA、MQTT）
  - 控制算法库（PID、运动规划、状态估计）
  - 设备模型（电机、阀门、传感器、机器人关节）
  - 可视化组件（Web 组态、3D 数字孪生）

### 🚀 适用场景

- 智能工厂设备层升级（替换传统 PLC + SCADA 烟囱式架构）
- 3D 打印农场群控（实时任务分发与状态监控）
- 机器人工作站协同（基于 dora-rs 的异构机器人调度）
- 数控机床控制器原型开发与验证
- 产教融合实训平台（快速搭建工业 4.0 教学环境）

### 📦 名称由来

**Actuaium** 融合自 **Actuator（执行器）** 与拉丁语后缀 **-ium**（表示"领域"或"集合体"）。

> *"执行器"是工业自动化的最末端指令接收者，是机器最终"动起来"的驱动力。Actuaium 取此词根，寓意平台**扎根于执行层**——负责将决策转化为物理动作。它与 MODACS（决策层）构成完整闭环：**MODACS 规划，Actuaium 执行。** *

> 注：命名过程中曾考虑简化拼写为 Actuium，但经全球商标查重发现与 VINCI Energies 旗下 Actemium（570 个业务单元、38 个国家，业务覆盖 PLC/SCADA/MES）仅差一个字母，存在商标冲突风险。Actuaium 的四字母差异确保了法律安全性，轻微的发音复杂度可通过品牌运营化解。

### 🧩 状态与路线图

- **当前阶段**：核心数据流引擎已完成，软 PLC 原型验证通过，SCADA 基础节点可用。
- **短期（6 个月）**：完善 Modbus/OPC UA 驱动节点，发布 Web HMI 组态编辑器。
- **中期（1 年）**：推出 CNC 运动控制模块，支持分布式 DCS 集群部署。
- **长期（2 年）**：集成 AI 规划器，实现自适应控制与预测性维护。

### 📄 许可证

Actuaium 核心采用 **MIT 许可证**，插件可按需选择兼容的开源协议（鼓励 MIT/Apache 2.0）。
