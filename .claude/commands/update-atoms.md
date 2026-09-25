---
description: Refresh plainworks' vendored shadcn atoms — bump the shadcn CLI, rerun registry:update for every locked atom, reconcile through theme tokens, call sites, or ui wrappers (never the atom), and rerun the atoms browser gate. Use when bumping shadcn or when registry:validate reports a lock mismatch.
---

# /update-atoms — router to the canonical skill

This command is a **thin router**. The single source of truth for this workflow is the project skill at [`.github/skills/update-atoms/SKILL.md`](../../.github/skills/update-atoms/SKILL.md).

**Do this now:** read `.github/skills/update-atoms/SKILL.md` in full — plus every reference file it links — and execute it exactly as written, applying it to the scope below. Do not act on any summary; the skill file is authoritative and kept up to date. This router only exists so the Claude Code slash command and the Copilot skill never drift.

Scope / arguments: $ARGUMENTS
