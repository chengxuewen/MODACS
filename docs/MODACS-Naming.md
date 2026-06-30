以下是根据多轮讨论及团队模式分析整理的项目命名白皮书，涵盖背景、命名原则、候选分析及最终推荐。

---

# MODACS：企业应用开发底座项目命名白皮书

**版本**：4.0  
**日期**：2026-06-26  
**状态**：终稿（含系列产品命名）  

---

## 1. 项目背景与定位

本项目旨在构建一个 **开源、模块化、可组合的企业应用开发底座**，底层基于 TypeScript + Node.js + Hono，借鉴 Odoo 的模块化能力和 NocoBase 的插件架构，支持快速搭建 MES、ERP、OA、排班等企业级业务系统。

核心设计哲学：**像搭积木一样组合功能** —— 开发者可按需选择模块，自由装配，形成完整的业务解决方案。

技术关键词：`TypeScript`, `Node.js`, `pnpm`, `模块化`，`可组合`，`开放`，`企业级`。

---

## 2. 命名目标与原则

我们为项目命名设定了以下核心目标：

| 目标 | 说明 |
|------|------|
| **专业性** | 类似 SCADA、MES、ERP 等工业/企业软件缩写，沉稳可信 |
| **独特性** | 避免与现有知名开源项目、商业产品、商标冲突 |
| **语义准确性** | 名称本身能传达"模块化、可组合、按需构建"的核心理念 |
| **可传播性** | 拼写简短，发音流畅，易于记忆和国际化传播 |
| **品牌可扩展性** | 便于衍生子产品（如 Studio、Cloud、Core） |

### 反模式：避免 "Open" 前缀

在命名过程中，我们明确排除了 `OpenMODACS` 等带 "Open" 前缀的方案，原因如下：

| 问题 | 说明 |
|------|------|
| **品牌廉价化** | "Open" 是开源圈最滥用的前缀（OpenStack、OpenMRS、OpenProject…），用户大脑自动过滤 |
| **企业客户反感** | 企业采购决策者看到 "Open" 的第一反应是"免费=不靠谱"，而非"开源=灵活" |
| **历史教训** | Odoo 花 9 年才摆脱 "OpenERP" 这个名字，创始人总结："它让我们看起来像又一个开源克隆品" |
| **冗余信息** | Apache 2.0 许可证本身就能证明开源，不需要写在名字里 |

> **原则：好的项目名不需要前缀来证明自己开源。**

---

## 3. 命名历程回顾

在过去的多轮讨论中，我们先后评估了数十个候选名称，主要经历了以下几个阶段：

| 阶段 | 代表名称 | 主要问题 |
|------|----------|----------|
| 工具包风格 | `GenericKit`, `BizKit` | 过于通用，缺乏品牌辨识度，部分已被占用 |
| 开源前缀系列 | `OpenMCS`, `OpenMCSS`, `OpenMIS`, `OpenMSS` | 均与现有开源项目严重冲突（`openIMIS`, `OpenMSS` 等）；"Open" 前缀本身是品牌负资产 |
| 三字母缩写 | `MCS`, `MCC`, `MPS`, `FRS`, `PBP`, `UBS` | `MCS` 经深度查重后发现有致命冲突（见第 4 节） |
| 四字母/复合词 | `MODACS`, `MIDAS`, `MORPHS`, `MACS` | `MIDAS` 等多个名称已被开源项目或商标占用；`MODACS` 风险最低 |
| 新造词探索 | `Fabriq`, `Strukt`, `Tessera`, `Componex` | 经团队模式并行查重，均存在不同程度的冲突（见第 5 节） |

最终，**`MODACS`** 作为唯一通过全部查重且品牌力最强的候选胜出。

---

## 4. MCS 深度查重结论：不可行

在 v1.0 白皮书中，MCS 被列为备选。经过团队模式多角度深度查重后，发现以下致命问题：

