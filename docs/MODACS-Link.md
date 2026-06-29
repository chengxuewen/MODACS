# MODACS Link：中间件抽象层白皮书

**版本**：1.4  
**日期**：2026-06-26  
**状态**：正式发布  
**项目**：MODACS（Modular On-Demand Application Composition System）— MODACS Link 子产品

> **架构定位说明**（2026-06-26）：
> MODACS 平台核心已迁移至 TypeScript + Node.js + Hono 技术栈，采用 Odoo 式进程内模块加载。
> MODACS Link 是 **Podman 隔离模块**（Act/Vision）内部的通信中间件，不是平台业务层的组件。
> 平台业务模块（MES/ERP/OA）之间的通信用进程内 `container.resolve()` + EventEmitter，不需要 MODACS Link。
> 本文描述的 Rust + dora-rs + CMake 技术栈仅适用于 Link 模块内部，不影响平台核心的 TS/Node.js 技术栈。


## 1. 执行摘要

**MODACS Link**（中间件抽象层，Middleware Layer Abstraction）是 MODACS 项目的核心基础设施组件。它旨在解决当前机器人、工业控制和 AI 应用开发中面临的一个根本性问题：**业务逻辑与底层通信机制高度耦合**，导致技术选型锁定、系统迁移困难、性能优化受限。

MODACS Link 的设计目标是提供一个**统一的、可插拔的通信与存储抽象层**，使上层业务应用能在 ROS 2、dora-rs、Zenoh 等不同底层中间件之间无缝切换，而无需修改任何业务代码。这一设计理念借鉴了 ROS 2 的 RMW（ROS Middleware）抽象机制，并参考了 dora-rs 官方规划的 MLA 架构。

**核心价值主张：**

- **技术自由**：业务逻辑与通信机制彻底解耦，消除技术锁定
- **性能灵活**：根据场景选择最优底层实现（极致性能选dora-rs，生态丰富选ROS 2）
- **平滑演进**：支持在运行时或编译时切换中间件，降低迁移风险
- **渐进式自研**：支持从使用成熟框架到自研底层实现的平滑过渡路径
- **构建体验**：以CMake的IDE亲和性为基石，兼顾命令行统一体验
- **面向未来**：为新技术（如新一代DDS、Zenoh演进版本）预留接入能力


## 2. 背景与动机

### 2.1 当前困境

在机器人、工业控制和AI应用开发中，开发者面临两难选择：

| 中间件 | 优势 | 劣势 |
| :--- | :--- | :--- |
| **ROS 2** | 生态庞大（Nav2、MoveIt、Gazebo）、社区活跃、工具链成熟 | 性能开销高（延迟比dora-rs高10-17倍）、资源消耗大、嵌入式不友好 |
| **dora-rs** | 极致性能（零拷贝共享内存、Apache Arrow）、100% Rust、低延迟 | 生态相对年轻、部分功能仍在开发中 |
| **Zenoh** | 轻量级、分布式、统一数据流 | 通信模式支持有限（非所有模式都原生支持） |

**问题根源**：业务应用一旦选定中间件，便被锁定在该技术栈上，无法根据场景灵活切换，也无法平滑迁移到更优的技术方案。

### 2.2 MODACS Link 的解决思路

MODACS Link 通过在**业务应用层**与**底层中间件**之间插入一个抽象层，实现：

