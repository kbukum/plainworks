# 0001 — Authorization lives in `auth`, not a separate package

**Status:** Accepted · **Date:** 2026-09-19

## Context

Authentication answers "who is this?"; authorization answers "may they do this?". A kit can ship authorization as its own package, as a full RBAC/ABAC policy engine, or as a small seam the consumer fills. A separate `authz` package would add a layer boundary and a public surface before we know whether a shared policy engine is even wanted, and most consumers already own their permission model.

## Decision

Authorization ships **now**, but as a typed seam plus guards inside `@plainworks/auth` — not as a separate package and not as a policy engine. `auth` owns the `Authorizer` contract and the host-neutral guards (`authz/policy.ts`, `authz/guard.ts`) with client gates (`client/gates.ts`) layered on top. A real RBAC/ABAC engine stays bring-your-own: consumers implement the `Authorizer` seam.

`authz` folds into `auth` unless and until a genuine policy engine lands with enough weight to justify its own package and layer edge.

## Consequences

- One package owns identity and access, so a consumer wires authorization through the same session it already has.
- No premature `authz` layer boundary to maintain.
- If a policy engine is later needed, it becomes a new lower-consumed seam, and this record is superseded rather than edited.
