# 0003 — Persisted state stays thin cache-routing

**Status:** Accepted · **Date:** 2026-09-19

## Context

Persisting UI state to storage invites scope creep toward a full offline/sync engine — background reconciliation, conflict resolution, and a server sync protocol. That is a large, opinionated subsystem that most apps do not need and that competes with dedicated sync libraries.

## Decision

Persisted state stays **thin**: it routes a scoped value to a storage backend and reads it back, with versioning and migration on read so a stored shape can evolve safely (`state/client/scope/persisted-source`, with an `envelope` carrying the version). It does not grow a sync or offline engine.

## Consequences

- The persistence surface stays small, predictable, and easy to reason about across SSR and the client.
- A stored value can be migrated forward without a breaking read.
- Apps that need real offline sync compose a dedicated library rather than expecting it from this seam.
