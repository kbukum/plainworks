# plainworks development skills

[Agent Skills](https://docs.github.com/copilot/concepts/agents/about-agent-skills) for developing **plainworks itself** — loaded on demand by GitHub Copilot (CLI, coding agent, code review, IDEs) when a task matches a skill's description. These are **project skills** for contributors; they do not affect anyone who consumes `@plainworks/*` as a dependency.

Each skill is a folder with a `SKILL.md` (YAML frontmatter + workflow) and optional bundled reference files loaded only when the skill activates. They encode plainworks' permanent engineering baseline (see [`../copilot-instructions.md`](../copilot-instructions.md) and [`../../docs/architecture.md`](../../docs/architecture.md)) and drive tasks through the repo's `bun run` / `turbo` gates.

## Skills

| Skill | Use when |
|---|---|
| [`create-branch`](create-branch/SKILL.md) | Cut a branch off an up-to-date `main`, named by the high-level change (no batch/plan/step detail). |
| [`create-plan`](create-plan/SKILL.md) | Turn a non-trivial change into a reviewable plan under `tmp/` — README + numbered step files, bound to the baseline. |
| [`apply-plan`](apply-plan/SKILL.md) | Execute a `tmp/` plan from its first unfinished step onward, validating after each; resumable. |
| [`apply-step`](apply-step/SKILL.md) | Apply one plan step in context (README + prior steps), test-first against the baseline, then mark it done. |
| [`commit`](commit/SKILL.md) | Commit staged work with one compact Conventional-Commit message — no co-author trailer, no plan/batch/tool narration; one commit per branch (amend). |
| [`create-pr`](create-pr/SKILL.md) | Open a reviewer-friendly **draft** PR — high-level summary, honest template sections, bound to the baseline. |
| [`fix-reviews`](fix-reviews/SKILL.md) | Act on PR review comments by pattern — fix every instance across the change set, then commit and resolve the threads. |
| [`validate`](validate/SKILL.md) | Run the DoD gates (`check-versions · lint · typecheck · check-boundaries · build · test`) through `bun run`/`turbo`, scoped to the changed package(s). |
| [`review`](review/SKILL.md) | Run the standing engineering-baseline review over a diff or the tree, in a fresh clean-context agent (high-capability model). |
| [`new-package`](new-package/SKILL.md) | Scaffold a new `@plainworks/*` package by driving the `turbo gen` golden generator — never hand-rolled — then place it in the layer map. |
| [`new-backend`](new-backend/SKILL.md) | Add an adapter (state / connection transport / auth / query) as an explicit-registration module, with the default kept in core. |
| [`release`](release/SKILL.md) | Cut a release with Changesets — version, ESM/exports/gates green, publish to npm, SHA-pinned CI. |
| [`docs`](docs/SKILL.md) | Review/update docs to the repo's standards (flowing paragraphs, no hard wraps) and keep commands/structure/examples matching the code. |

## Conventions

- Skills are discoverable in Copilot CLI via `/skills`; project skills live under `.github/skills/` (also `.claude/skills` / `.agents/skills` are honored), personal skills under `~/.copilot/skills`.
- Claude Code slash commands under [`../../.claude/commands/`](../../.claude/commands/) are **thin routers** to these skills — each `/<name>` points at `.github/skills/<name>/SKILL.md`, the single source of truth. Edit the `SKILL.md`, never the router body.
- Run reviews (`review`) in a **fresh, clean-context agent** with a high-capability model (Opus 4.8), never inline in the session that wrote the code.
- Validation is `bun run` / `turbo`-first, scoped to the changed package(s) (`turbo run test --filter=@plainworks/<name>`, `--filter='...[origin/main]'` for the affected set); full-tree gates are for audits and releases.
- The **agent creates branches and makes edits; the maintainer commits and pushes.** Commit / push / open a PR only when explicitly asked; PRs are opened in **draft**.

## No sibling-parity skill

Unlike rskit (which mirrors gokit), plainworks is the only TypeScript kit in the family and has no sibling to track — so there is deliberately no `sibling-parity` skill. Cross-kit *spirit* (naming a concern the same, the seam-defined-low rule, the backend-split policy) is baked into the baseline and the `review`/`new-package`/`new-backend` skills, not a standing parity workflow.
