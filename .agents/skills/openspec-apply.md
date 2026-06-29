---
name: openspec-apply
description: >-
  Implement tasks from an MSRCS change proposal. Use when the user wants to
  start implementing, continue implementation, or work through tasks in the
  C++17 / Qt5.15 / ROS2 Jazzy codebase.
license: MIT
compatibility: Designed for Claude Code, GitHub Copilot, and similar agents.
disable-model-invocation: false
metadata:
  author: openspec
  version: "1.0"
  category: workflow
  project: MSRCS
---

# OpenSpec Apply — MSRCS

Implement tasks from an MSRCS change proposal. Work through design-specified tasks in the MSRCS codebase (C++17 / Qt5.15 / ROS2 Jazzy / pixi / colcon).

---

**Input**: Optionally specify a change name (kebab-case). If omitted, check if it can be inferred from conversation context. If vague or ambiguous, list available proposals under `.sisyphus/plans/`.

---

## Steps

### 1. Select the change

If a name is provided, use it. Otherwise:
- Infer from conversation context if the user mentioned a change
- Auto-select if only one active proposal exists
- If ambiguous, list `.sisyphus/plans/` directories and ask the user to select

Always announce: "Using change: `<name>`".

### 2. Read the proposal artifacts

Read these files in order to understand the full scope:

- `.sisyphus/plans/<change-name>/proposal.md` — What & why
- `.sisyphus/plans/<change-name>/design.md` — How
- `.sisyphus/plans/<change-name>/tasks.md` — Tasks

Also read relevant MSRCS source files referenced in the design for context.

### 3. Show current progress

Display:
- Change name and description
- Progress: "N/M tasks complete"
- Remaining tasks overview

### 4. Implement tasks (loop until done or blocked)

For each pending task:
- **Show** which task is being worked on
- **Read** any source files that need modification
- **Edit** files following the design
- **Build** the affected packages to verify:
  ```bash
  ./make.sh --packages <affected-packages> --skip-pack --skip-archive
  ```
- **Check LSP** diagnostics on changed files
- **Mark** task complete in the tasks file: `- [ ]` to `- [x]`
- **Continue** to next task

**Pause if:**
- Task is unclear — ask for clarification
- Implementation reveals a design issue — suggest updating design.md
- Build error or blocker encountered — report and wait for guidance
- User interrupts

### 5. On completion or pause, show status

```
## Implementing: <change-name>

Working on task 3/7: <task description>
  [...] implementation happening ...
  [build] ./make.sh --packages ...
  [lsp] diagnostics clean
  Task complete

Working on task 4/7: <task description>
  [...] implementation happening ...
  Task complete
```

---

## MSRCS Build & Verification Commands

For use during implementation:

```bash
# Build specific packages
./make.sh --packages ms_rcs_hmi_common ms_rcs_hmi_window --skip-pack

# Debug build
./make.sh --debug --skip-pack --skip-archive

# Full build (slow, use selectively)
./make.sh --skip-pack --skip-archive

# Enter pixi environment for manual testing
source scripts/env-source.sh
```

### C++ Implementation Reminders

- Follow C++17 standard with RAII and smart pointers
- Use `ament_cmake` for package build configuration
- Add `package.xml` dependencies when adding ROS2 message/service deps
- Qt5.15 from conda-forge — includes in CMakeLists.txt via `find_package(Qt5 ...)`
- Include Qt headers explicitly: `#include <QtWebEngine/qtwebengineglobal.h>`
- Use `qRegisterMetaType` for cross-thread signal/slot with non-standard types
- ROS2 thread safety: use `call_async` + polling, not `spin_until_future_complete`

---

## Guardrails

- Keep going through tasks until done or blocked
- Always read context files before starting
- If task is ambiguous, pause and ask before implementing
- If implementation reveals issues, pause and suggest artifact updates
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
- Pause on errors, blockers, or unclear requirements — don't guess
- After each task, verify with lsp_diagnostics + build
- Do NOT modify `version.txt` — versioning is user-managed
- Do NOT modify QExt/OpenCTK submodules — use their separate repos
