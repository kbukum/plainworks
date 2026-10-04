---
name: apply-step
description: "plainworks: Implement one plan step test-first, validate its acceptance criteria, and record progress."
---

# Applying one plan step, in context

`apply-step` implements exactly one step of a plan folder (from `create-plan`). It is the unit of work `apply-plan` calls per step, and it can also run directly on a single step file.

## Input

A path to one step file, e.g. `tmp/channel-sse-reconnect/02-sse-adapter.md`.

## 1. Load required context

Read the existing handoff first, then the plan README and current step. Check its dependency status and read only the earlier decisions/contracts it needs. Do not preload every earlier step or re-litigate completed decisions. If a required contract is missing or stale, inspect its owning source before editing.

For a resumed or replanned branch, also read the current-state record, decisions, and handoff. Verify HEAD and the staged-index identity; preserve all staged, unstaged, and untracked implementation work. Treat that code as unfinished evidence, not an approved design. Resolve owner placement before moving or extending it.

Preservation forbids discarding/resetting unrelated work or rewriting the index; it does not freeze flawed implementation in place after an explicit apply request. Make reviewed replacements in the worktree. Final review covers `git diff HEAD` plus untracked files, not the frozen index alone.

Confirm the current step's *Depends on* steps are `done` before starting. If a dependency is unfinished, stop and say so.

## 2. Implement the step against the baseline

Apply the current step's actions **test-first**, honoring the baseline in [`../../copilot-instructions.md`](../../copilot-instructions.md) — the plan does not override it:

- **TDD.** For each behavior: failing vitest test → minimal code → refactor while green, failure paths included. Never write production code first and add tests after. Reuse `@plainworks/testkit` fakes/harnesses.
- **Best-practices bar.** The *simplest* design that fully solves the step — flexible (small typed seams over rigid/speculative abstraction), scalable (bounded buffers, cancellation, no unbounded streams), current idiomatic TS/React. Complexity must earn its place.
- **Placement & layering.** Right package and layer; a package in `Ln` imports only `L<n`; a cross-layer need defines the seam in the lower package (`std` owns shared contracts/event shapes) and implements it higher. A new package is born through `bun run gen package` (see `new-package`) and added to `internal/boundaries/layers.json`.
- **Host-independence.** Server-safe `.` entry (no React/DOM); optional `./client` with per-module `"use client"`; server-only/auth token-custody stays out of client graphs.
- **Core/integration ownership.** Technology adapters and their drivers never live in core subpaths or optional peers. Put them with the smallest owner the plan selects (the consumer, or a package when the kit ships them for reuse). Prove core-only and bring-your-own-adapter consumption as well as the selected integration.
- **Composition.** No import-time side effects or module-level singletons. Factories establish explicit process/request/browser-root ownership; persistent data is not recreated per request. Adapters register explicitly into an injected registry.
- **Typed & minimal.** No `any` in public surfaces; typed errors preserving cause; timeout + cancellation on remote calls.
- **Root-cause, no compatibility (alpha).** Redesign on current best practices rather than patching; breaking changes are welcome. Build new code for the end state, never around the old path. When the step supersedes something, move every consumer and delete the old path, its exports, and its docs in this step, unless the plan names a later deletion step. Leave no shims, aliases, deprecated re-exports, or compat flags. See [Development stage](../../engineering.md#development-stage-alpha-redesign-over-compatibility).
- **Vendored atoms stay locked.** Never hand-edit `packages/elements/src/shadcn/**` or `shadcn.lock.json`, even when a step's `Files touched` lists them — change an atom only with `registry:update`. A visual or behavior change follows the **deviation ladder** (theme → call site → `ui` wrapper); see the [Vendored atoms](../../engineering.md#vendored-atoms) baseline.
- **Organize by concern; self-documenting by path.** Group related modules into a **concern folder** with a re-export-only `index.ts` barrel plus concern-named files (as `rskit` groups `retry/{backoff,policy}.rs` under a barrel-only `mod.rs`); a single concern is one clearly named file. No junk-drawer `utils`/`helpers`/`core`, no bare verb modules/exports (`compose`, `classify`) — qualify by concern (`pipeline/interceptor.ts` → `composeInterceptors`). Fold **proactively** when a second sub-concern appears — never pile several concerns flat in `src/`. A barrel `index.ts` re-exports only, holds no logic. When you touch a file that already mixes distinct concerns, promote it **in this step** — don't defer the reorg.

Keep the edit scoped to *this* step's `Files touched`; if the step is mis-scoped, report it rather than silently expanding.

## 3. Validate, review, and mark done

- **Validate** the affected package(s) with [`validate`](../validate/SKILL.md), scoped `turbo`/`bun run`, vitest green under race/shuffle. A step does not land red. Run `bun run check-boundaries` on any structural change.
- For a step that changes what an app user sees, meet the [UI Definition of Done](../../engineering.md#build-test-and-lint): check the touched flows in e2e, capture them with `ui:capture --flow <flow>` and look at the frames, and note the summary in the step's decisions.
- Add the **Changeset** the step's acceptance requires.
- **Review** the step's diff with the relevant [`review`](../review/SKILL.md) passes in the current agent; delegate only when the user requests it.
- Only when acceptance criteria are genuinely met, flip the progress signal so `apply-plan` can resume: set `**Status:** done` and check its `- [x]` boxes. Never mark a step done on a partial or red result.

Update `handoff.md` with the completed capability, remaining work, exact next action, validation freshness, Git constraints, and owned resources. Keep it under 500 words.

## Repo workflow

Work on a branch (`create-branch`), leave edits **uncommitted** for the maintainer to commit and push; open a PR (draft) only when explicitly asked. When the change becomes a branch/PR, name it by the change — never `step-2`.
