---
"@plainworks/std": patch
"@plainworks/http": patch
"@plainworks/mocks": patch
"@plainworks/state": patch
"@plainworks/testkit": patch
---

Harden library packaging. Every published package now carries full npm metadata (`repository` with `directory`, `homepage`, `bugs`, `keywords`, `author`) and passes a new `check-packaging` gate — **publint** (`--strict`) plus **are-the-types-wrong** (`--pack --profile esm-only`) — that validates each built tarball's `exports`/`types`/`files` resolution for ESM consumers. The gate runs in CI and is wired into the golden generator, so future packages inherit both the metadata and the check. Releases gain an npm **provenance** path (SLSA attestation) via a trusted-publishing `release.yml` workflow, since `bun publish` cannot emit provenance yet. No runtime behavior change; the `react-server` export condition was evaluated and deliberately omitted (the neutral `.` entry is already server-safe by construction).
