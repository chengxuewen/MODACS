# MODACS

> **Mod**ular **A**utomation and **C**ontrol **S**ystem — Odoo-style modular robotics control platform.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.1.1-lightgrey)](version.txt)

MODACS is a dual-stack robotics control platform combining a C++/Qt/ROS2 remote control station (MSRCS) with a planned TypeScript/Node.js multi-process web platform. The system features Odoo-style modular plugin architecture with multi-process isolation, JSON-RPC communication over Unix Domain Sockets, and a three-layer UI isolation model.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      MODACS Platform                      │
├──────────────────────┬───────────────────────────────────┤
│   MSRCS (C++/Qt)     │   MODACS Web (TypeScript/Node.js) │
│   C++17 · Qt 5.15    │   Hono · React · Drizzle · PG     │
│   ROS2 Jazzy         │   Multi-process · UDS JSON-RPC    │
│   Remote Control     │   Odoo-style plugin system        │
└──────────────────────┴───────────────────────────────────┘
```

## Tech Stack

### MSRCS — Remote Control Station (existing)
| Component | Technology |
|-----------|-----------|
| Language | C++17 |
| UI Framework | Qt 5.15 (Widgets + QML) |
| Communication | ROS2 Jazzy (DDS / Fast-DDS) |
| Build | colcon + Ninja + CMake |
| Package Manager | pixi (conda-based) |

### MODACS — Web Platform (planned)
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 24 LTS |
| Web Framework | Hono ^4 |
| Frontend | React 19 + shadcn/ui + Tailwind CSS v4 |
| ORM | Drizzle ^0.36 |
| Database | PostgreSQL 16+ |
| State | Zustand ^5 |
| Build | esbuild + Turborepo |
| Test | vitest + Playwright |
| IPC | JSON-RPC 2.0 over Unix Domain Sockets |

## Getting Started

### Prerequisites

- macOS (primary development platform) or Linux
- Git

### Environment Setup

```bash
# One-time setup
bash bootstrap.sh

# Load build environment
source scripts/env-source.sh

# Build C++/ROS2 components
bash scripts/build.sh
bash scripts/build.sh --debug              # Debug build
bash scripts/build.sh --packages select <pkg>  # Selective build
```

### TypeScript Platform (planned)

```bash
docker compose up -d db      # Start PostgreSQL
corepack enable && pnpm install
pnpm dev                     # Backend + Frontend
pnpm build                   # Production build
```

## Project Structure

```
MODACS/
├── .agents/          # AI agent rules, skills, and project memory
│   ├── rules/        # Coding standards (common, cpp, typescript, zh)
│   ├── skills/       # Deep reference skills (cpp, qt, openspec)
│   └── memorys/      # Project status, decisions, conventions, pitfalls
├── .opencode/        # OpenCode AI IDE configuration
├── docs/             # Architecture & design documentation (11 docs)
├── scripts/          # Shell scripts for build, env, pack, deploy
├── changes/          # Changelog files
├── bootstrap.sh      # One-shot environment setup
├── turbo.json        # Turborepo configuration
├── AGENTS.md         # Project knowledge base
├── SKILL.md          # AI skill registry
├── version.txt       # Semantic version
└── LICENSE           # Apache 2.0
```

## Documentation

| Document | Description |
|----------|-------------|
| [MODACS-Overview](docs/MODACS-Overview.md) | Project overview, vision, and roadmap |
| [MODACS-Platform](docs/MODACS-Platform.md) | Platform architecture and design |
| [MODACS-Platform-Dev](docs/MODACS-Platform-Dev.md) | Development guide with code templates |
| [MODACS-AI-Dev](docs/MODACS-AI-Dev.md) | AI coding rules and constraints |
| [MODACS-Cluster](docs/MODACS-Cluster.md) | Multi-node cluster architecture |
| [MODACS-Naming](docs/MODACS-Naming.md) | Naming whitepaper and brand architecture |
| [AGENTS.md](AGENTS.md) | Project knowledge base (WHERE TO LOOK) |

## Key Design Decisions

- **Multi-process isolation**: Each plugin runs as an independent child process
- **JSON-only messaging**: JSON-RPC 2.0 over Unix Domain Sockets (no ZMQ, NNG, gRPC)
- **Infrastructure-first**: All build scripts, AI rules, and docs committed before source code
- **pixi unified package management**: Single tool for C++ compiler, ROS2 deps, and Node.js runtime
- **Dual-stack coexistence**: MSRCS (C++/Qt/ROS2) and MODACS (TS/Node.js) share the same repository

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
