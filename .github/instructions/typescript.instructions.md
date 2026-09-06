---
applyTo: "packages/**/*.ts,packages/**/*.tsx,apps/**/*.ts,apps/**/*.tsx,internal/**/*.ts,internal/**/*.tsx"
---

TypeScript source in a `@plainworks/*` package, app, or internal tool. Follow the full baseline in [`../copilot-instructions.md`](../copilot-instructions.md); this file is the load-bearing summary for `.ts`/`.tsx` work.

Scope every gate to the package you changed:

```bash
turbo run lint --filter=@plainworks/<name>
turbo run typecheck --filter=@plainworks/<name>
turbo run build --filter=@plainworks/<name>
turbo run test --filter=@plainworks/<name>
turbo run test --filter='...[origin/main]'   # affected set
bun run check-boundaries                      # layer + cycle gate (repo-wide, fast)
```

Code style:

- **ESM-only, strict TS.** `isolatedDeclarations`, `moduleResolution: bundler`. No CommonJS, no default-export barrels with logic. A package `index.ts` re-exports only.
- **Organize by concern; self-documenting by path.** A concern that spans more than one module is a **folder** with a re-export-only `index.ts` barrel plus concern-named files inside (e.g. `resilience/{retry,backoff,circuit-breaker,classify}.ts`); a single concern is one clearly named file. The path must convey the concern without opening the file — no junk-drawer `utils`/`helpers`/`core`, no bare verb modules/exports (`compose`, `classify`), qualify them (`pipeline/interceptor.ts` → `composeInterceptors`). Fold proactively when a second sub-concern appears, not once a file is "too long".
- **No `any` in a public surface.** Prefer `unknown` + narrowing, generics, `satisfies`, discriminated unions. No unchecked `as`/`!` to launder a type. Typed errors (a small typed error / result), never `throw "string"`.
- **Server-safe by default.** The `.` entry imports no React/DOM/host global. Interactive code goes in a module with a top-of-file `"use client"` directive, exported from `./client`. tsdown preserves the directive per-module — never add a global banner. A server-only module (especially `auth` token custody) must not be imported by a `"use client"` module.
- **No import-time side effects; no module-level singletons.** Importing a module must not dial the network, read env, or open a handle. Stores, query clients, and sessions come from **per-request factories** (SSR/RSC-safe). Adapters register through an explicit `register()` / `createX({...})` into an injected registry — never a module-global mutable registry or string service-locator.
- **Layer direction.** Import `@plainworks` packages only from a strictly lower layer. A cross-layer need defines the seam in the lower package (`std` owns shared contracts/event shapes) and implements it higher. `check-boundaries` fails on any upward/sideways import or cycle.
- **Async discipline.** Timeout every remote call with an `AbortSignal`; give every stream/subscription/timer explicit teardown; bound buffers; unsubscribe on shutdown.
- **Reuse the lower owner.** Errors, result/guards, retry/backoff, contracts live in `@plainworks/std` — extend it rather than re-implement locally.

Tests (Vitest, test-first):

- Write the failing test first, then the minimal code, then refactor while green — failure paths included. Behavioral, deterministic (injected clock, seeded RNG, no real net/FS).
- Coverage ≥ 80% per package (≥ 85% for `auth`); the generated `vitest.config.ts` sets the threshold.
- Reuse shared fakes/harnesses from `@plainworks/testkit`; never hand-roll a one-off fake that duplicates one.
- `.test.ts` for node-env logic; `.test.tsx` runs under jsdom for client packages.
