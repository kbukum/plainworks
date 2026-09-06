---
name: create-plan
description: >-
    Turn a non-trivial change into a written, reviewable plan under the repo's gitignored tmp/
    folder — a README overview plus, when the work is multi-step, numbered step markdown files that
    can be applied iteratively. Every plan is bound to plainworks' engineering baseline. Use when
    scoping a feature, refactor, package port, or release, or when asked to plan or break down work.
---

# Planning plainworks work as applyable step files

A plan is a written contract for a change set: what to do, in what order, and how you will know each part is done. In this repo a plan is **not prose to admire** — it is a folder of markdown that the `apply-plan` / `apply-step` skills execute iteratively.

## Where plans live: `tmp/<plan-name>/`

Always create plans under `tmp/` at the repo root. `tmp/` is **gitignored** (only `tmp/.keep` is tracked) — plans are local working scratch, never committed and never shipped. Name the folder by the change itself in kebab-case (`tmp/connection-sse-reconnect/`, `tmp/auth-bff-cookie/`) — the same high-level naming rule as branches: no `step-N`, plan numbers, or session detail.

```bash
mkdir -p tmp/<plan-name>
```

## Structure

- **`README.md`** (always) — the overview: goal, how to read the folder, an ordered index of the step files with their dependency order, and the cross-cutting rules that bind every step.
- **`NN-topic.md`** step files (when multi-step) — zero-padded and ordered by dependency layer (`01-core.md`, `02-...`), each a self-contained unit. A genuinely small single-shot change can be one `README.md` with an inline step list.

Numbering orders the plan; it is **internal to the plan folder only**. When a step becomes a branch/PR, name it by the change (see `create-branch`) — never `step-3`.

### Each step file contains

```markdown
# <Step title — the change, not "step N">

**Layer:** L<n> · **Depends on:** <steps> · **Blocks:** <steps> · **Status:** pending

## Scope
What this step changes and, explicitly, what it does not.

## Steps
1. Numbered, concrete actions at real paths.
2. ...

## Files touched
- `packages/<name>/**`, new `packages/<name>/src/<concern>/...` (concern folders with barrel-only `index.ts`, not a flat pile), ...

## Acceptance criteria
- [ ] Behavior written test-first; vitest green, race/shuffle safe on the affected package(s).
- [ ] The six DoD gates green for the package: check-versions · lint · typecheck · check-boundaries · build · test.
- [ ] A Changeset added.
- [ ] <step-specific, verifiable outcomes>
```

`Status: pending` and the `- [ ]` boxes are the progress signal `apply-plan` reads to find the first unfinished step. `apply-step` flips them to `done`/`- [x]` when a step lands.

## Bind every plan to the baseline

A plan may **not** invent a lighter standard than plainworks'. Its cross-cutting rules restate — and link to — the baseline in [`../../copilot-instructions.md`](../../copilot-instructions.md) and the [`review`](../review/SKILL.md) passes. Make these load-bearing in every plan README:

- **Test-first (TDD).** Each behavior gets a failing vitest test first, then minimal code, then refactor while green — failure paths included. Shared fakes/harnesses come from `@plainworks/testkit`, never hand-rolled.
- **Best-practices bar.** The *simplest* design that fully solves each step — flexible (small typed seams over rigid or speculative abstraction), scalable (bounded buffers, cancellation, no unbounded streams), on current idiomatic TS/React best practices. Complexity must earn its place.
- **Placement & layering.** Right package and layer; a package in `Ln` imports only `L<n`; a cross-layer need defines the seam in the lower package and implements it higher. New packages are born through `bun run gen package` (see `new-package`) and added to the `LAYERS` map.
- **Organize by concern; self-documenting by path.** Within a package, group related modules into concern folders with a re-export-only `index.ts` barrel plus concern-named files (as `rskit` groups `retry/{backoff,policy}.rs` under a barrel-only `mod.rs`); a single concern is one clearly named file. No junk-drawer `utils`/`helpers`/`core`, no bare verb modules/exports (`compose`, `classify`) — qualify by concern. Fold proactively when a second sub-concern appears. A step's `Files touched` should name the concern folders/modules it adds, not a flat pile in `src/`.
- **Host-independence.** Server-safe `.` entry (no React/DOM); optional `./client` with per-module `"use client"`; token-custody code stays out of client graphs.
- **Composition.** No import-time side effects, no module-level singletons — per-request factories; adapters register explicitly.
- **Typed & minimal APIs.** No `any` in public surfaces; typed errors that preserve cause; timeout + cancellation on remote calls.
- **Root-cause, no shims.** Pre-stable: redesign cleanly and remove the old path; no compat shims or half-migrations.
- **Release hygiene.** A Changeset per change; ESM-only, `exports`/`types`/`files` correct; catalog-only versions.

Order steps so each starts only when its dependencies are green, and so each maps to a **standalone, reviewable change** (`std` before everything; transport/data before `auth`; `ui`/`showcase` after the spine).

## Carrying prior review findings

If the work ports code that already has recorded review findings (e.g. the `web_framework` W1–W6 reviews mapped in the genesis crosswalk), list each carried finding in the step that resolves it and require a **regression test first** for behavioral carries. Structural findings that the scaffold/generator/seam already make impossible are confirmed in review, not re-fixed.

## Handoff

Creating the plan is a docs-only act under `tmp/` — no source edits, no branch, no commit. Apply it later with `apply-plan` (whole plan) or `apply-step` (one step).