```
┌─────────────────────────────────────────────────────────────┐
│                   业务应用层（MODACS）                       │
│         （MES、ERP、控制器、组态上位机等）                   │
├─────────────────────────────────────────────────────────────┤
│              ★ 中间件抽象层（MODACS Link）★                  │
│    统一API：publish / subscribe / request / reply           │
│    统一数据格式：Apache Arrow                               │
├─────────────────────────────────────────────────────────────┤
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ dora-rs  │  │ ROS 2    │  │  Zenoh   │  │ 自研实现  │   │
│   │ 适配器   │  │ 适配器   │  │ 适配器   │  │ 适配器   │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

这种分层设计使业务代码完全感知不到底层中间件的存在，实现了**真正的技术中立**。


## 3. 设计目标

### 3.1 核心目标

| 目标 | 描述 | 优先级 |
| :--- | :--- | :--- |
| **通信模式全覆盖** | 支持发布-订阅（推送/推送、推送/拉取）、请求-应答、点对点、客户端-服务器等模式 | P0 |
| **传输层可插拔** | 抽象进程内（线程通道）、进程间（共享内存）、主机间/网络间（UDP/TCP）通信 | P0 |
| **序列化格式无关** | 内置支持Cap'n Proto、Protobuf、FlatBuffers等，并可扩展 | P1 |
| **多语言绑定** | 提供Rust、Python、C、C++的原生API | P1 |
| **可观测性** | 集成日志、指标、分布式追踪、实时数据监控、录制与回放 | P1 |
| **高性能** | 零拷贝数据传输、低延迟、高吞吐量 | P0 |
| **渐进式自研** | 支持从使用成熟框架到逐步替换为自研实现的演进路径 | P1 |
| **构建体验** | IDE亲和性优先，命令行统一入口为辅 | P1 |

### 3.2 设计原则

1. **零开销抽象**：抽象层不应引入显著的性能损耗，关键路径上使用零拷贝机制
2. **渐进式采用**：支持从简单到复杂的渐进式接入，不强制一次性全面迁移
3. **生态兼容**：优先复用现有成熟实现，避免重复造轮
4. **面向接口编程**：所有对外API以Rust Trait定义，实现与接口严格分离
5. **演进友好**：支持在不影响业务代码的前提下，逐步替换底层实现
6. **IDE优先**：构建系统以IDE亲和性为首要考量，同时提供命令行能力


## 4. 构建系统设计

### 4.1 设计理念

MODACS项目的构建系统采用 **“CMake为基石 + just为统一入口”** 的双层架构。

| 层级 | 组件 | 职责 | 用户 |
| :--- | :--- | :--- | :--- |
| **用户接口层** | `just` / `make` | 提供类似`colcon`的统一命令行体验 | CLI用户、CI/CD |
| **构建核心层** | `CMake` | IDE亲和的多语言构建调度 | IDE用户、开发者 |
| **语言工具层** | `cargo` / `pip` / `npm` | 各语言原生构建工具 | CMake调用 |

**核心原则**：开发者80%的时间在IDE中工作，构建系统应为此优化。命令行能力作为补充，服务于CI/CD和自动化场景。

### 4.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    开发者工作流                             │
├─────────────────────────────────────────────────────────────┤
│   ┌─────────────────┐         ┌─────────────────────────┐   │
│   │  IDE 模式       │         │  命令行模式              │   │
│   │ (VS Code/CLion) │         │  (CI/CD / 自动化)       │   │
│   └────────┬────────┘         └───────────┬─────────────┘   │
│            │                              │                   │
│            └──────────┬───────────────────┘                   │
│                       ▼                                       │
│            ┌─────────────────────────────┐                   │
│            │       just / make           │                   │
│            │   (统一命令入口)             │                   │
│            └─────────────┬───────────────┘                   │
│                          ▼                                   │
│            ┌─────────────────────────────┐                   │
│            │       CMake                 │                   │
│            │   (构建系统核心)             │                   │
│            └─────────────┬───────────────┘                   │
│                          ▼                                   │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ Rust     │  │ C++      │  │ Python   │  │ 前端     │   │
│   │ 模块     │  │ 模块     │  │ 模块     │  │ 模块     │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 借鉴colcon的核心机制

MODACS的构建系统借鉴了`colcon`的以下优秀设计：

| colcon机制 | MODACS实现方式 |
| :--- | :--- |
| **包发现** | CMake的`add_subdirectory()`递归扫描模块目录 |
| **依赖解析** | CMake的`target_link_libraries()`声明目标依赖 |
| **隔离构建** | 每个模块独立的`build/`和`install/`目录 |
| **环境配置** | `configure_file()`生成环境`setup.sh`脚本 |
| **统一入口** | `just`命令封装所有构建操作 |
| **多语言支持** | CMake的`ExternalProject`/`Corrosion`集成 |

### 4.4 具体实现方案

#### 4.4.1 顶层CMakeLists.txt（包发现与调度）

```cmake
cmake_minimum_required(VERSION 3.20)
project(MODACS)

# 各语言模块作为独立子目录添加
add_subdirectory(rust_nodes)     # Rust模块（含Corrosion集成）
add_subdirectory(cpp_nodes)      # C++模块（原生CMake）
add_subdirectory(python_nodes)   # Python模块（pybind11）
add_subdirectory(frontend)       # 前端模块（Node.js）
```

#### 4.4.2 Rust模块集成（使用Corrosion）

```cmake
# rust_nodes/CMakeLists.txt
find_package(Corrosion REQUIRED)

corrosion_import_crate(MODACS_RUST_LIB
    MANIFEST_PATH ${CMAKE_CURRENT_SOURCE_DIR}/Cargo.toml
)

