---
name: review
description: "plainworks: Review a diff, package, or tree for architecture, correctness, security, tests, and documentation."
---

# Review

Review code and evidence, not the author's reasoning. A plan defines scope; it never excuses a rule. Rules live in the [engineering standard](../../engineering.md); each lens below says what to look for and how severe it is.

## Execution

- Review directly. Launch an independent reviewer only when the user asks; give it the scope, constraints, and files, not the authoring transcript, and recheck its findings against source before acting.
- Reviews are read-only unless fixes are authorized. Preserve user edits and staging. Never commit, amend, push, resolve threads, or post replies as part of a review.
- For each real defect choose **Redesign, Align, Enhance, or Drop** with a one-line reason. Alpha owes no compatibility, so prefer the root-cause redesign.

## Modes

**Changes** (a branch, range, or working tree). Read `git diff <base>...HEAD`, including staged, unstaged, and untracked work when asked. Review the diff plus its blast radius: the rest of each touched file, close callers and callees, and every package that implements or consumes a changed seam. Pre-existing defects there are in scope; anything wider is reported, not fixed.

**Project** (the repo or a named package). State the boundary first, then sweep in this order, because each step makes the next reliable:

1. Placement and reuse: wrong layer or owner invalidates everything else.
2. Security and runtime: the defects that reach consumers.
3. Public API and consumer experience: what must stay stable after alpha.
4. Tests, UI, quality, docs and supply chain.
5. Gates: is each rule enforced, or only documented? Compare with [Known gaps](../../engineering.md#known-gaps).

A project review ends in a prioritized list, not a merge verdict.

**Review and fix** (only when fixes are requested). Review first, confirm the fix scope when it is not obvious, then fix root causes test-first and validate. Commits still need separate authorization.

## Lenses

Run placement and reuse first for any code change; a blocker there stops acceptance. Then load only the lenses whose trigger applies. Prose-only work uses the docs lens alone.

| Trigger | Lens |
|---|---|
| Packages, imports, entries, manifests, naming | [Placement](references/placement.md) |
| New helper, type, fake, or adapter | [Reuse](references/reuse.md) |
| Requests, streams, timers, effects, factories, errors | [Runtime](references/runtime.md) |
| Auth, cookies, URLs, crypto, untrusted input, logging | [Security](references/security.md) |
| Exports, types, errors, options, READMEs | [Public API](references/api.md) |
| Any behavior change | [Tests](references/tests.md) |
| Interactive client code or styles | [UI](references/ui.md) |
| Any code change | [Quality](references/quality.md) |
| Docs, dependencies, CI, release, atoms | [Docs and supply chain](references/docs-supply-chain.md) |

## Evidence and output

Run gates through the [validate skill](../validate/SKILL.md), scoped for changes and full for project reviews. Reuse fresh evidence. Green gates are necessary, never proof of lifecycle, security, or API correctness; grep hits are leads, not findings.

Report one line per finding, grouping repeated patterns:

```text
severity | file:line | defect and impact | rule | proposed action
```

- **Blocker:** broken behavior or contract, or a hard-rule violation.
- **Should-fix:** a substantiated correctness, maintainability, or consumer-experience defect.
- **Nit:** optional; never blocks.

List skipped lenses, unrun gates, and open uncertainty. Never invent findings.
