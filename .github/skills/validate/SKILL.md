---
name: validate
description: >-
    Build, typecheck, lint, boundary-check, version-check, and test plainworks changes through bun
    run and turbo — scoped to the packages that actually changed. Use whenever you need to validate a
    plainworks change, run the DoD gates, reproduce CI locally, or check the affected area of an edit
    before handing it off.
---

# Validating plainworks changes with bun run / turbo

plainworks is a bun-workspace monorepo (`packages/*`, `apps/*`, `internal/*`) driven by **Turborepo**. The root `package.json` scripts are the canonical gates; they run through `turbo` and are cache-correct (declared inputs/outputs). Prefer them over raw tool invocations, and **always scope to what changed** — the unscoped scripts are for CI sign-off.

## The Definition of Done — six gates

Every change must pass these, in this order (same order CI runs them):

| Gate | Root script | What it enforces |
|---|---|---|
| Versions | `bun run check-versions` | Sherif + Syncpack: every dep resolves via the bun **catalog**; no inline drift |
| Lint / format | `bun run lint` | Biome clean (`bun run format` to fix) |
| Types | `bun run typecheck` | `tsc --noEmit` across packages + the generator config |
| Boundaries | `bun run check-boundaries` | dependency-cruiser: zero upward/sideways imports, zero cycles |
| Build | `bun run build` | tsdown, ESM-only, ships `dist/` |
| Tests | `bun run test` | Vitest, coverage ≥ 80% per package (≥ 85% for `auth`) |

Plus: a **Changeset** added (`bun run changeset`) and the architecture invariants (no import-time side effects, no module-level singletons, header-only auth, typed errors, no `any` in public APIs).

## Golden rule: scope to what changed

Never rebuild the whole tree for a small change. Scope with turbo filters:

```bash
turbo run lint typecheck build test --filter=@plainworks/<name>   # one package (+ its deps)
turbo run test --filter='...[origin/main]'                        # only packages affected by the diff
turbo run build --filter=@plainworks/<name>...                    # a package and everything that depends on it
```

Within a single package you can also run its own scripts directly:

```bash
cd packages/<name>
bun run test        # vitest run --coverage
bun run typecheck   # tsc --noEmit
bun run build       # tsdown
bun run lint        # biome check .
```

## Repo-wide-but-fast gates

Two gates are cheap and analyze the whole graph at once — run them as-is, not per package:

```bash
bun run check-boundaries    # dependency-cruiser over packages/apps/internal (source-level; no build needed)
bun run check-versions      # sherif + syncpack lint
```

`check-boundaries` also has a fixture-backed test proving the gate rejects an upward import — if you touch the `LAYERS` map or `.dependency-cruiser.cjs`, run `turbo run test --filter=@plainworks/boundaries` too.

## Generator changes

If you touched `turbo/generators/**`, prove the golden template still yields a gate-passing package (both variants), then remove the throwaway:

```bash
bun run gen package --args scratch "scratch" false && bun install
turbo run lint typecheck build test --filter=@plainworks/scratch
rm -rf packages/scratch && bun install
```

## Before you hand work off

The minimum passing standard for a self-contained change: `check-versions`, `lint`, `typecheck`, `check-boundaries`, and scoped `build` + `test` green (vitest race/shuffle safe), plus a Changeset. Escalate to the unscoped `bun run build && bun run test` only for an audit or release.

Treat a green run as **necessary but not sufficient**: it does not catch unbounded streams/buffers, missing timeouts/cancellation, module-level singletons, import-time side effects, or a token leaking into a URL. Those are on the reviewer.

For a client/UI package, accessibility and responsiveness are part of the acceptance bar (review pass [`08`](../review/references/08-ui-accessibility.md)): each component test asserts axe cleanliness in-band with the scoped `turbo run test`. There is **no separate a11y CI script today** — don't invent one; the axe assertion lives in the component's own Vitest test, and a dedicated a11y/visual gate (e.g. Playwright + axe over the showcase) is a deferred gate for the `ui`/`examples` steps.

Per repo workflow, **make edits only** — the maintainer commits and pushes.
