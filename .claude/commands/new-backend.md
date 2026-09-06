---
description: Add a pluggable adapter/backend — a state store, connection transport, auth mechanism, or query wiring — implementing the core package's seam, selected via explicit register()/createX({...}), no import-time side effects. Use when integrating a backend.
---

# /new-backend — router to the canonical skill

This command is a **thin router**. The single source of truth for this workflow is the project skill at [`.github/skills/new-backend/SKILL.md`](../../.github/skills/new-backend/SKILL.md).

**Do this now:** read `.github/skills/new-backend/SKILL.md` in full — plus every reference file it links — and execute it exactly as written, applying it to the scope below. Do not act on any summary; the skill file is authoritative and kept up to date. This router only exists so the Claude Code slash command and the Copilot skill never drift.

Scope / arguments: $ARGUMENTS
