---
name: create-plan
description: "plainworks: Write or revise a high-level implementation plan with dependencies and acceptance criteria."
---

# Plan a change

Planning writes task documents only: no source edits, branch changes, staging, commits, or PRs. Apply the [baseline](../../copilot-instructions.md); a plan cannot weaken it.

## Scope and storage

Investigate the current owning modules and contracts before deciding. Record the goal, non-goals, constraints, decisions, and measurable acceptance. Prefer owner-level outcomes over prescriptive filenames or code recipes; investigate exact implementation at apply time. Name known removal targets when needed to prove complete replacement.

Reuse the existing task folder. New plans live in gitignored `tmp/plans/<task>/`, named for the change. Update `tmp/plans/README.md` and the task README; update `tmp/README.md` if it indexes plans. Never link stable docs to temporary task notes.

## Executable shape

- `README.md`: goal, scope, ordered step index, dependencies, and links to binding rules.
- `NN-topic.md`: one reviewable step/PR with `**Status:** pending`, `**Depends on:**`, scope, owner-level work order, removals, and `- [ ]` acceptance checks. Numbering orders documents, not branch names. Use work orders within a step to bound sessions; do not split one step across multiple PRs.
- `handoff.md`: under 500 words; branch/Git restrictions, current capabilities, decisions, remaining work, next action, evidence freshness/paths, owned resources, and continuation prompt.

A small single-step plan may keep the work order in its README. Add separate context, decisions, current-state, references, or open-question documents only when their content is needed; avoid empty boilerplate and repeated policy.

## Acceptance and continuation

Order dependencies before consumers. Require test-first behavior/failure coverage, canonical ownership, correct layering, complete dependent call-site/removal updates, and the relevant [validation](../validate/SKILL.md) and [review](../review/SKILL.md) checks. Use the repository's real gate names and integration evidence; do not claim a configured threshold from an old example. Keep required release/Changeset and UI acceptance where applicable. Link rules once rather than copying the baseline into every step.

A step becomes `done` only when its acceptance is verified. The handoff should let the next session read the current step and needed dependency contracts, not every previous step. Keep capability summaries rather than transcripts; flag evidence predating edits. Finish one bounded work order, checkpoint, and stop.

## Replanning unfinished work

Record the branch, HEAD, index identity, and current staged/unstaged/untracked state before editing. Preserve the index and all implementation changes. Classify each affected owner as Redesign, Align, Enhance, or Drop with a reason; retain correct behavior, not necessarily its current code or placement.

Rewrite stale decisions and continuation prompts, rather than appending a contradictory addendum. Identify exact known removals, caller groups, prerequisite tooling, and acceptance evidence still missing. Passing earlier tests do not certify later source changes. Planning updates documents only; it does not authorize source cleanup, restaging, commits, or publication.

## Plan the replacement, not a coexistence

When the work supersedes existing code, the plan owns its **full removal**:

- **Find every consumer first.** Before writing steps, list everything the old path touches: packages, `apps/*`, `internal/*`, `create-plainworks` templates, docs, instructions, and skills. A plan that retires an API but leaves a consumer on it is incomplete.
- **Prefer one step that replaces and deletes.** Split only when the change is genuinely too big to review. If you split, new code in earlier steps never imports, extends, or wraps the old path. The old path stays closed off, and a named later step deletes it using an **exact deletion list**.
- **Every step records what it removes.** Its acceptance criteria include "superseded code, exports, consumers, and docs are gone, with no shim, alias, or parallel model". The final step leaves **one model per concern**.
- **No release ships both.** Decide the changeset and release order so old and new are never published together. Breaking changes take a `minor` Changeset pre-1.0.
- **Re-plan when a step exposes legacy.** If an applied step turns out to be shaped around legacy, add a redesign step. Never carry the flaw forward.

## Carrying prior review findings

If the work ports code that already has recorded review findings, list each carried finding in the step that resolves it and require a **regression test first** for behavioral carries. Structural findings that the scaffold/generator/seam already make impossible are confirmed in review, not re-fixed.

Apply later with [apply-plan](../apply-plan/SKILL.md) or [apply-step](../apply-step/SKILL.md).
