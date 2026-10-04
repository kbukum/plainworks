---
name: new-backend
description: "plainworks: Add an opt-in, config-selected backend implementing the owning module's typed contract."
---

# Adding a backend adapter to plainworks

**Consumers bring adapters.** Core owns the contract and a lean default; alternative backends plug in through an explicitly created adapter. This mirrors the gokit/rskit backend-split principle, translated to idiomatic TS. Follow the [ownership baseline](../../engineering.md#product-and-ownership-boundary).

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

## The binding rules

1. **Separate dependency ownership.** The integration owns its implementation and SDK/driver declarations. Core contains neither, including optional dependencies/peers and integration re-exports. A core subpath is not a separate owner.
2. **Implements the core contract.** Do not duplicate contracts or export unrelated infrastructure from auth to make another package reuse it. Enhance the correct lower owner when a genuine shared need exists.
3. **Explicit selection.** The consumer calls a typed `createX({...})` or registers into an injected registry. No environment reads, network, file access, or cross-package registration at import time.
4. **Owned lifetime.** The host chooses process/request/browser-root scope; every resource has cancellation and teardown. Borrowers do not dispose their owners. Persistent data is not recreated per request.
5. **Lean core.** Keep a bounded memory default when it serves the contract. A native database is not a lean default merely because it runs locally.
6. **Runtime declaration.** A Node integration declares Node requirements with its owner (host or package) and compile profile. It must never enter core neutral/client graphs. Server credentials stay server-side; browser sessions remain opaque, without a browser token/refresh fallback.
7. **Layering.** An integration depends downward on core contracts; core never depends on it. A packaged integration has explicit layer metadata and negative boundary tests.

Existing code is evidence, not permission to repeat a misplaced adapter. If the change replaces one, move all consumers and delete its old exports, driver declarations, tests in the wrong owner, and guidance. No compatibility aliases or forwarding subpaths.

The shadcn atoms in `@plainworks/elements` are **not** a backend. They are **vendored** and **locked**, so they have no adapter seam to extend; refresh them with [`update-atoms`](../update-atoms/SKILL.md), and route a deviation through the deviation ladder in the [Vendored atoms](../../engineering.md#vendored-atoms) baseline.

## Steps

1. **Find the owner and callers.** Read the [concern map](../../../docs/architecture.md#concern-owners), then classify contract, shared mechanics, integration, and host configuration. Record a dependency graph before editing.
2. **Choose the smallest owner.** Seam adapters stay beside their contract. A driver used by one consumer stays with that consumer. Create a package only when the kit genuinely ships the integration for reuse, through `bun run gen package` and its layer entry.
3. **Implement test-first.** Run the owner's shared conformance cases (for example `@plainworks/auth/testing`) against memory, consumer-supplied, and integration implementations. Test invalid inputs, concurrency, cancellation, limits, and cleanup. Real native/filesystem/process proof belongs in integration tests.
4. **Wire consumers explicitly.** Keep a core-only consumer working without the integration or driver. The starter installs only the integrations it deliberately selects.
5. **Validate distribution.** Run affected gates and clean tarball consumption, including dependency absence in a core-only install and working native loading in an integration install. Audit/license-check dependencies and add the required Changeset; do not publish unless asked.

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

Per repo workflow, **create the branch and make edits only** — the maintainer commits and pushes.