| 致命问题 | 证据 |
|----------|------|
| **直接竞品冲突** | Stecher Automation 的 MCS（Matrix Control System）是一款模块化 MES/MOM 产品，与项目定位完全重叠 |
| **GitHub 淹没** | 33,500+ 仓库使用 MCS 命名；MCSManager 有 13k stars（Minecraft 服务器管理）；mcs-cli 是 2026 年新 AI 项目 |
| **crates.io 被占** | `mcs` 和 `mcslock` 已用于 MCS 锁算法（Mellor-Crummey and Scott），在 Rust/CS 领域是众所周知的并发原语 |
| **商标活跃** | MCS BRAND MANAGEMENT COMPANY LIMITED 和 MCS Products, LLC 持有当前有效注册商标 |
| **SEO 绝望** | 三字母缩写永远无法在搜索引擎中建立独立品牌；MCS 同时代表 Material Control System、Manufacturing Control System、Management Control System、Micro Computer Systems 等数十种含义 |

> **判决：MCS 不可行。这不是"备选"，是死路。**

---

## 5. 新造词探索与排除

在 MODACS 之外，团队模式分析还探索了以下新造词方案，均因冲突排除：

| 名称 | 含义 | 排除原因 |
|------|------|----------|
| **Fabriq** | 拉丁语 fabrica（工坊、制造） | ❌ 美国注册商标（Social Fabriq, Inc.，曾成功维权）；法国 SaaS 公司（€22M 融资）；YC 投资公司同名；npm/PyPI/Packagist 全被占 |
| **Strukt** | 德语 Struktur（骨架、结构） | ❌ strukt.dev/strukt.io 域名均被占用；crates.io 被死包占据；多家小公司同名 |
| **Tessera** | 拉丁语（马赛克小块） | ❌ crates.io 被占；7+ 活跃 GitHub 项目；全部域名被占；a16z 投资 $60M 的同名 AI 公司 |
| **Componex** | Compose + Nexus | ⚠️ 可用但品牌力弱，更像前端组件库而非企业应用平台 |

> **结论：MODACS 是唯一同时满足"零冲突 + 强品牌力"的方案。**

---

## 6. MODACS 详细分析

### 6.1 基本信息

| 属性       | 内容                                               |
| -------- | ------------------------------------------------ |
| **全称**   | Modular On‑Demand Application Composition System |
| **中文释义** | 模块化按需应用组合系统                                      |
| **音节**   | 2（Mo‑dacs），黄金记忆长度                                |
| **品牌标识** | 大写 `MODACS`；命令行/包名使用小写 `modacs`                  |

### 6.2 优势分析

| 属性 | 评价 |
|------|------|
| **语义准确度** | ⭐⭐⭐⭐⭐ "On‑Demand" + "Composition" 精确描绘了"按需搭建积木"的核心价值 |
| **专业感** | ⭐⭐⭐⭐⭐ 类似 SCADA 的造词风格，独特且富有科技感 |
| **可读性** | ⭐⭐⭐⭐ 两个音节（Mo‑dacs），略带工业感，记忆后很顺畅 |
| **冲突风险** | ⭐⭐⭐⭐⭐ 全球查重未发现同名开源项目或商标；历史 MODCOMP 商标已注销 |
| **品牌扩展性** | ⭐⭐⭐⭐⭐ 独特性极高，可自由扩展 MODACS Cloud, MODACS Studio, MODACS Runtime |
| **独特性** | ⭐⭐⭐⭐⭐ 几乎独一无二，搜索引擎和商标注册都非常有利 |
| **域名可用性** | ⭐⭐⭐⭐⭐ modacs.io / modacs.dev 均可注册 |

### 6.3 劣势与应对

| 劣势 | 应对策略 |
|------|----------|
| 新造词需一次解释 | 首篇博客和 README 中清晰说明全称和理念 |
| 发音像药品（Modafinil） | 通过品牌运营建立独立认知；Odoo 也曾面临类似问题 |
| 部分斯拉夫语有不雅联想 | 目标市场以中英文为主，影响范围有限 |

---

## 7. 品牌行动路线图

### 7.1 数字资产锁定（优先级最高）

