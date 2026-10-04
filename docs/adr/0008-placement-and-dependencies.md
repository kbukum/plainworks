# 0008 — Placement follows the layer map, and each concern has one owner

**Status:** Accepted · **Date:** 2026-09-30

## Context

The audit found the same helpers copied across packages (emitters, list bridges, retry wrappers) and code placed where it was first needed rather than where it belongs. Each copy was a second owner, and several had already drifted.

## Decision

- **One concern, one owner.** Before writing code, reuse or extend the lowest package that owns the concern. Never keep a second copy.
- **Core contracts, separately owned integrations.** Consumers bring adapters or install packages the kit ships. Core never bundles a technology backend, its driver declarations, or its re-exports. The integration depends on core contracts and owns the SDK/driver; optional peers and subpaths do not reverse that ownership.
- **Dependencies point strictly down.** A package in layer `Ln` imports `@plainworks` packages only from lower layers. `internal/boundaries/layers.json` is the single source of the map, and the gate fails closed for a package missing from it.
- **Tests get one narrow carve-out.** Test files may import `testkit` and `mocks` upward, because those are test tooling. Production code never may.
- **Apps are consumers.** Apps depend only on published surfaces; no package imports an app. Shared demo code an app ships to users (the starter's sample backend and live stream) lives in a published package, not in a private workspace.
- **Demos do not set infrastructure policy.** A starter may explicitly select an integration, but that choice cannot make the same framework, database, or identity service necessary for other consumers.
- **Name by path.** A concern that spans modules is a folder with a re-export-only `index.ts`. No `utils`, `helpers`, or `core`, in packages or apps.

## Consequences

- A reader finds a concern by its path, and a fix lands once.
- An ejected starter compiles outside the monorepo, because it never reached into a private workspace.
- A cross-layer need defines a seam below instead of adding an import (see [0006](./0006-seams-go-down.md)).
