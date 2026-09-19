# 0004 — Resilience primitives stay in `std`

**Status:** Accepted · **Date:** 2026-09-19

## Context

Retry with backoff, timeouts, error classification, and bounded queues are needed by nearly every package that touches a network or a stream — `http`, `channel`, `connect`, `query`, and `auth` all lean on them. They could live in their own resilience package, but that would sit above `std` and force every consumer up a layer to reach primitives they all share.

## Decision

Resilience primitives stay in `@plainworks/std` (`std/resilience`: `backoff`, `retry`, `timeout`, `classify`, `bounded-queue`). `std` is the zero-dependency base every layer may import, so these primitives reach every consumer through the lowest possible seam.

## Consequences

- No package has to import upward or sideways to retry, time out, or bound a buffer.
- `std` stays the single owner of the shared resilience vocabulary, avoiding duplicate backoff/timeout implementations.
- `std` must keep these primitives host-neutral, since everything above depends on them.
