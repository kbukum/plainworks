---
name: apply-plan
description: "plainworks: Resume an existing plan in dependency order, validating each bounded work order."
---

# Applying a plan from its remaining steps

`apply-plan` takes a plan folder (produced by `create-plan`) and drives it to completion, **starting from the first step that is not yet done** so it can be run repeatedly to resume interrupted work.

## Input

A plan folder under `tmp/` — e.g. `tmp/channel-sse-reconnect/`. Honor an explicitly supplied existing path. If the caller does not name one, read the plan index and list candidates:

```bash
ls -d tmp/*/
```

## 1. Read the plan and compute the remaining steps

Read the existing handoff first. Verify current Git state and evidence freshness; then read the README, current step, and required dependency contracts only. Do not load all historical steps.

- Read `tmp/<plan>/README.md` first: the goal, ordered step index, dependency order, and cross-cutting baseline. For a replan, also read decisions, current state and handoff; an explicit apply request is required to resume paused implementation.
- List the step files and find each one's progress signal — the `**Status:**` field and the `- [ ]` / `- [x]` acceptance boxes.

```bash
ls tmp/<plan>/[0-9][0-9]-*.md
grep -n '\*\*Status:\*\*' tmp/<plan>/[0-9][0-9]-*.md
```

- **Remaining = every step not marked `done`.** The first remaining step in dependency order is the resume point. A step is eligible only when the steps it *Depends on* are already `done`; never start a step ahead of an unfinished dependency.

## 2. Apply each remaining step in order

Complete one bounded work order, checkpoint, and stop at the session boundary. Reuse the step's fresh validation evidence; repeat a command only if inputs changed or its result does not cover acceptance. Never skip a required gate.

For each remaining step, in dependency order, run the **`apply-step` workflow** on that step file (read the README + required dependency contracts for context, apply the current step test-first, validate, mark it done). Do not skip ahead; do not batch several steps into one undifferentiated change — each stays a standalone, reviewable unit.

Between steps:

- **Validate the affected package(s)** with the [`validate`](../validate/SKILL.md) skill (scoped `turbo`/`bun run`) — do not proceed on a red one.
- If a step's acceptance criteria cannot be met as written, **stop** and report the divergence rather than forcing a green; the plan may need a `create-plan` revision. The baseline in [`../../copilot-instructions.md`](../../copilot-instructions.md) wins over the plan text. That includes a step written as "additive" or "keep the old path working". In alpha, apply it for the end state, or revise the plan first.

## 3. Baseline and review

Every step is executed against plainworks' baseline, not a looser plan-local standard. After a step (or a coherent group of steps) lands, run the [`review`](../review/SKILL.md) passes over the diff in the current agent (delegate only when requested). Treat a green `validate` run as necessary but not sufficient.

## Repo workflow

Use the plan's existing branch when resuming; do not replace its dirty worktree or index. For new work, follow [`create-branch`](../create-branch/SKILL.md). Apply steps and leave edits **uncommitted**: the maintainer commits and pushes, and a PR is opened in draft only when explicitly asked. Applying a plan never commits, restages preserved work, pushes, or opens a PR on its own.
