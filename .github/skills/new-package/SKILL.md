---
name: new-package
description: >-
    Scaffold a new @plainworks/* package the canonical way — drive the turbo gen golden generator
    (never hand-roll files), pick the one-plain-word concern name, place it in the layer map, and
    wire it into the boundaries LAYERS table so it is enforced from birth. Use when adding a new
    capability or package to plainworks, or when unsure where a package belongs.
---

# Adding a package to plainworks

plainworks packages are **born from a golden generator**, never hand-written — that is the structural guarantee that every package has identical, gate-passing `package.json`/`exports`/`tsconfig`/`tsdown`/`vitest`/`README`. Do not create package files by hand; drive the generator, then place the package in the layer map.

## Step 1 — Name it: one concern, one plain word

- The package name is its **single concern, one plain word, the same word everywhere** — `std`, `state`, `connection`, `connect`, `query`, `auth`, `app`, `testkit`, `mocks`, `ui`. Kebab-case is allowed for a genuinely two-word concern, but avoid it if one word fits.
- **Banned names:** `core`, `engine`, `foundation`, and junk-drawer `utils`. If you reach for one of those, the concern isn't named yet — find the real word.
- Before committing to a name, sanity-check the npm scope isn't already taken by something unrelated: `npm view @plainworks/<name> 2>/dev/null`.

## Step 2 — Decide the layer

Place the package in the map (source of truth: the `LAYERS` table in [`../../../internal/boundaries/.dependency-cruiser.cjs`](../../../internal/boundaries/.dependency-cruiser.cjs)):

```
L0  std                                   errors/result/guards/contracts (seams), no React
L1  state · ui
L2  connection · connect · query
L3  auth
L4  app · testkit · mocks
```

A package in `Ln` may import `@plainworks` packages only in a strictly lower layer. If the new package needs something from a higher layer, you have the direction wrong — **define the seam in the lower package and implement it higher** (`std` owns shared contracts/event shapes). Dev/test-only tooling that is never published goes under `internal/` (like `@plainworks/boundaries`, `@plainworks/tsdown-config`), not `packages/`.

## Step 3 — Generate it

```bash
bun run gen package
# name:        <one-plain-word>
# description: <one line>
# hasClient:   true only if the package ships interactive React (a "use client" ./client entry)
```

Or non-interactively (as CI does): `bun run gen package --args <name> "<description>" <true|false>`.

Answer `hasClient: true` only when the package has genuinely interactive React that must run client-side (hooks, DOM). A pure server-safe capability (`std`, most of `connection`/`auth` cores) is `false` — it ships only the `.` entry. `hasClient: true` adds the `./client` export, a `"use client"` module, jsdom test env, and `react`/`react-dom` `catalog:` peers.

Then install so the workspace picks it up:

```bash
bun install
```

## Step 4 — Wire it into the layer map

The generated package is **not yet in `LAYERS`**, so the boundary gate (correctly) forbids it from importing any other `@plainworks` package — it fails **closed**, never vacuously green. Add the package to the `LAYERS` table in `internal/boundaries/.dependency-cruiser.cjs` at its chosen layer, and mirror it in `README.md` + `docs/architecture.md`. A freshly generated package imports nothing internal, so it stays gate-passing until you add real cross-package imports.

Update the boundaries fixture test if the new layer relationship needs coverage (`turbo run test --filter=@plainworks/boundaries`).

## Step 5 — Build the capability test-first

Follow the [`apply-step`](../apply-step/SKILL.md) discipline: failing vitest test → minimal code → refactor while green. **Organize by concern from the start** — `src/index.ts` re-exports only; put logic in concern-named modules, and group a concern that spans more than one module into a **folder with its own re-export-only `index.ts` barrel** plus concern-named files inside (as `rskit` groups `retry/{backoff,policy}.rs` under a barrel-only `mod.rs`, and as `packages/mocks` does with `data/`/`filter/`/`handlers/`). Names must be self-documenting by path — no junk-drawer `utils`/`helpers`/`core`, no bare verb modules/exports (`compose`, `classify`); qualify them (`pipeline/interceptor.ts` → `composeInterceptors`). Reuse `@plainworks/std` (errors, result, guards, contracts, resilience) rather than re-owning a concern. Security-load-bearing packages (`auth`) raise their `vitest.config.ts` coverage threshold to ≥ 85%.

For a `hasClient` package, the server `.` graph holds the pure logic/types; the `"use client"` leaf holds only DOM/hook-bound code and never imports server-only auth. Interactive components are **accessible and responsive by default** — semantic roles, keyboard/focus, WCAG 2.2 AA, mobile-first/fluid layout with container-query adaptivity, `prefers-reduced-motion`/`-color-scheme` — and each component test queries by role (`@testing-library/user-event`, not `fireEvent`), mocks the network with MSW, and carries an axe assertion. See [`../../instructions/components.instructions.md`](../../instructions/components.instructions.md) and review pass [`08`](../review/references/08-ui-accessibility.md).

## Step 6 — Validate

```bash
bun install
turbo run lint typecheck build test --filter=@plainworks/<name>
bun run check-boundaries
bun run check-versions
turbo run check-packaging --filter=@plainworks/<name>
bun run changeset          # add the release note
```

## Checklist

- [ ] Name is one plain concern-word; not `core`/`engine`/`foundation`/`utils`
- [ ] Created via `bun run gen package` (no hand-rolled package files)
- [ ] `hasClient` chosen correctly; server `.` entry stays React/DOM-free
- [ ] For a client package: components are accessible (WCAG 2.2 AA) and responsive; tests query by role, mock with MSW, and assert axe cleanliness
- [ ] Placed in the layer map and added to the `LAYERS` table (+ README + docs)
- [ ] Imports only strictly-lower layers; a cross-layer need is a seam defined lower
- [ ] `src/index.ts` re-exports only; logic in concern-named modules; multi-module concerns grouped into folders with barrel-only `index.ts`; names self-documenting by path (no `utils`/bare verbs); no `any` in the public surface
- [ ] check-versions · lint · typecheck · check-boundaries · build · test · check-packaging green; Changeset added

Per repo workflow, **create the branch and make edits only** — the maintainer commits and pushes.
