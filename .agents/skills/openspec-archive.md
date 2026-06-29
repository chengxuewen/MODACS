---
name: openspec-archive
description: >-
  Archive a completed MSRCS change proposal after implementation and verification.
  Use when the user wants to finalize a change — record decisions, update memory,
  clean up artifacts.
license: MIT
compatibility: Designed for Claude Code, GitHub Copilot, and similar agents.
disable-model-invocation: false
metadata:
  author: openspec
  version: "1.0"
  category: workflow
  project: MSRCS
---

# OpenSpec Archive — MSRCS

Archive a completed MSRCS change proposal. Record what was done, update project memory, and clean up working artifacts.

---

**Input**: Optionally specify a change name (kebab-case). If omitted, check if it can be inferred from conversation context. If vague or ambiguous, list available proposals under `.sisyphus/plans/`.

---

## Steps

### 1. Select the change

If a name is provided, use it. Otherwise:
- Infer from conversation context
- If ambiguous, list `.sisyphus/plans/` directories and ask the user to select

**IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

### 2. Verify completion status

Check that all tasks are complete:
- Read `.sisyphus/plans/<change-name>/tasks.md`
- Confirm all tasks are marked `[x]`
- If incomplete tasks exist: display warning, ask user if they want to proceed

Also check that `openspec-verify` was run:
- If not, suggest running verification first
- User can override and archive anyway

### 3. Update project memory

Record what was done in the project's memory files:

#### a. Update `status.md`

Add the completed change to the status file under "Completed Items" or update "Recent Changes":

```
- 2026-06-15: [description of what was implemented]
```

File: `.agents/memorys/status.md`

#### b. Update `decisions.md` (if applicable)

If the change involved architectural decisions, add an ADR entry:

```
## ADR-NNN: [Title]

- **Date**: 2026-06-15
- **Decision**: [what was decided]
- **Background**: [context]
- **Alternative**: [other options considered]
```

File: `.agents/memorys/decisions.md`

#### c. Update `pitfalls.md` (if applicable)

If the change uncovered technical pitfalls, add an entry:

```
## 2026-06-15: [Pitfall title]

- **现象**: [what happened]
- **原因**: [root cause]
- **解决**: [how it was fixed]
```

File: `.agents/memorys/pitfalls.md`

### 4. Update changelog

Add an entry to `changes/changes-<version>.txt`:

```
## 修复
- [<version>] [description of fix]

## 优化
- [<version>] [description of optimization]

## 新增
- [<version>] [description of new feature]
```

Do NOT modify `version.txt` — only the user may update it.

### 5. Archive the proposal directory (optional)

If the user wants to clean up:

```bash
mkdir -p .sisyphus/plans/archive
mv .sisyphus/plans/<change-name> .sisyphus/plans/archive/<change-name>
```

Or keep it for reference — the user decides.

### 6. Display summary

```
## Archive Complete

**Change:** <change-name>
**Location:** .sisyphus/plans/archive/<change-name>/

### Recorded
- [x] Project status updated (status.md)
- [x] Changelog updated (changes/changes-<version>.txt)
- [x] ADR recorded (decisions.md) — [if applicable]
- [x] Pitfalls recorded (pitfalls.md) — [if applicable]

### Next Steps
- User may update version.txt
- Consider cleanup of any temporary/test files
```

---

## MSRCS-Specific Archival Context

### Memory files to update

| File | Purpose | Update When |
|------|---------|-------------|
| `.agents/memorys/status.md` | Project status, recent changes | Always |
| `.agents/memorys/decisions.md` | Key architecture decisions | Design decision made |
| `.agents/memorys/pitfalls.md` | Technical pitfalls | New issue encountered |
| `.agents/memorys/conventions.md` | Coding conventions | Convention established |

### When to record an ADR (decisions.md)

Any of these during the change:
- New Qt/ROS2 integration pattern established
- Build system change (new cmake target, new package)
- Process management change (new PM2 app, new startup profile)
- Architectural tradeoff resolved (e.g., QWidget vs QML)
- Thread safety strategy decision

### When to record a pitfall (pitfalls.md)

Any of these during the change:
- Build error that required non-obvious fix
- Qt/ROS2 runtime issue (signal not firing, DDS QoS mismatch)
- Toolchain incompatibility (CMake version, compiler, pixi)
- Process/chrome issue (X11 embedding, DISPLAY, PM2)
- Thread safety issue (race condition, deadlock)

---

## Guardrails

- Always prompt for change selection if not provided
- Do NOT block archive on warnings — just inform and confirm
- Do NOT modify `version.txt` — only the user may update it
- Do NOT modify QExt/OpenCTK submodules from here
- Write changelog entries in Chinese (per project convention)
- Memory file updates should be concise, not verbose
- If the change involves no new pitfalls or decisions, skip those files
- Offer to clean up the proposal directory but do not force it
