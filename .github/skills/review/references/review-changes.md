# Review changes

Standing, re-runnable review of a **change set** in this repository — a branch, a commit range, or `HEAD~1`. Use it after every change set, especially fast AI-assisted work. It sequences the focused passes in [`references/`](./) over a diff and adds scope handling; the actual checks live in the focused files.

## Execution

Follow [the review skill](../SKILL.md): direct review by default; independent agents only on request. Read current source and relevant contracts. A plan is a scope checklist, not a justification for a baseline violation.

## Pass 0 — Scope and context

- Get the actual diff: `git diff <base>...HEAD --stat`, then per file. Review what changed **plus its blast radius** — the rest of each touched file, the code the change calls and is called by, and closely-related files in the same package. Do not audit the whole repo (that is [`review-project.md`](./review-project.md)), but do not tunnel-vision on the diff lines either.
- **Pre-existing problems in the blast radius are in scope.** A defect, dead code, duplicated concern, legacy path, or design smell you read while reviewing is reported like any other finding. plainworks is alpha with **no backward compatibility owed**, so prefer a root-cause **redesign** over patching the symptom (decide Redesign / Align / Enhance / Drop). Report as a blocker any change that adds a new model next to an old one, or builds around a superseded path, instead of replacing it. Flag when a fix reaches beyond the touched files; never silently refactor unrelated code.
- plainworks is a foundation kit: a change to `std` or a core seam affects every package that implements it and every consuming app. List the affected packages/layers before reviewing, and note whether the change belongs in *this* package and layer at all.

## Passes

Follow the trigger table and order in [the review skill](../SKILL.md). Use each checklist's changes scope. Load applicable files only; report incomplete checks and stop acceptance on structural/reuse blockers.

## Findings

```
severity (blocker / should-fix / nit) — file:line — what's wrong — which principle — suggested fix
```

See [`SKILL.md`](../SKILL.md) for severity definitions.

## Validation

**Scope every command to the changed package(s)** — do not run the full-tree gates here:

```bash
bun run lint
bun run check-shape                           # when manifests, build descriptions, or generators changed
turbo run typecheck build test --filter=@plainworks/<name>
turbo run test --filter='...[origin/main]'   # only packages the diff affects
bun run check-boundaries                      # fast placement/acyclicity guard
bun run check-versions                        # catalog single-source
turbo run check-packaging --filter=@plainworks/<name>   # plainworks-release check-packaging
bun run check-registry                        # when elements changed
turbo run test --filter=@plainworks/elements              # when theme changed (theme-variables contract)
```

A green scoped run is necessary but **not sufficient** — it will not catch unbounded streams/buffers, missing timeouts/cancellation, module-level singletons, import-time side effects, or a token leaking into a URL. Those are on the reviewer.
