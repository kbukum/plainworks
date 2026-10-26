---
name: new-backend
description: "plainworks: Add an opt-in, config-selected backend implementing the owning module's typed contract."
---

# New backend

**Consumers bring adapters.** Core owns the contract and a lean default; other backends plug in through an explicitly created adapter. Rules: [Ownership boundary](../../engineering.md#ownership-boundary), [Errors, async, and composition](../../engineering.md#errors-async-and-composition). Model: [dependency classification](../../../docs/architecture.md#dependency-classification).

## Where adapters live

Classify the concern first:

| Concern | Placement |
|---|---|
| Capability behavior and its typed contract | The canonical core owner. A shared seam moves lower (often `std`) only when a lower consumer needs it. |
| Seam adapter with no technology driver (a channel `sse`/`ws` transport, an `oidc`/`jwt`/`apikey` auth mechanism, the Zustand state store) | Beside its contract in the owning core package |
| Thin binding to a standard Web API (`state/web-storage`, `auth/form-post`) | A platform-binding subpath in `src/adapters/<name>.ts`, compiled by `tsconfig.adapters.json`, named after what it does |
| Database, provider SDK, exporter, framework, or native driver used by one consumer | That consumer's composition, for example a reference host's `src/server/` |
| The same integration shipped by the kit for reuse | Its own package that owns the driver. Generate it with the existing tooling; change tooling only for what that package needs. |
| App configuration, keys, routing, and integration selection | Consumer composition root |

## What the adapter must do

1. **Keep dependencies with their owner.** The integration owns its implementation and driver. Core holds neither, not even as an optional peer or re-export.
2. **Implement the core contract.** Never duplicate a contract; enhance the lower owner when a real shared need exists.
3. **Be selected explicitly.** A typed `createX({...})` or an injected registry. Nothing happens at import time.
4. **Respect host lifetimes.** The host picks process, request, or browser scope. Every resource has cancellation and teardown; borrowers never dispose owners; persistent data is never recreated per request.
5. **Declare its runtime.** A Node integration declares that with its owner and never enters core neutral or client graphs. Server credentials stay server-side; browser sessions stay opaque with no browser token fallback.
6. **Point downward.** Core never depends on the integration. A packaged integration has layer metadata and negative boundary tests.

Existing code is evidence, not permission to repeat a misplaced adapter. If the change replaces one, move all consumers and delete its old exports, driver declarations, tests in the wrong owner, and guidance. No compatibility aliases or forwarding subpaths.

The shadcn atoms in `@plainworks/elements` are **not** a backend. They are **vendored** and **locked**, so they have no adapter seam to extend; refresh them with [`update-atoms`](../update-atoms/SKILL.md), and route a deviation through the [deviation ladder](../../engineering.md#vendored-atoms).

## Steps

1. **Find the owner and callers.** Read the [concern map](../../../docs/architecture.md#concern-owners), then classify contract, shared mechanics, integration, and host configuration. Record a dependency graph before editing.
2. **Choose the smallest owner.** Seam adapters stay beside their contract. A driver used by one consumer stays with that consumer. Create a package only when the kit genuinely ships the integration for reuse, through `bun run gen package` and its layer entry.
3. **Implement test-first.** Run the owner's shared conformance cases (for example `@plainworks/auth/testing`) against memory, consumer-supplied, and integration implementations. Test invalid inputs, concurrency, cancellation, limits, and cleanup. Real native/filesystem/process proof belongs in integration tests.
4. **Wire consumers explicitly.** Keep a core-only consumer working without the integration or driver. The starter installs only the integrations it deliberately selects.
5. **Validate distribution.** Run the affected gates and the [clean consumers](../validate/SKILL.md#clean-consumers) proof. Check dependency licenses and advisories, and update the package's Changeset if needed. Never publish unless asked.

```bash
bun run check-shape
bun run check-boundaries
bun run verify --filter=<owner>
```

## Checklist

- [ ] The smallest owner holds implementation and driver; no core re-export or driver declaration
- [ ] Core contract supports a consumer-supplied implementation using public exports only
- [ ] Typed explicit construction, bounded lifetime, no import-time setup or global registry
- [ ] Shared contracts and real integration failures pass; server custody stays outside client graphs
- [ ] Core-only and integration clean installs prove dependency isolation and runtime support
- [ ] Superseded placement removed from code, manifests, consumers, and docs; Changeset covers the change

Edit only; commits and pushes need the user's authorization.
