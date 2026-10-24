---
applyTo: ".github/workflows/**"
---

# CI workflows

Follow [Dependencies and supply chain](../engineering.md#dependencies-and-supply-chain).

- SHA-pin every action with a readable version comment. Default to `contents: read` and elevate only the job that needs more.
- Keep ref-scoped concurrency, the supported Node matrix, the declared Bun version, and `bun install --frozen-lockfile` aligned with the manifests.
- Call `bun run verify`, never a copied gate list; `internal/verify` owns gate order. Keep the generated server, client, and tool smoke coverage, including `"use client"` placement.
- Generated fixtures use owned runner paths. Release automation stays separately permissioned, environment-approved, and provenance-producing.

Check syntax, permissions, pins, triggers, and gate wiring (use `act` where practical). Validation never publishes or pushes.
