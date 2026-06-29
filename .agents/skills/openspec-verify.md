---
name: openspec-verify
description: >-
  Verify that an MSRCS change proposal was implemented correctly. Use after
  implementation tasks are complete to ensure code compiles, tests pass, and
  the change meets design requirements.
license: MIT
compatibility: Designed for Claude Code, GitHub Copilot, and similar agents.
disable-model-invocation: false
metadata:
  author: openspec
  version: "1.0"
  category: workflow
  project: MSRCS
---

# OpenSpec Verify — MSRCS

Verify that an MSRCS change proposal was implemented correctly. This is the quality gate before archiving.

---

**Input**: Optionally specify a change name (kebab-case). If omitted, check if it can be inferred from conversation context.

---

## Steps

### 1. Select and prepare

If a name is provided, use it. Otherwise infer from context or list `.sisyphus/plans/` directories.

Read the proposal artifacts:
- `.sisyphus/plans/<change-name>/proposal.md` — original goals and success criteria
- `.sisyphus/plans/<change-name>/design.md` — design decisions to verify
- `.sisyphus/plans/<change-name>/tasks.md` — task completion status

### 2. Verify task completion

Check the tasks file: all tasks should be marked `[x]` (complete).

If incomplete tasks exist:
- Display warning listing incomplete tasks
- Ask the user if they want to proceed anyway or complete remaining tasks

### 3. LSP diagnostics check

Run LSP diagnostics on all changed files:

```bash
# Check all modified files via git
git diff --name-only HEAD
```

For each modified `.cpp`, `.hpp`, `.h`, `.py`, `.cmake` file, verify LSP diagnostics are clean (no errors, warnings are acceptable per project `.clangd` config).

### 4. Build verification

Build the affected packages:

```bash
./make.sh --packages <affected-packages> --skip-pack --skip-archive
```

The build MUST pass without errors. Document any pre-existing warnings that are not related to the change.

### 5. Design validation

Compare the implementation against `design.md`:

| Criterion | Check |
|-----------|-------|
| Architecture matches design | All new classes/functions exist as specified |
| Interfaces match spec | ROS2 topics/services match expected names |
| Qt signal/slot wiring correct | Connections established as designed |
| Build system changes correct | CMakeLists.txt / package.xml updated |
| No scope creep | No unrelated modifications |

### 6. Regression check

Ensure no existing functionality is broken:

- Check that existing tests still compile (if applicable)
- Verify that removed/modified code has proper migration
- Check for any accidental changes to unrelated files via `git diff`

### 7. Report results

```
## Verification: <change-name>

### Results

- Tasks: 7/7 complete
- LSP diagnostics: PASS (0 errors)
- Build: PASS (<package-name>)
- Design match: PASS

### Summary

All verification criteria met. Ready for archiving.

OR

Issues found:
1. [Issue description]
2. [Issue description]

Action needed before archive.
```

---

## Additional Checks

### For C++ changes
- `lsp_diagnostics` on all `.cpp`/`.hpp` files
- Build succeeds with `./make.sh --skip-pack`
- No new compiler warnings added (unless matching project baseline)
- Qt signal/slot connections type-safe (use `&QObject::method` syntax)
- ROS2 thread safety: no `spin_until_future_complete` in callback context

### For CMake changes
- `ament_cmake` conventions followed
- `package.xml` dependencies declared
- No duplicate `find_package` calls
- `target_link_libraries` uses non-keyword form when using `ament_target_dependencies`

### For Python changes (control_client, config_web)
- Syntax check: `python3 -m py_compile <file>`
- ROS2 node properly uses `rclpy` conventions

### For HMI changes
- QWindow embedding verified: child process announces WId, host embeds correctly
- DISPLAY variable available (GUI nodes)
- PM2 process management configured if applicable

---

## Guardrails

- Do NOT skip build verification — build MUST pass
- Check ALL changed files, not just the ones you remember editing
- If a pre-existing issue is blocking verification, document it separately
- Do NOT force-pass if build fails — fix the issue or revert
- LSP diagnostics takes priority over subjective code review
- If tests exist, run them: `colcon test --packages-select <pkg>`
- Report clearly what passed and what failed
