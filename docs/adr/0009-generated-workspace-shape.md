# 0009 — Workspace shape is generated, not hand-written

**Status:** Accepted · **Date:** 2026-09-30

## Context

Each package's `exports`, `files`, scripts, and preset dev dependencies were hand-maintained next to its build entries. They drifted: an entry built but wasn't exported, or an export pointed at a file the build no longer made. New packages copied whichever neighbor looked closest.

## Decision

Every workspace follows one of four **profiles**, chosen by where it lives: **package**, **cli**, **tool**, or **app**. `internal/shape` owns them.

- A package describes its entries once, as the typed `build` export of its `tsdown.config.ts`. For `ui` and `elements`, their codegen manifest writes it.
- `bun run sync-shape` derives the rest of the manifest from that description. `check-shape` runs in `verify` and fails on drift.
- Every export carries a `@plainworks/source` condition pointing at `src`, so editors, tests, typecheck, and the layer gate all resolve source the same way. Packing strips it, so a tarball never points at `src`.
- Generators (`bun run gen package`, `bun run gen tool`) write only hand-written fields, then run `sync-shape`, so a new workspace passes `check-shape` untouched.

## Consequences

- Adding a subpath is one line in `tsdown.config.ts` plus `sync-shape`.
- Birth and drift read the same data, so a generated workspace can't start off-profile.
- Derived manifest fields are never edited by hand.
