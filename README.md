# plainworks

> A foundational, **host-independent** React/TypeScript kit — core capabilities plus pluggable
> seams, not a UI library with bolt-on packages.

plainworks gives you runtime-agnostic cores (no DOM/React/host assumptions) and thin, optional client bindings you opt into. Next.js, a Vite SPA, Astro, TanStack Start, Remix — or something that doesn't exist yet — all *plug in*. You keep your code simple; the seams stay replaceable.

> **Status: scaffold.** The workspace, boundary gate, package generator, and governance layer are in place, but no feature packages exist yet and nothing is published to npm. The first release will ship on the `0.1.0-alpha.x` line under the `alpha` dist-tag (matching gokit/rskit); until `0.1.0`, APIs may change without back-compat.

## Design charter

- **Flexibility over opinionation.** Ship core capability + pluggable adapters. Defaults are swappable via a seam.
- **Assume no host.** Every package splits into a **server-safe `.` entry** (no React/DOM, RSC/edge-safe) and an optional **client `./client` entry** (`"use client"`). Client is never the default import.
- **One concern, one plain word, same word everywhere.** No `core`, `engine`, `foundation`, or junk-drawer `utils`. The bottom module is `@plainworks/std`.
- **Explicit acyclic layers**, enforced in CI (see below). Lower never imports higher; a cross-layer need defines the seam in the lower layer and implements it higher.
- **No import-time side effects, no module-level singletons.** Stores, clients, and sessions use per-request factories; adapters register explicitly.

## Layer map

```
L0  std                                   errors/result/guards/contracts (seams), no React
L1  state (seam + zustand adapter) · ui   (registry later)
L2  connection (+sse/ws) · connect (RPC) · query (TanStack wiring)
L3  auth (core + oidc/jwt/apikey/BYO adapters, server/client split)
L4  app (providers, harness) · testkit · mocks     (route tree stays app-local)
```

A package in `Ln` may import only `L<n`. Enforced by **dependency-cruiser** — CI fails and points at the offending import.

## Two distribution axes

- **npm (versioned dep):** infrastructure you don't fork — `std`, the connection/auth/query engines, adapters, testkit. This repo.
- **registry (copy-in), later:** the *ownable* surface — UI, hooks, presets, templates. A parked, future deliverable.

## Quickstart (development)

```sh
bun install
bun run gen package        # scaffold a new package from the golden template
bun run check-versions && bun run lint && bun run typecheck \
  && bun run check-boundaries && bun run build && bun run test
```

## Governance

| Concern | Tool |
|---|---|
| Task runner / caching | Turborepo (`turbo`) |
| Package generator | `@turbo/gen` via `bun run gen` (golden template) |
| Build | tsdown — ESM-only, per-module `"use client"`, ships `dist` |
| Lint / format | Biome |
| Layer boundaries + cycles | dependency-cruiser (`@plainworks/boundaries`) |
| Version sync (single catalog) | Syncpack `catalog` policy (gate + fix) + Sherif (cross-package divergence) |
| Tests / coverage | Vitest |
| Releases | Changesets |

Versions are pinned in **one place** — the bun **catalog** in the root `package.json`. Every package references `catalog:` (peer ranges included); Syncpack's `catalog` policy fails CI if a package inlines a version, and Sherif fails CI on any cross-package version divergence.

## License

[MIT](./LICENSE)
