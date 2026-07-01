# MODACS

Dual-stack robotics control platform. Two stacks coexist in one repo:

- **MSRCS** — C++17/Qt5.15/ROS2 Jazzy remote control station (build infra ready, no source yet)
- **MODACS** — TypeScript/Node.js multi-process web platform (Slice 1 MVP + Debug module complete, ~43 TS/TSX files)

## Commands

### TypeScript (active development)
```bash
pnpm dev                          # Start backend (tsx apps/server/src/main.ts, port 3001)
MODACS_DEBUG=1 pnpm dev           # Backend + Foxglove WS bridge (port 8765)
pnpm build                        # esbuild → dist/
pnpm typecheck                    # tsc --noEmit for both root and apps/debug (MUST pass before commit)
```

Access debug pages at `http://127.0.0.1:3001/debug.html` — use `127.0.0.1`, NOT `localhost` (Clash proxy on port 7897 intercepts localhost).

### C++/ROS2 (build infra only, no source yet)
```bash
bash bootstrap.sh                           # One-time: install pixi + deps
bash scripts/build.sh                       # colcon + Ninja build
bash scripts/build.sh --debug               # Debug build
bash scripts/build.sh --packages select <pkg>  # Selective build
source scripts/env-source.sh                # Load ROS2 + pixi env
source scripts/env-fastdds.sh               # Fast-DDS + shared memory
```

## Architecture (TypeScript platform)

Multi-process: base process (Node.js/Hono) manages plugin child processes via `child_process.fork`.

```
apps/server/src/main.ts   → Hono HTTP server (port 3001), routes, static files
apps/server/src/app.ts    → createApp(): assembles hub, recorder, bridge, topicBus, logger
apps/base/src/index.ts    → Echo RPC plugin (sample plugin child process)
packages/core/src/        → Shared core library:
  rpc/protocol.ts         → JSON-RPC 2.0 types
  rpc/transport.ts        → UDS transport via undici Client (NOT fetch — can't do UDS)
  rpc/hub.ts              → RPC hub, plugin routing, TopicBus hooks
  topic-bus.ts            → Pub/sub engine with retainLast + wildcard matching
  topic-types.ts          → Topic naming: /module/category/name (slash style)
  logger.ts               → Structured JSON logger, publishes to /log/{name} via TopicBus
  foxglove-bridge.ts      → Official @foxglove/ws-protocol, foxglove.Log schema
  recorder.ts             → MCAP multi-topic recorder
  process-manager.ts      → Child process spawn with exponential backoff restart
```

### Debug Module (apps/debug/)

React SPA served by the backend at `/debug/`. Vite-built, lazy-loaded pages.

```
apps/debug/src/
  App.tsx                  → Router with /debug basepath, React.lazy pages
  main.tsx                 → Vite entry, QueryClient, BrowserRouter
  pages/                   → 7 pages: Overview, DataFlow, LogViewer, McapBridge,
                             RpcConsole, TopicGraph, TopicMonitor
  components/              → Layout, MessagePublisher, TopicMonitor, LogLine,
                             JsonView, RawMessageInspector, McapControl,
                             BridgeStatus, ProcessMonitor + ui/ (card, label, checkbox)
  stores/                  → Zustand stores: rpc-store, topic-store,
                             publish-store, log-store
  lib/                     → api-client (apiGet helper), graph-builder,
                             panel-registry, rate-tracker
  types/api.ts             → Shared API types
  vite.config.ts           → Vite config with manualChunks
```


**Communication**: JSON-RPC 2.0 over Unix Domain Sockets. JSON only (no MessagePack/Protobuf).
**TopicBus**: Pub/sub with trailing `*` wildcard (e.g., `/log/*`). Retained messages replay on subscribe.
**API paths**: `/api/{collection}:{action}` — NOT REST. Example: `/api/topics:list`, `/rpc/echo`.

## Critical Constraints

These are project-specific and agents WILL get them wrong without this list:

1. **No Bun APIs** — `Bun.serve`, `Bun.spawn`, `http://unix:` all forbidden. Use Node.js built-ins.
2. **No `console.log`** in app code — conflicts with subprocess stdout. Use `packages/core/src/logger.ts`. The logger itself uses `console.log` internally (exception).
3. **UDS transport requires `new Client` from undici** — Node.js built-in `fetch` cannot do Unix Domain Sockets.
4. **Socket cleanup** — Always `unlink` old UDS socket files on startup. Socket dir: `/tmp/modacs` (chmod 0o700).
5. **No tests in Slice 1** — Interfaces are unstable (per `docs/MODACS-Platform-Dev.md` §8.2). TDD rules in `.agents/rules/` do NOT apply until Slice 2.
6. **No Redis/ZMQ/NNG/gRPC** — Fan-out via TopicBus is sufficient. Cluster uses HTTP API, not transparent RPC.
7. **No direct DB access from plugins** — Plugins communicate via RPC to base process only.
8. **Immutability is CRITICAL** — Always spread, never mutate. `{...obj, field: value}`, not `obj.field = value`.
9. **Tech stack is locked** — Hono (not Express), Drizzle (not Prisma), Zustand (not Redux), TanStack Query (not SWR), esbuild (not webpack), vitest+Playwright (not Jest). See `docs/MODACS-AI-Dev.md` §8 for full forbidden list.

## What Exists vs What's Planned

| Exists | Missing |
|--------|---------|
| ~43 TS/TSX source files (Slice 1 + Debug module) | `src/` C++/ROS2 source |
| `pixi.toml` — still not created | Docker / docker-compose.yml |
| `.clangd`, `.clang-format`, `.clang-tidy` | CI/CD pipelines |
| 2 HTML debug pages + React Debug SPA (7 pages) | PostgreSQL + Drizzle setup |
| pnpm workspace (root + apps/ + packages/) | Test framework config |
| 43 git commits | `pixi.toml` file (referenced by scripts) |

`BUILD_TESTING=OFF` in `build.sh` is intentional (no C++ test code yet).

## Key Docs

| Doc | What's in it |
|-----|-------------|
| `docs/MODACS-AI-Dev.md` | Tech stack rules, forbidden list §8, code templates |
| `docs/MODACS-Platform-Dev.md` | Slice definitions, vertical slice implementation guide |
| `docs/MODACS-Platform.md` | Odoo-style modular platform architecture (1740 lines) |
|| `.opencode/agent-guide.md` | 7-stage AI dev pipeline, agent roles, model tiers |

## AI Tool Priority

Code navigation: `codegraph_explore` → `lsp_*` → `ast_grep_search` → `grep`
Symbol lookup: `lsp_goto_definition` / `lsp_find_references` → `codegraph_explore`

During **planning** (this is a Prometheus/planner repo): do NOT call `codegraph_explore` directly — it returns full source. Delegate to explore/librarian agents who consume it in their sandbox.

## Conventions

- Files: `kebab-case` (`work-order.ts`). Classes: `PascalCase`. Functions: `camelCase`. Constants: `UPPER_SNAKE`.
- DB schema: `{module}_{table}` (e.g., `mes_work_orders`).
- Version in `version.txt` (not CMakeLists.txt or package.json).
- Changelog in `changes/` directory (per-version files, not CHANGELOG.md).
- Git: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). No AI auto-commit.
- pixi installed from Gitee mirror (`gitee.com/chengxuewen-github/pixi`) — China network.