| 资产 | 目标 | 状态 |
|------|------|:--:|
| 域名 | `modacs.io` / `modacs.dev` | ⬜ 待注册 |
| GitHub 组织 | `github.com/modacs` | ⬜ 待创建 |
| Gitee 组织 | `gitee.com/modacs` | ⬜ 待创建 |
| Docker Hub | `hub.docker.com/u/modacs` | ⬜ 待保留 |
| crates.io | `modacs-core`, `modacs-runtime` | ⬜ 待注册 |

### 7.2 法律保护

1. **中国商标网（CNIPA）**：第 9 类（软件）、第 42 类（技术服务）注册申请
2. **美国 USPTO**：查询并申请注册
3. **委托代理机构**：进行全球主要市场商标布局

### 7.3 开源许可证

| 范围 | 许可证 | 原因 |
|------|--------|------|
| 核心库 | Apache 2.0 | 兼容商业闭源，专利保护条款完善 |
| 样例模块 | MIT | 降低社区贡献门槛 |

### 7.4 品牌视觉基调

| 元素 | 建议 |
|------|------|
| **Logo 概念** | 积木块拼接 + 模块连接；"M" 可由负空间中的积木块构成 |
| **配色** | 深蓝（稳重、企业级）+ 橙色（活力、创新） |
| **字体** | 几何无衬线体（DIN/Inter/Geist 家族），带棱角切割呼应"积木"概念 |
| **Slogan** | `MODACS: Compose Your Enterprise, On Demand.` |
|  | `Build ERP, MES, and Beyond – Piece by Piece.` |

### 7.5 社区宣发

1. 发布项目 README，清晰解释 MODACS 名称由来和全称
2. 首篇博客：《Introducing MODACS – The Modular On‑Demand Application Composition System》
3. 在 TypeScript / Node.js 社区（Reddit r/node、Node.js GitHub Discussions）发布介绍
4. 中文社区同步宣发（掘金、知乎、TypeScript 中文社区）

---

## 8. 系列产品命名（2026-06-29 决策）

### 8.1 背景

MODACS 原定位为"决策层项目名"，另有 Actuaium（执行层）和 SynapticSYS（母品牌）。在后续设计中需要为感知层（SCADA/HMI）命名，并统一全系列产品命名风格。

### 8.2 系列前缀命名探索（已否决）

探索了 50+ 候选名作为统一前缀 + Sense/Core/Act 后缀的方案：

| 方案 | 冲突情况 | 结论 |
|------|---------|------|
| SYNEX（SynapticSYS 词根） | Synex.it 同做 MES/SCADA/ERP | ❌ 致命 |
| MODUS（MODACS 词根） | 5+ 家工业自动化公司 | ❌ 致命 |
| AXON / NEXA / VOLT | 全部商标冲突 | ❌ 致命 |
| -ium 后缀拉丁词（20+个） | Vigilium/Perceptium/Sentium 等全部被占 | ❌ 致命 |

**结论**：4-5 字母的前缀在工业软件领域命名空间已饱和，系列前缀命名不可行。

### 8.3 "Sense" 中间层品牌方案（已否决）

曾采用 "MODACS Sense" 作为感知层（组态/HMI/SCADA）的产品线品牌，下设 Sense Studio / Sense HMI / Sense Edge / Sense Remote。

经行业调研（Ignition / TIA Portal / VS Code / UE Editor）后否决，理由：

| 问题 | 说明 |
|------|------|
| **行业无此先例** | Ignition / Siemens / AVEVA 均无"产品线中间品牌"。Ignition 直接叫 Perspective / Vision / Edge，不叫 "Ignition View: Perspective" |
| **中间层不增加信息** | Studio / HMI / Edge / Remote 自解释，"Sense" 前缀冗余 |
| **语义错位** | "Sense" = 感知/传感，对应 ISA-95 Level 1（数据采集），不传达 Level 2（组态/HMI/监控） |
| **无法扩展新编辑器** | 未来 PLC 逻辑编辑器、无代码应用编辑器无法归入 "Sense" |
| **和 Vision 混淆** | Sense 和 Vision 都和"看"有关，区分度不够 |

