# Placement

Check first. Misplaced code makes every later lens unreliable, so a blocker here stops acceptance.

Rules: [Ownership boundary](../../../engineering.md#ownership-boundary), [Code structure](../../../engineering.md#code-structure). Model: [Architecture](../../../../docs/architecture.md), especially the [layer map](../../../../docs/architecture.md#layer-map), [entry points](../../../../docs/architecture.md#choose-an-entry-point), and [dependency classification](../../../../docs/architecture.md#dependency-classification).

**Changes:** the touched packages plus everything that implements or consumes a changed seam. **Project:** every workspace member and its dependency edges.

## Checks

| Finding | Severity |
|---|---|
| Upward, same-layer, or cyclic `@plainworks` import; `std` importing any `@plainworks` package | blocker |
| Seam declared in two packages instead of once in the lower owner | blocker |
| Technology integration, driver, optional peer, or forwarding export inside core | blocker |
| A reference host forcing its database, framework, or identity service on other consumers | blocker |
| React, DOM, or Node reaching a neutral graph; server custody reachable from a client module; `export *` or two paths for one name | blocker |
| Publishable concern under `internal/`, or dev tooling published | blocker |
| Package missing from `layers.json`, or hand edits between `layer-map` markers | should-fix |
| Package or tool not from the generator, hand-edited derived manifest fields | should-fix |
| Logic in a barrel; several concerns flat in `src/` with no concern folder | should-fix |
| Junk-drawer or bare-verb names (`utils`, `compose`, `handle`) that hide the concern | should-fix |

A separately owned integration may target a narrower runtime, but must declare it and never be presented as neutral. For an integration change, prove a core-only install and a consumer implementation of the public contract; review manifests and tarballs, not only source imports.

## Detection starters

Candidates, not verdicts; read each hit.

```bash
rg "from ['\"]@plainworks/" packages/*/src apps/*/src
rg "from ['\"]react|document\.|window\." packages/*/src/index.ts
rg -n "." packages/*/src/index.ts | rg -v "export|import|^\s*//|^\s*$"
bun run check-boundaries
bun run check-shape
bun run check-layer-map            # when layers.json changed
```