target_link_libraries(modacs_cpp_node PRIVATE MODACS_RUST_LIB)
```

#### 4.4.3 Python模块集成

```cmake
# python_nodes/CMakeLists.txt
find_package(Python3 COMPONENTS Interpreter Development REQUIRED)

add_custom_target(build_python ALL
    COMMAND ${Python3_EXECUTABLE} -m pip install -e ${CMAKE_CURRENT_SOURCE_DIR}
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    COMMENT "Installing Python module in development mode"
)
```

#### 4.4.4 统一命令行入口（justfile）

```makefile
# 类似 colcon build 的统一命令
build:
    cmake -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --parallel

# 开发模式（Debug）
dev:
    cmake -B build -DCMAKE_BUILD_TYPE=Debug
    cmake --build build --parallel

# 运行测试
test: build
    cmake --build build --target test

# 清理构建产物
clean:
    rm -rf build

# 生成环境设置脚本
setup:
    cmake -B build
    @echo "Run: source build/setup.sh to set environment"

# IDE项目生成（如需要）
ide:
    cmake -B build -G "Visual Studio 17 2022"  # Windows
    # cmake -B build -G "Xcode"                # macOS
    # cmake -B build -G "Ninja"                # Linux
```

### 4.5 与colcon的对比总结

| 特性 | colcon | MODACS构建系统 |
| :--- | :--- | :--- |
| **IDE亲和性** | 弱（需插件支持） | **强**（CMake原生） |
| **命令行统一** | ✅ colcon build | ✅ just build |
| **多语言支持** | 通过插件扩展 | 通过CMake原生支持 |
| **调试体验** | 依赖外部工具 | **IDE原生调试** |
| **错误定位** | 终端输出 | **IDE一键跳转** |
| **学习曲线** | 需学习colcon语法 | 熟悉CMake即可 |
| **CI/CD友好** | ✅ | ✅ |


## 5. 渐进式演进路径

MODACS Link 的核心战略价值在于支持从"使用成熟框架"到"自研底层实现"的平滑演进。以下四阶段路径是 MODACS Link 设计的核心指导思想。

### 5.1 阶段一：以dora-rs为底座，快速启动

**目标**：项目快速上线，业务验证优先。

**策略**：直接利用dora-rs成熟的高性能数据流引擎作为MODACS的底层通信底座，启动业务功能开发。此阶段不引入任何抽象层，追求最短的业务交付周期。

**关键产出**：可运行的MODACS业务原型。

### 5.2 阶段二：通过dora-rs接入ROS 2生态

**目标**：复用ROS 2的成熟生态资源。

**策略**：在dora-rs数据流中，通过官方ROS 2 Bridge接入ROS 2节点。dora-rs的ROS 2 Bridge使用纯Rust DDS/RTPS协议栈，在边界处将ROS 2的CDR数据格式与Apache Arrow互转。

**两种使用方式**：

- **YAML动态桥接（推荐）** ：在数据流定义中为节点添加`ros2:`配置，框架自动生成桥接节点，业务代码零ROS 2感知。
- **原生代码API**：在节点代码中调用`dora.Ros2Context` API，命令式控制ROS 2交互。

⚠️ **注意**：此功能目前标记为 **“不稳定”（unstable）** ，用于原型验证足够，生产环境需谨慎评估。

**关键产出**：能够同时运行dora-rs原生节点和ROS 2节点的混合系统。

### 5.3 阶段三：设计并实现 MODACS Link 抽象层

**目标**：实现“业务与底层分离”，为自研铺路。

**策略**：在业务代码和底层框架之间插入由你定义的稳定抽象层。业务代码只依赖抽象接口，底层可以是dora-rs、ROS 2或未来的自研实现。

**关键产出**：业务代码与底层通信机制彻底解耦的架构。

### 5.4 阶段四：开发自研底层实现

**目标**：拥有完全自主可控的底层系统。

**策略**：在 MODACS Link 框架内，开发自己的底层通信实现。可以借鉴 dora-rs 的高性能数据流和零拷贝设计，以及 ROS 2 `rmw` 的抽象接口设计，吸收两者优点并实现自主创新。

**低成本切入点**：dora-rs支持编写拥有完整控制权的 **“自定义节点”** 。可以从在个别模块上用自研通信替换dora-rs默认通信开始，逐步扩大自研范围。

**关键产出**：完全自研、自主可控的底层通信系统，业务代码零修改。


## 6. 功能规格

### 6.1 通信模式

MODACS Link 需要支持以下通信模式：

| 模式 | 描述 | 典型场景 |
| :--- | :--- | :--- |
| **发布-订阅（推送/推送）** | 发布者推送消息，订阅者实时接收 | 传感器数据分发、状态广播 |
| **发布-订阅（推送/拉取）** | 发布者写入存储，订阅者按需拉取 | 历史数据回放、离线分析 |
| **请求-应答** | 客户端发送请求，服务端返回响应 | RPC调用、服务查询 |
| **点对点** | 两个节点间直接通信 | 控制指令下发、配置同步 |
| **客户端-服务器** | 多客户端连接单服务器 | 集中式服务、资源管理 |

### 6.2 核心API

MODACS Link 提供以下高级API：

```rust
// 发布接口
pub trait Publisher {
    fn publish(&self, topic: &str, value: &[u8], opts: Option<Fields>) -> Result<()>;
}

