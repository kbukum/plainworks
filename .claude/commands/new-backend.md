---
description: Add a pluggable adapter/backend to plainworks the canonical way — a state store, channel transport (sse/ws), auth mechanism (oidc/jwt/apikey/BYO), or query wiring — implementing the core package's seam, selected via config through an explicit register()/createX({...}), with no import-time side effects and the lean default kept in core. Use when integrating a transport, an auth style, or a state/query backend.
---

# /new-backend — router to the canonical skill

This command is a **thin router**. The single source of truth for this workflow is the project skill at [`.github/skills/new-backend/SKILL.md`](../../.github/skills/new-backend/SKILL.md).

**Do this now:** read `.github/skills/new-backend/SKILL.md` in full — plus every reference file it links — and execute it exactly as written, applying it to the scope below. Do not act on any summary; the skill file is authoritative and kept up to date. This router only exists so the Claude Code slash command and the Copilot skill never drift.

Scope / arguments: $ARGUMENTS
