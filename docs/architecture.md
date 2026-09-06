# plainworks architecture

This document is the canonical statement of the plainworks **taxonomy**, **layer map**, and the **two axes** that shape every decision.

## The two axes

Every package is placed against two independent axes.

### Axis 1 — Distribution

How a consumer takes the code.

- **npm (versioned dependency)** — infrastructure you don't fork: `std`, the connection/auth/query engines, adapters, testkit. Semver'd, imported, upgraded. **This repo.**
- **registry (copy-in), later** — the *ownable* surface: UI, hooks, presets, templates. A shadcn-style copy-in (more capable, for complex components) that users edit and own. A **parked**, future deliverable — not part of the foundation.

### Axis 2 — Host-independence

Where the code can run. The kit **assumes no host**: Next.js, a Vite SPA, Astro, TanStack Start, Remix — or a runtime that doesn't exist yet — all *plug in*.

- Every package ships a **server-safe `.` entry**: no React, no DOM, RSC/edge-safe.
- Interactive packages add an optional **client `./client` entry** carrying a per-module `"use client"` directive. Client is **never** the default import.
- Framework glue lives in thin, optional adapters the consumer opts into — never in a core.

The server/client split is an **import boundary**, enforced at build (tsdown emits the two entries from per-module directives) and, for token-custody code like auth, at review: a server-only module must never be pulled into a `"use client"` graph.

## Taxonomy

One concern, one plain word, the **same word everywhere**. Banned names: `core`, `engine`, `foundation`, and junk-drawer `utils`. The bottom module is **`std`** (`@plainworks/std`) — a charter-guarded, zero-dependency, host-independent standard library. Anything with a real concern graduates to its own one-word package.

## Layer map

```
L0  std                                   errors/result/guards/contracts (seams), no React
L1  state (seam + zustand adapter) · ui   (registry later)
L2  connection (+sse/ws) · connect (RPC) · query (TanStack wiring)
L3  auth (core + oidc/jwt/apikey/BYO adapters, server/client split)
L4  app (providers, harness) · testkit · mocks     (route tree stays app-local)
```

**The rule:** a package in `Ln` may import `@plainworks` packages only in a **strictly lower** layer. Same-layer ("sideways") and upward imports are forbidden. When a higher layer needs to plug into a lower one, **define the seam in the lower layer and implement it higher** (the gokit/rskit rule) — e.g. the `AuthHeaderProvider` seam and event shapes live once in `std`; connection/auth implement against them. No cross-boundary reach, no duplicated seam copies to drift.

Enforcement: **dependency-cruiser** — configured in the dedicated [`@plainworks/boundaries`](../internal/boundaries) package ([`.dependency-cruiser.cjs`](../internal/boundaries/.dependency-cruiser.cjs)) — encodes this map from a single `LAYERS` table and fails CI on any upward/sideways import or cycle, naming the offending file and rule. A fixture-backed test in that package proves the gate actually rejects an upward import (so it can never go vacuously green).

## Architecture invariants

These hold for every package and are checked in review + gates:

- **No import-time side effects.** Adapters (auth, connection transports) register via an explicit `register()` / `createX({...})`; importing a module never dials the network or reads env.
- **No module-level singletons.** Stores, clients, and sessions are created by **per-request factories** (SSR/RSC-safe), never a package-level mutable global.
- **Explicit adapter registration** via an injected registry — no global registry, no service-locator lookup by string.
- **Header-only auth** — no token in a URL/query string.
- **Typed errors** — no thrown strings; **no `any`** in public APIs.
- **Accessible & responsive by default** — interactive `./client` code meets WCAG 2.2 AA (semantic roles, keyboard/focus, contrast, target size), is mobile-first and fluid (no fixed-pixel traps; container queries for component adaptivity), and honors `prefers-reduced-motion` / `prefers-color-scheme`; each component test carries an axe assertion.
- **ESM-only**, `exports`/`types`/`files` discipline; each package ships a real `dist` (tsdown), `typecheck` is a separate script from `build`.

## Governance

| Concern | Tool |
|---|---|
| Task runner / caching | Turborepo |
| Package generator | `@turbo/gen` via `bun run gen` (golden template; CI regenerates both variants and runs every gate on the output) |
| Build | tsdown (ESM-only, per-module `"use client"`, ships `dist`) |
| Lint / format | Biome |
| Layer boundaries + cycles | dependency-cruiser (in `@plainworks/boundaries`) |
| Version sync (single catalog) | Syncpack `catalog` policy (gate + fix) + Sherif (cross-package divergence) |
| Tests / coverage | Vitest — generated default ≥ 80% per package; security-critical packages (e.g. `auth`) raise their own threshold to ≥ 85% |
| Releases | Changesets |

Dependency versions are pinned in **one place** — the bun **catalog** in the root `package.json`. Every package — including the `react` / `react-dom` peer ranges of publishable packages — references `catalog:` rather than an inline version. This is enforced, not just conventional: Syncpack's `catalog` version group fails CI (`NotUsingCatalog` / `MissingFromCatalog`) if any package inlines a version or names a dependency absent from the catalog, and Sherif additionally flags any dependency that resolves to different versions across packages. Together they keep the single source honest.

### TypeScript: 6 now, 7 later (do not bump blind)

The catalog pins **`typescript` at `^6.0.3`** deliberately. TypeScript 7 (the native Go `tsgo` compiler) does **not** yet ship a JavaScript Compiler API (planned for 7.1+), so the entire TS-AST tooling layer this repo depends on — **dependency-cruiser** (the boundary/cycle gate), `typescript-eslint`, and friends — cannot run on TS7 today. Bumping `typescript` to 7 would make dependency-cruiser silently stop extracting imports and **disable the layer gate** rather than fail loudly — so a test in `@plainworks/boundaries` asserts the catalog `typescript` stays on the 6 line and **fails CI** the moment someone raises it. That is the enforcement; the sentence below is why.

The migration is pre-wired to be a one-file flip. The only consumer of the TS Compiler API, dependency-cruiser, is isolated in **`@plainworks/boundaries`** together with its own `typescript` dependency. When the Compiler API lands on TS7, adopt it by aliasing `typescript` → `@typescript/typescript6` **in that package's `package.json` only** (or moving the rest of the repo to 7 while boundaries stays on the 6-compatible shim), then relax the guard. No repo-wide churn, no other package touched. Until then: **do not raise the catalog `typescript` past 6** without re-homing the gate first.