// 订阅接口
pub trait Subscriber {
    fn subscribe(&self, topic: &str, opts: Option<Fields>) -> Result<Box<dyn Stream<Item = Vec<u8>>>>;
}

// 键值存储接口
pub trait KeyValueStore {
    fn put(&self, key: &str, value: &[u8], opts: Option<Fields>) -> Result<()>;
    fn get(&self, key: &str, opts: Option<Fields>) -> Result<Vec<u8>>;
}

// 消息传递接口
pub trait MessagePassing {
    fn send(&self, key: &str, msg: &[u8], opts: Option<Fields>) -> Result<()>;
    fn recv(&self, key: &str, opts: Option<Fields>) -> Result<Vec<u8>>;
}
```

### 6.3 数据格式

MODACS Link 采用 **Apache Arrow** 作为统一内存数据格式：

- **零拷贝**：数据在节点间传递时无需序列化/反序列化
- **列式存储**：对数据分析和处理友好
- **跨语言**：支持Rust、Python、C++等多语言互操作
- **生态兼容**：可通过`mcap2arrow`等工具与MCAP存储格式互转

### 6.4 可插拔架构

MODACS Link 的架构设计为分层可插拔：

```
modacs-link/
├── Encoding Layer/          # 序列化层
│   ├── Cap'n Proto
│   ├── Protobuf
│   └── FlatBuffers
├── PubSub Communication Layer/   # 发布-订阅通信层
│   ├── Zenoh
│   ├── Iceoryx
│   └── dora-rs原生
├── Request/Reply Layer/     # 请求-应答层
│   ├── Tonic (gRPC)
│   └── Tower
├── Point-to-Point Layer/    # 点对点层
│   └── Tokio 通道
└── Extensions/              # 扩展层
    ├── Recording/Replay
    └── OpenTelemetry
