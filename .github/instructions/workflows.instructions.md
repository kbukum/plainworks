---
applyTo: ".github/workflows/**"
---

# CI workflows

- SHA-pin every action; keep a readable version comment. Default permissions to `contents: read`; elevate only the job that needs it.
- Keep ref-scoped concurrency/cancellation and the supported Node matrix aligned with manifests/CI policy. Use the declared Bun version and `bun install --frozen-lockfile`.
- Call `bun run verify`, not a copied gate list; `internal/verify` owns order. Preserve generated server/client/tool smoke coverage, including correct `"use client"` placement.
- Isolate generated fixtures to owned runner paths. Keep release automation separately permissioned, approved, and provenance-producing.

Use `act` where practical and check syntax, permissions, pins, triggers, and gate wiring. Do not publish or push as part of validation.