### 8.4 最终方案：统一 Studio + 独立运行时

借鉴 **UE Editor**（一个 IDE 内多编辑器模式 + 插件扩展）、**VS Code**（统一编辑器 + 扩展插件）、**TIA Portal**（门户内多工具），采用统一编辑器 + 独立运行时的分层命名。

**核心原则**：

- **编辑端 = 一个产品**（MODACS Studio），内部通过工作模式/面板切换，通过插件扩展新编辑器
- **运行时 = 独立产品**（HMI / Edge / Remote），因为部署形态和目标用户完全不同
- **项目类型决定加载哪些编辑器**（类似 UE 的 .uproject / VS Code 的 .vscode）

**产品线全景**：

```
MODACS（平台品牌）
│
├── 创建端 ──────────────────────────────────────────
│   MODACS Studio
│   唯一的编辑器/IDE，插件扩展
│   内置编辑器（工作模式）：
│   ├── Scene Designer       画面组态（SVG/Canvas 图元拖拽 + 数据绑定）
│   ├── Flow Designer        工作流编排（DAG 节点 + 连线）
│   ├── Data Designer        数据模型/Collection 设计
│   └── Debug                统一调试（MCAP 回放 + 实时追踪 + Foxglove）
│   扩展编辑器（插件）：
│   ├── Logic Designer       PLC 逻辑（IEC 61131-3，v2+）
│   ├── App Builder          无代码应用（v2+）
│   └── ...                  未来扩展
│
├── 运行端 ──────────────────────────────────────────
│   MODACS HMI               触摸屏/工控机运行时（Tauri 桌面壳）
│   MODACS Edge              边缘采集/硬件通信运行时（7×24 独立进程）
│   MODACS Remote            远程监控运行时（浏览器，纯 B/S）
│
├── 业务端 ──────────────────────────────────────────
│   MODACS Core              MES/ERP/OA（业务平台核心）
│   MODACS Act               PLC/CNC 运行时（Podman 隔离）
│   MODACS Vision            AI 视频分析（Podman 隔离）
│   MODACS Link              通信中间件（Zenoh/ROS2 抽象层）
```

**ISA-95 层级对照**：

| ISA-95 Level | 产品 | 说明 |
|:---:|------|------|
| Level 4-3 | MODACS Core | MES/ERP/OA 业务决策 |
| Level 2 | MODACS Studio → HMI/Remote | 组态画面编辑 + 监控运行 |
| Level 1 | MODACS Edge / Link | 数据采集 + 通信中间件 |
| Level 0 | MODACS Act | PLC/CNC 设备控制 |

### 8.5 为什么用统一 Studio（行业先例）

| 先例 | 做法 | 启发 |
|------|------|------|
| **UE Editor** | 一个 IDE，内部切换关卡/蓝图/材质/动画编辑器，插件扩展 | 编辑器 = 工作模式，不是独立产品 |
| **VS Code** | 一个编辑器，通过扩展插件支持 Python/Java/Git | 新编辑器 = 安装插件，不是新产品 |
| **TIA Portal** | 一个门户，内部 STEP 7/WinCC/Startdrive | 项目类型决定加载哪些工具 |
| **Ignition Designer** | 一个 IDE，内部 Window/SFC/Script/Tag/UDT 编辑 | 资源类型决定编辑器视图 |

**共同规律**：

```
编辑端 = 一个统一产品（IDE/Editor/Portal）
内部编辑器 = 工作模式/面板/插件，不是独立产品
项目类型决定加载哪些编辑器
运行时是独立产品（部署形态不同）
```

### 8.6 退役名称

| 原名称 | 新名称 | 处理 |
|--------|--------|------|
| SynapticSYS | — | 退役为内部代号，不再作为公开品牌 |
| Actuaium | MODACS Act | 更名，文档保留映射 |
| VideoHub | MODACS Vision | 更名，文档保留映射 |
| MLA | MODACS Link | 更名，文档保留映射 |
| MODACS Sense | — | 退役。组态编辑功能归入 MODACS Studio（Scene Designer），运行时拆为 HMI/Edge/Remote |
| MODACS Panel | — | 退役（曾作为 Sense 的替代方案，最终被统一 Studio 方案取代） |