```

### 6.5 可观测性

MODACS Link 内置完整的可观测性支持：

- **日志**：结构化日志，支持多级别过滤
- **指标**：Prometheus兼容的指标采集（吞吐量、延迟、错误率）
- **分布式追踪**：OpenTelemetry集成，支持跨节点追踪
- **实时数据监控**：支持数据流实时“TAP”监听
- **录制与回放**：支持数据流录制和离线回放调试


## 7. 底层适配器设计

### 7.1 dora-rs适配器

dora-rs原生支持Apache Arrow和零拷贝通信，适配工作量最小：

- **通信层**：直接使用dora-rs的Zenoh-based通信层
- **数据格式**：原生Arrow格式，无需转换
- **节点模型**：映射到dora-rs的Node/Operator模型
- **部署**：支持dora-rs的分布式集群部署

### 7.2 ROS 2适配器

ROS 2适配器基于dora-rs官方的 **ROS 2 Bridge** 实现：

- **无rcl依赖**：使用纯Rust DDS/RTPS协议栈，不链接`rcl`/`rclcpp`
- **数据转换**：在边界处将ROS 2 CDR格式与Apache Arrow StructArray互转
- **功能覆盖**：支持Topics、Services、Actions、QoS策略

### 7.3 自研底层实现适配器

自研底层实现通过 MODACS Link 接入，业务代码零感知：

- **参考对象**：dora-rs的高性能数据流设计、ROS 2 `rmw`的抽象接口设计
- **复用组件**：Tokio通道、Tonic gRPC、Zenoh等成熟Rust生态组件
- **渐进路径**：从“自定义节点”开始，逐步扩大自研范围
- **完全自主**：最终实现完全自主可控的底层通信系统


## 8. 开发路线图

### 阶段一：基础框架与构建系统（第1-2个月）

**目标**：完成 MODACS Link 核心接口定义、基础实现和构建系统搭建

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M1.1 | 定义核心Trait（Publisher、Subscriber、RequestReply等） | 🔲 |
| M1.2 | 实现Apache Arrow作为统一数据格式 | 🔲 |
| M1.3 | 搭建CMake + just构建系统骨架 | 🔲 |
| M1.4 | 实现dora-rs适配器（最小可用版本） | 🔲 |
| M1.5 | 实现dora-rs的ROS 2 Bridge适配器 | 🔲 |
| M1.6 | 实现运行时切换机制（环境变量/配置文件驱动） | 🔲 |
| M1.7 | 编写示例demo：在同一应用中间切换dora-rs和ROS 2 | 🔲 |

### 阶段二：功能完善（第3-4个月）

**目标**：覆盖全部通信模式，完善多语言支持

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M2.1 | 实现点对点（Point-to-Point）通信模式 | 🔲 |
| M2.2 | 实现客户端-服务器（Client-Server）模式 | 🔲 |
| M2.3 | 实现推送-拉取（Push-Pull）发布订阅模式 | 🔲 |
| M2.4 | Python语言绑定 | 🔲 |
| M2.5 | C/C++语言绑定 | 🔲 |
| M2.6 | 实现多种序列化格式支持（Protobuf、Cap'n Proto） | 🔲 |

### 阶段三：可观测性与工具链（第5-6个月）

**目标**：完善录制回放、监控、调试能力

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M3.1 | 实现数据流录制（Record）功能 | 🔲 |
| M3.2 | 实现数据流回放（Replay）功能 | 🔲 |
| M3.3 | 集成OpenTelemetry（日志、指标、追踪） | 🔲 |
| M3.4 | 实现实时数据监控（TAP）功能 | 🔲 |
| M3.5 | 统一CLI工具（`mla`命令） | 🔲 |
| M3.6 | 完善错误处理和容错机制 | 🔲 |

### 阶段四：生产就绪与自研（第7-12个月）

**目标**：性能优化、文档完善、启动自研底层实现

| 里程碑 | 交付物 | 状态 |
| :--- | :--- | :--- |
| M4.1 | 性能基准测试与优化（对标dora-rs原生性能） | 🔲 |
| M4.2 | 完整的API文档和用户指南 | 🔲 |
| M4.3 | 与dora-rs官方MLA路线对齐 | 🔲 |
| M4.4 | 作为独立crate发布到crates.io | 🔲 |
| M4.5 | 首个自研“自定义节点”原型验证 | 🔲 |
| M4.6 | 首个稳定版本（v1.0.0）发布 | 🔲 |


## 9. 技术选型说明

### 9.1 为什么选择Rust？

- **性能**：零成本抽象，与C/C++相当的内存和CPU效率
- **安全**：编译期内存安全保证
- **生态**：丰富的中间件crate（Zenoh、Tonic、Tower、Tokio）
- **与dora-rs一致**：dora-rs本身就是100% Rust框架

### 9.2 为什么选择Apache Arrow？

- **零拷贝**：数据在节点间传递无需序列化
- **列式格式**：对数据分析和AI处理友好
- **跨语言**：Rust、Python、C++等原生支持
- **生态连接**：可通过`mcap2arrow`与MCAP存储格式互通

### 9.3 为什么选择Zenoh作为默认通信层？

- **轻量级**：最小开销仅5字节，支持LPWAN
- **统一数据流**：动态数据、静态数据、计算统一框架
- **分布式原生**：支持从微控制器到数据中心的扩展

### 9.4 为什么选择CMake + just构建方案？

| 考量 | 选择理由 |
| :--- | :--- |
| **IDE亲和性** | CMake是C++/Rust混合项目的IDE标准，VS Code/CLion/Qt Creator均深度支持 |
| **多语言集成** | CMake通过ExternalProject、Corrosion、pybind11等原生支持多语言 |
| **渐进式复杂度** | 新手可用`just build`，高级用户可直接使用CMake完整能力 |
| **CI/CD友好** | CMake命令行模式与just脚本化能力完美配合 |
| **经验复用** | 10年Qt/C++经验，CMake是已熟练掌握的工具 |


## 10. 与相关项目的对比

| 特性            | **MODACS Link（本项目）** | **ROS 2 RMW** | **dora-rs MLA（规划中）** |
| :------------ | :---------------- | :------------ | :------------------- |
| **设计状态**      | ✅ 已设计             | ✅ 已实现         | 🚧 设计中               |
| **默认通信层**     | Zenoh             | DDS           | Zenoh                |
| **数据格式**      | Apache Arrow      | CDR           | Apache Arrow         |
| **ROS 2兼容**   | ✅ 通过桥接器           | ✅ 原生          | ✅ 通过桥接器              |
| **dora-rs兼容** | ✅ 原生              | ❌             | ✅ 原生                 |
| **自研底层支持**    | ✅ 支持渐进式自研         | ❌             | ❌                    |
| **录制回放**      | ✅ 规划中             | ✅ rosbag2     | ✅ 规划中                |
| **构建系统**      | CMake + just      | colcon        | Cargo                |
| **IDE亲和性**    | ✅ 高               | ⚠️ 低          | ✅ 中                  |
| **多语言绑定**     | Rust/Python/C/C++ | C++/Python    | Rust/Python/C/C++    |


## 11. 风险与应对

| 风险 | 影响 | 应对策略 |
| :--- | :--- | :--- |
| **抽象层性能损耗** | 高 | 采用零拷贝Arrow格式；关键路径避免额外序列化；基准测试驱动优化 |
| **dora-rs MLA演进不同步** | 中 | 保持与dora-rs社区沟通；设计上预留兼容接口 |
| **ROS 2 Bridge稳定性** | 中 | 标记为实验性功能；逐步完善；提供降级方案 |
| **自研底层复杂度** | 中 | 渐进式路径，从“自定义节点”开始，逐步扩大范围 |
| **多语言绑定维护成本** | 中 | 优先Rust和Python；C/C++绑定使用FFI自动生成 |
| **构建系统复杂度** | 中 | 保持just命令简洁；CMake部分分模块管理 |
| **社区接受度** | 低 | 开源发布；完善文档；积极贡献dora-rs社区 |


## 12. 总结

MODACS Link（中间件抽象层）是 MODACS 项目的核心技术底座。通过提供统一的通信与存储抽象，MODACS Link 使业务应用能在 dora-rs、ROS 2、Zenoh 等不同底层中间件之间无缝切换，并支持**渐进式地开发自己的底层实现**。

**核心价值回顾：**

1. **业务与底层分离**：业务代码零感知，切换中间件无需修改代码
2. **性能与生态兼得**：需要极致性能时用dora-rs，需要丰富生态时用ROS 2
3. **渐进式自研能力**：支持从使用dora-rs → 接入ROS 2 → MODACS Link 抽象 → 自研底层的完整演进路径
4. **面向未来设计**：新技术出现时只需新增适配器，无需重构业务
5. **构建体验优化**：以CMake的IDE亲和性为基石，以just提供统一命令行体验
6. **社区对齐**：与dora-rs官方MLA路线一致，可形成合力


## 附录A：参考资料

| 资料                                | 链接                                                            |
| :-------------------------------- | :------------------------------------------------------------ |
| dora-rs MLA 设计文档（中文）              | https://dora-rs.ai/zh-CN/docs/references/communication-layer/ |
| dora-rs MLA 设计文档（英文）              | https://dora-rs.ai/docs/references/communication-layer/       |
| dora-rs MLA GitHub Discussion #53 | https://github.com/dora-rs/dora/discussions/53                |
| dora-rs ROS 2 Bridge 文档           | https://dora-rs.ai/dora/advanced/ros2-bridge                  |
| dora-rs 性能基准                      | https://dora-rs.ai/performance/                               |


## 附录B：术语表

| 术语               | 释义                                               |
| :--------------- | :----------------------------------------------- |
| **MODACS Link** | 中间件抽象层（Middleware Layer Abstraction），MODACS 通信中间件 |
| **RMW**          | ROS Middleware Abstraction，ROS中间件抽象              |
| **MODACS**       | Modular On-Demand Application Composition System |
| **dora-rs**      | Dataflow-Oriented Robotics Architecture          |
| **ROS 2**        | Robot Operating System 2                         |
| **Apache Arrow** | 跨语言的内存列式数据格式                                     |
| **Zenoh**        | 轻量级、分布式通信协议                                      |
| **零拷贝**          | 数据在传输过程中无需复制和序列化                                 |
| **Corrosion**    | CMake的Rust集成工具                                   |
| **just**         | 现代化的命令运行器，类似make但更简洁                             |

---

*本文档采用 [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/) 授权。*
*文档版本 1.2 | 最后更新：2026-06-16*