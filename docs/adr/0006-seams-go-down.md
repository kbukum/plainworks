# 0006 — Shared seams go down to `std`

**Status:** Accepted · **Date:** 2026-09-30

## Context

Packages sometimes need the same concern without being allowed to import each other. `http` and `channel` both report operations, and `connect` needs to invalidate the query cache that `query` owns. Both `connect` and `query` sit in L2, so one can't import the other. Copying the code into each caller gives two owners that drift.

## Decision

**The seam goes down; the implementation stays up.** A concern two packages share becomes a small, structural seam in `std/seam`. One higher package implements it, and every caller takes it as an injected value.

| Seam | Implemented by | Taken by |
|---|---|---|
| `Telemetry` (operation start, finish, error, one-shot events) | `observability` (`createTelemetry`) | `http`, `channel` |
| `CacheInvalidator` (exact or partial keys, cancel in flight) | `query` | `connect` |

A seam stays as small as its callers need today. Telemetry records no payloads and redacts its fields. Its attribute names follow OpenTelemetry conventions, but `std` never depends on the OpenTelemetry API, so an OTel adapter is a thin mapping.

## Consequences

- The layer map never bends: no upward or sideways import is needed to share a concern.
- A host wires one telemetry sink for every transport that reports.
- A seam that grows beyond what its callers use is a defect. Widen it only when a caller needs it.
