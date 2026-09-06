# Pass 00 — Structure and placement

Confirm every touched (or, in project mode, every existing) item lives in the right workspace root, package, and layer, and that the dependency direction stays acyclic. This is the first gate: misplaced code makes every later pass unreliable, so reject on failure here before going further.

> **Run in a separate, clean-context agent** with a high-capability model — never inline in the session that wrote the code. A plan/spec may be passed in as a scope checklist only; it never excuses a baseline violation.

**Scope note.** *Changes mode:* check the packages the diff touches plus the affected area — a change to `std` or a core seam affects every package that implements it and every consuming app. *Project mode:* sweep every workspace member and its dependency edges; the rules below are invariants for the whole kit.

## The layering invariant

Dependency direction is explicit and acyclic; a package in `Ln` imports `@plainworks` packages only in a **strictly lower** layer. A cycle, an upward import, or a sideways (same-layer) import is a **blocker**. The three roots:

| Root | Path | Owns |
|------|------|------|
| packages | `packages/<name>/` | the published `@plainworks/*` kit packages |
| apps | `apps/<name>/` | examples/showcase and consuming apps (route tree stays app-local) |
| internal | `internal/<name>/` | dev-only tooling, never published (`boundaries`, `tsdown-config`) |

The layer map (single source: the `LAYERS` table in `internal/boundaries/.dependency-cruiser.cjs`):

```
L0 std · L1 state·ui · L2 connection·connect·query · L3 auth · L4 app·testkit·mocks
```

## Checks

- **Package placement.** A published capability → `packages/<name>/`. A dev/test-only tool → `internal/<name>/`. An app/example → `apps/<name>/`. A publishable concern living under `internal/`, or dev tooling published as a package, is a structure violation (blocker).
- **Acyclic, downward-only edges.** No package imports a same- or higher-layer `@plainworks` package; no cycle. Gated by `bun run check-boundaries` — run it. `std` imports no other `@plainworks` package at all.
- **In the `LAYERS` map.** Every package must be in the map. A package absent from it may import no other `@plainworks` package (the gate fails **closed**). A new package added to `packages/` but not to `LAYERS` (and mirrored in README + `docs/architecture.md`) is a should-fix.
- **Seam-defined-low.** A cross-layer need is satisfied by a seam **defined in the lower package** (`std` owns shared contracts / event shapes / the auth-header seam) and **implemented higher** — never by an upward import or a duplicated seam copy that can drift. A seam re-declared in two packages is a blocker.
- **Server/client split.** Each package ships a server-safe `.` entry (no React/DOM/host global) and, when interactive, a `./client` entry with per-module `"use client"`. A React/DOM import in the `.` entry, or token-custody (`auth` server) code reachable from a `"use client"` module, is a blocker (also pass 03).
- **Generator-born.** New packages are stamped by `bun run gen package`, not hand-written — so `package.json`/`exports`/`tsconfig`/`tsdown`/`vitest` match the golden shape. A hand-rolled package with a divergent `exports`/`files`/`type` or a missing `dist` build is a should-fix; regenerate from the template.
- **Barrel discipline.** `src/index.ts` (and `src/client.ts`) re-export only — no logic, no private items. Logic in a barrel is a should-fix; move it to a concern-named module.
- **Organize by concern; self-documenting by path.** Related modules are grouped into a **concern folder** with a re-export-only `index.ts` barrel plus concern-named files (as `rskit` groups `retry/{backoff,policy}.rs` under a barrel-only `mod.rs`, and as `packages/mocks` does with `data/`/`filter/`/`handlers/`); a single concern stays one clearly named file. Fold **proactively** as soon as a second distinct sub-concern lands in a file — not reactively once it is "too long"; a cohesive single-concern file is fine at any length. A pile of loosely related modules flat in `src/` (several concerns side-by-side with no folder) is a should-fix — promote them into concern folders in the same change.
- **Self-documenting names.** A module or export name must convey its concern on its own. Flag junk-drawer names (`utils`/`helpers`/`misc`/`core`) and bare, ambiguous verbs as standalone modules/exports (`compose`, `classify`, `handle`, `process`) — they should be qualified by concern (`pipeline/interceptor.ts` exporting `composeInterceptors`; `resilience/classify.ts` exporting `classifyError`). An ambiguous name a reader must open the file to understand is a should-fix.

## Detection starters

Flag candidates, not verdicts — read each hit.

```bash
# what each package actually imports from the kit
rg "from ['\"]@plainworks/" packages/*/src apps/*/src
# React/DOM in a server-safe entry (should only appear in ./client modules)
rg "from ['\"]react|document\.|window\." packages/*/src/index.ts
# logic leaking into a barrel
rg -n "." packages/*/src/index.ts | rg -v "export|import|^\s*//|^\s*$"
```

Then run `bun run check-boundaries` for the placement/acyclicity guard, and `turbo run test --filter=@plainworks/boundaries` if the `LAYERS` map changed.
