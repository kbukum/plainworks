# Review changes

Standing, re-runnable review of a **change set** in this repository — a branch, a commit range, or `HEAD~1`. Use it after every change set, especially fast AI-assisted work. It sequences the focused passes in [`references/`](./) over a diff and adds scope handling; the actual checks live in the focused files.

## Run this in a separate, clean-context agent — high-capability model

**Always dispatch this review to a fresh reviewer agent with no shared session context**, using a high-capability model (Claude Opus 4.8). A reviewer that "remembers" writing the code rationalizes it; an independent agent re-derives every judgment from the diff and the principles. Re-evaluate its findings before changing code.

- Hand the reviewer agent: the diff (or base ref), this file, and the [`references/`](./) folder. Nothing else from the authoring session.
- **Optional plan check.** If a plan/spec/issue exists, pass it in *as a scope checklist only* — "here is what this change set claimed to do; verify the diff actually did it, with tests." The plan defines intended scope; it never excuses a principle violation. If the diff diverges, report it; the baseline in [`../../../copilot-instructions.md`](../../../copilot-instructions.md) wins.

## Pass 0 — Scope and context

- Get the actual diff: `git diff <base>...HEAD --stat`, then per file. Review what changed **plus its blast radius** — the rest of each touched file, the code the change calls and is called by, and closely-related files in the same package. Do not audit the whole repo (that is [`review-project.md`](./review-project.md)), but do not tunnel-vision on the diff lines either.
- **Pre-existing problems in the blast radius are in scope.** A defect, dead code, duplicated concern, or design smell you read while reviewing is reported like any other finding. Because plainworks is pre-stable with **no backward compatibility owed**, prefer a root-cause **redesign** over patching the symptom (decide Redesign / Align / Enhance / Drop). Flag when a fix reaches beyond the touched files; never silently refactor unrelated code.
- plainworks is a foundation kit: a change to `std` or a core seam affects every package that implements it and every consuming app. List the affected packages/layers before reviewing, and note whether the change belongs in *this* package and layer at all.

## Passes — run in order, stop early on a structural failure

Work the focused files top to bottom. **Stop and reject as soon as a change fails pass `00` or `01`** — misplaced or duplicated code makes every later pass unreliable.

1. [`00-structure-placement.md`](./00-structure-placement.md) — package placement, acyclic layering + the `LAYERS` map, barrel discipline, server/client boundary, generator-born packages.
2. [`01-canonical-reuse.md`](./01-canonical-reuse.md) — reuse vs. reimplementation of a `std`/platform-owned concern. *(blocker class)*
3. [`02-principles.md`](./02-principles.md) — typed/minimal APIs, errors & resilience, async/concurrency, composition, current idioms, AI features.
4. [`03-security-privacy.md`](./03-security-privacy.md) — trust-boundary validation, header-only auth, PKCE/cookie MUSTs, server/client custody, crypto, data minimization.
5. [`04-quality.md`](./04-quality.md) — root-cause over patches, dead code, ESM/exports discipline, maintainability, Biome gates.
6. [`05-tests-tdd.md`](./05-tests-tdd.md) — TDD, determinism, coverage thresholds, `@plainworks/testkit` reuse.
7. [`06-docs-supply-chain.md`](./06-docs-supply-chain.md) — TSDoc, Conventional Commits, single catalog, Changeset present, SHA-pinned actions, `bun.lock`.
8. [`07-comments-tsdoc.md`](./07-comments-tsdoc.md) — comments and TSDoc explain the code as it is; rewrite or delete plan/history/process prose.
9. [`08-ui-accessibility.md`](./08-ui-accessibility.md) — **UI changes only** (skip with a note otherwise): WCAG 2.2 AA (roles/keyboard/focus/contrast/target size + an axe assertion), mobile-first fluid layout & container queries, `prefers-reduced-motion`/`-color-scheme`, code-split/memo discipline, and a component's server-safe logic kept out of its `"use client"` leaf.

Each focused file carries a "Changes mode" scope note — follow that mode here.

## Findings

```
severity (blocker / should-fix / nit) — file:line — what's wrong — which principle — suggested fix
```

See [`SKILL.md`](../SKILL.md) for severity definitions.

## Validation

**Scope every command to the changed package(s)** — do not run the full-tree gates here:

```bash
turbo run lint typecheck build test --filter=@plainworks/<name>
turbo run test --filter='...[origin/main]'   # only packages the diff affects
bun run check-boundaries                      # fast placement/acyclicity guard
bun run check-versions                        # catalog single-source
turbo run check-packaging --filter=@plainworks/<name>   # publint + attw on the built tarball
```

A green scoped run is necessary but **not sufficient** — it will not catch unbounded streams/buffers, missing timeouts/cancellation, module-level singletons, import-time side effects, or a token leaking into a URL. Those are on the reviewer.