### 8.7 优势

- **零冲突**：MODACS 是独创缩写，复合名不可能冲突
- **系列感强**：所有产品以 MODACS 开头，一眼看出同族
- **含义清晰**：Studio=编辑，HMI=触摸屏，Edge=边缘，Remote=远程，Core=核心，Act=执行，Vision=视觉，Link=连接
- **编辑器可扩展**：新编辑器 = 新插件，不需要新产品品牌（Studio 内部扩展）
- **运行时独立**：HMI/Edge/Remote 部署形态和目标用户完全不同，独立命名合理
- **对齐行业先例**：UE Editor / VS Code / TIA Portal / Ignition Designer 都是统一编辑器 + 插件扩展

### 8.8 GitHub 组织与仓库

```
github.com/modacs/
├── modacs              # 平台核心（base 进程 + RPC Hub + ProcessManager）
├── studio              # MODACS Studio（统一编辑器/IDE）
│   ├── packages/
│   │   ├── studio-core         # Studio 框架（插件系统 + 面板管理）
│   │   ├── scene-designer      # 画面组态编辑器（内置）
│   │   ├── flow-designer       # 工作流编辑器（内置）
│   │   ├── data-designer       # 数据模型编辑器（内置）
│   │   └── debug               # 统一调试器（内置）
│   └── plugins/
│       ├── logic-designer      # PLC 逻辑编辑器（插件，v2+）
│       └── app-builder         # 无代码应用编辑器（插件，v2+）
├── hmi                 # MODACS HMI（触摸屏运行时）
├── edge                # MODACS Edge（边缘采集运行时）
├── remote              # MODACS Remote（远程监控运行时）
├── core                # MODACS Core（MES/ERP/OA）
├── act                 # MODACS Act（PLC/CNC 运行时）
├── vision              # MODACS Vision（AI 视频）
├── link                # MODACS Link（通信中间件）
└── docs                # 平台文档
```

### 8.9 命名规则总结

```
规则：MODACS + 一个领域词

选词原则：
  1. 单词（非复合短语）
  2. 自解释（看到词就知道做什么/运行在哪）
  3. 首字母大写（品牌规范）
  4. 编辑器和运行时通过词义区分，不用后缀

编辑端（创建工具）：
  MODACS Studio     ← 唯一的编辑器/IDE
  内部编辑器 = 工作模式/面板（Scene/Flow/Data/Debug）
  扩展编辑器 = 插件（Logic/App Builder/...）

运行端（部署形态）：
  MODACS HMI        ← 触摸屏/工控机
  MODACS Edge       ← 边缘网关
  MODACS Remote     ← 浏览器/远程

业务端（业务平台）：
  MODACS Core       ← MES/ERP/OA
  MODACS Act        ← PLC/CNC
  MODACS Vision     ← AI 视频
  MODACS Link       ← 通信中间件

扩展原则：
  新编辑器 → Studio 插件（如 MODACS Studio Sim Plugin）
  新运行时 → 选一个"部署"角色词（如 MODACS Mobile）
  新基础设施 → 选一个"连接"词（如 MODACS Sync）
```

---

## 9. 结语

经过数轮全球查重、团队模式多角度分析（冲突查重、品牌战略、命名模式研究、新造词探索），**MODACS** 是唯一同时满足以下全部条件的方案：

- ✅ 零冲突（GitHub、npm registry、域名、商标）
- ✅ 强品牌力（语义完整、故事可讲、视觉可延展）
- ✅ 专业感（与 SCADA/MES/ERP 同风格）
- ✅ 可扩展（Cloud、Studio、Runtime 等子品牌）

能够承载本项目"对标 Odoo、基于 TypeScript + Node.js 构建下一代企业应用底座"的长期愿景。

---

*本白皮书内容基于公开信息和多轮技术讨论，不构成法律意见。商标注册请咨询专业代理机构。*