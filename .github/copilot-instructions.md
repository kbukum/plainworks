# plainworks

Foundational, **host-independent** React/TypeScript kit: runtime-agnostic cores plus thin, optional client bindings. Cores assume **no host** (no DOM/React/host globals) so Next.js, a Vite SPA, Astro, TanStack Start, Remix — or a runtime that doesn't exist yet — all plug in. The authoritative taxonomy and layer map live in [`../docs/architecture.md`](../docs/architecture.md); this file is the load-bearing engineering baseline every change is held to.

## Engineering principles

Shared baseline — apply to all work here:

- **Phases:** discover → decide (Redesign / Align / Enhance / Drop / Leave) → implement completely → validate. Prefer root-cause redesign over symptom patches; **no compatibility shims** in pre-stable code. Implement the *simplest* design that fully solves it — flexible, extensible, scalable — on current idiomatic TS best practices, not folklore. Complexity must earn its place.
- **Layering & reuse:** explicit, acyclic dependency direction — a package in `Ln` imports `@plainworks` packages only in a strictly lower layer (see the layer map). Reuse or enhance the canonical lower owner before writing new code; never duplicate a shared concern (errors, result/guards, retry/backoff, contracts/seams, event shapes). A cross-layer need **defines the seam in the lower layer and implements it higher** — never an upward or sideways import. `@plainworks/std` is the bottom and depends on no other package.
- **Structure & naming (self-documenting by path):** organize by concern the way `rskit` does — a concern that spans more than one module is a **folder** with a re-export-only `index.ts` barrel (the TS equivalent of a barrel-only `mod.rs`) plus concern-named files inside; a single concern is one clearly named file. The folder/file path must tell a reader *what the code is without opening it*: no junk-drawer `utils`/`helpers`/`misc`/`core`, and no bare, ambiguous verb modules or exports (`compose`, `classify`, `handle`, `process`) — qualify by concern (`pipeline/interceptor.ts` exporting `composeInterceptors`, `resilience/classify.ts` exporting `classifyError`). Group **proactively** when a second sub-concern appears, not reactively once a file is "too long"; a cohesive single-concern file is fine at any length. Barrels (`index.ts`/`src/index.ts`) re-export only — never logic.
- **APIs:** typed and minimal; **no `any`** (and no unchecked `as`/`!`) in public surfaces — use `unknown` + narrowing, generics, and discriminated unions. Actionable typed errors that preserve cause; never throw strings.
- **Errors & resilience:** no swallowed errors or success-shaped fallbacks on runtime paths; timeout every remote call (`AbortSignal`); bounded, jittered retries for idempotent operations only; reconnect/backpressure/circuit-break and degrade gracefully.
- **Concurrency & async:** every stream/subscription/timer/`AbortController` has explicit ownership, cancellation, and teardown; bound queues and buffers with documented backpressure; drain and unsubscribe on shutdown. No unbounded in-memory buffering.
- **Host-independence (the axis):** "assume no host" targets **any web-standard runtime** — a package runs where its declared **runtime primitives** exist. The **universal WHATWG value primitives** the repo shim binds — `AbortController`/`AbortSignal`, `Headers`, `URL`/`URLSearchParams`, `Response`, `TextDecoder` (pure, deterministic, present on every target runtime) — may be used **directly**; every primitive with real **host variance or that needs test substitution** (`fetch`, SSE/`WebSocket` transports, `crypto.subtle`, token storage) is an **injected seam with a platform default**, never a hard import (`http`'s `options.fetch` is the reference). The tie-breaker: inject what varies by host or must be faked; use directly the standardized value types the shim binds. Entries fall in **three buckets**: **neutral `.`** (no React/DOM — server, edge, workers, RSC, **and React Native**), **DOM `./client`** (per-module `"use client"` — browser SPA, Next client, **Electron renderer**), and **React-without-DOM** (RN/Expo — DOM `ui` out of scope, but `state`/`query`/`channel`/`auth` client hooks stay DOM-free). Client is never the default import. The **portability gate** is the shared **ES2023-only compile config** (`tsconfig.base.json`: no DOM/Node lib, `types: []`) plus the explicit `types/universal-web.d.ts` global shim — enforced at `typecheck` on every package and proven by fixtures in `@plainworks/boundaries`: the neutral `.` entry fails to compile the moment it names a host-only global (`document`/`window`/`localStorage`/`navigator`/`EventSource`) or Node builtin, because that name is simply undeclared (not a regex heuristic). Token-custody code (auth server) must never be pulled into a `"use client"` graph — an enforced import boundary, not a convention.
- **Composition:** explicitly injected registries and config-driven selection. **No import-time side effects** (importing a module never dials the network, reads env, or opens a handle); **no module-level singletons** — stores, query clients, and sessions are built by per-request factories, SSR/RSC-safe. Adapters register via an explicit `register()` / `createX({...})`, never a package-global mutable registry or service-locator lookup by string.
- **Security & privacy:** validate at every trust boundary; least-privilege and secure-by-default; **header-only** auth (never a token in a URL/query string); `Secure`+`HttpOnly`+`SameSite` cookies with the `__Host-` prefix; Authorization Code + PKCE `S256` only (implicit dead); current crypto only (Web Crypto; reject `alg: none`, no MD5/SHA-1 for security); minimize, redact, and retention-bound sensitive data — never log tokens or payloads. Treat all rendered user/model/retrieved content as untrusted (no `dangerouslySetInnerHTML` with unsanitized input); the kit is CSP-friendly (no inline-script requirement, no `eval`) so a consumer can enforce a strict `nonce` + `strict-dynamic` policy without `unsafe-inline`; tokens never live in `localStorage`/`sessionStorage` (BFF `__Host-` cookie is the default, in-memory access token the SPA fallback).
- **Accessibility & responsive UI (the client-binding acceptance bar):** interactive `./client` code is accessible and responsive **by default, not as a follow-up** — semantic HTML with correct ARIA roles, full keyboard operability with a visible focus ring, and WCAG 2.2 AA (text contrast, `24×24` CSS-px minimum target size, focus never obscured). Every client component carries an axe assertion in its test (automation catches ~half of WCAG issues — it is a floor, not proof; keyboard/focus/roles are still reviewed). Layout is mobile-first and fluid — relative units, `clamp()` type (never `vw`-only, it breaks zoom), `minmax()`/`auto-fit` grids, no fixed-pixel width/height traps; component-scoped adaptivity uses CSS **container queries** over viewport media queries; honor `prefers-reduced-motion` and `prefers-color-scheme`.
- **Performance:** code-split heavy and route-level surfaces behind `React.lazy` + `Suspense`; keep components small and let the React compiler memoize — reach for `memo`/`useMemo`/`useCallback` only where a profile shows a measurable win, never prophylactically; virtualize large lists; keep the client bundle tree-shakeable (per-component subpath exports, `"sideEffects": false`).
- **Tests:** behavioral and deterministic; **test-first** (failing test → minimal code → refactor while green); cover failure paths; injected clocks and seeded RNG, no real network/FS in unit tests; race/shuffle safe. Coverage ≥ 80% per package, ≥ 85% for security-load-bearing packages (`auth`). React/DOM tests assert what the user perceives — query by role/label (`getByRole` first, `getByTestId` last resort), drive interaction with `@testing-library/user-event` (not `fireEvent`), never couple to implementation detail (class names, internal state); mock the network at the boundary with **MSW** (`onUnhandledRequest: "error"`), not by stubbing `fetch`. Shared fakes/harnesses live in **`@plainworks/testkit`** (a shipped product) — never hand-rolled per test.
- **AI / model features:** treat model output and retrieved context as untrusted; enforce structured, validated outputs; least-privilege tool calls with a human gate on destructive actions; version prompts/models and gate changes on evals.
- **Supply chain:** one shared version list (the bun **catalog**) enforced by Sherif + Syncpack; ESM-only with correct `exports`/`types`/`files`; pin CI actions by commit SHA; audit and license-check new dependencies; Changesets-driven releases.
- **Keep code current:** current idioms and standards, not old habits — verify the dependency is maintained, the platform/stdlib (Web APIs, `AbortController`, `structuredClone`) doesn't already cover it, and no open advisory applies.
- **Best practices over parity, consistency above both:** current idiomatic TS/React best practices outrank any cross-kit mimicry of gokit/rskit — parity is spirit and intuition-transfer, never a forced non-idiomatic type or API shape. Above both, be **consistent across plainworks**: internal consistency of naming, seams, and package shapes is one of the most important properties.

Standing, re-runnable development skills that encode this baseline live in [`skills/`](skills/README.md) — the `review` skill runs the review passes in a fresh, clean-context agent (high-capability model) after every change set and before releases (reviewing the change's **blast radius**, not just the diff, and reporting/fixing pre-existing problems it surfaces, redesign over patch); `create-branch`, `create-plan`, `apply-plan`, `apply-step`, `commit`, `create-pr`, `fix-reviews`, `validate`, `new-package`, `new-backend`, `docs`, and `release` cover the rest of the workflow. Validation is driven through `bun run` / `turbo`, scoped to the changed package(s).

## Stack

- **Language:** TypeScript, pinned at **`^6.0.3`** in the catalog *deliberately* — see the TS6-now / TS7-later seam below. Strict, `isolatedDeclarations`, `moduleResolution: bundler`, ESM-only.
- **Runtime / package manager:** **bun** (`bun@1.3.6`); Node `^22.12 || ^24 || >=26` (N / N-1 LTS matrix in CI).
- **Task runner / caching:** **Turborepo** (`turbo`) — cache-correct, topological, affected-aware. Dev-only; zero consumer footprint.
- **Build:** **tsdown** (ESM-only, per-module `"use client"` preserved, `react`/`react-dom` externalized as peers, ships `dist`), via the shared `@plainworks/tsdown-config` preset.
- **Lint / format:** **Biome**.
- **Layer boundaries + cycles:** **dependency-cruiser**, isolated in `@plainworks/boundaries`.
- **Version sync (single catalog):** **Sherif** (fast CI gate) + **Syncpack** (catalog-aware fix/migrate).
- **Tests / coverage:** **Vitest** (v8 coverage).
- **Releases:** **Changesets**.
- **Generator:** `@turbo/gen` via `bun run gen` — the golden package template.

## Build, Test, and Lint

The root `package.json` scripts are the canonical gates; they run through `turbo` and are cache-correct. **Always scope to the package(s) you changed** — the unscoped scripts are for CI sign-off. See the `validate` skill for the scoped forms.

```bash
bun install                       # bun workspaces + catalog
bun run check-versions            # sherif + syncpack lint (catalog is the single source of versions)
bun run lint                      # biome check .
bun run typecheck                 # tsc --noEmit across packages (+ the generator config)
bun run check-boundaries          # dependency-cruiser: zero upward/sideways imports, zero cycles
bun run build                     # tsdown, ESM-only, ships dist/
bun run test                      # vitest run --coverage
bun run gen package               # scaffold a new @plainworks/* package from the golden template
bun run changeset                 # add a Changeset for the release
```

The Definition of Done for every change is those six gates green — **check-versions · lint · typecheck · check-boundaries · build · test** — plus a Changeset and the architecture invariants below. Scope with turbo filters: `turbo run test --filter=@plainworks/<name>` for one package, `--filter='...[origin/main]'` for the affected set.

## Package structure

bun workspaces, three roots:

- `packages/<name>/` — the published `@plainworks/*` packages. One concern, one plain word, the **same word everywhere** — no `core`, `engine`, `foundation`, or junk-drawer `utils`. Each is born from the golden generator so its `package.json`/`exports`/`tsconfig`/`tsdown`/`vitest` are identical.
- `apps/<name>/` — examples/showcase and consuming apps (route tree stays app-local; never imported by a package).
- `internal/<name>/` — dev-only tooling that is never published (`@plainworks/boundaries`, `@plainworks/tsdown-config`).

Every published package: `"type": "module"`, `"sideEffects": false`, a server-safe `.` export and (when interactive) a `./client` export, `"files": ["dist"]`, `react`/`react-dom` as `catalog:` peer ranges. Add a new package **only** through `bun run gen package` — never hand-roll one (see the `new-package` skill).

## Layer map

```
L0  std                                   errors/result/guards/contracts (seams), no React
L1  state (seam + zustand adapter) · ui   (registry later)
L2  connection (+sse/ws) · connect (RPC) · query (TanStack wiring)
L3  auth (core + oidc/jwt/apikey/BYO adapters, server/client split)
L4  app (providers, harness) · testkit · mocks     (route tree stays app-local)
```

The map has a single source of truth: the `LAYERS` table in [`../internal/boundaries/.dependency-cruiser.cjs`](../internal/boundaries/.dependency-cruiser.cjs), mirrored in README + `docs/architecture.md`. Adding a package means adding it to `LAYERS` (a package absent from the map may import no other `@plainworks` package — the gate fails **closed**, never vacuously green). A fixture-backed test in `@plainworks/boundaries` proves the gate rejects an upward import.

## Code style

- **ESM-only.** Correct `exports` / `types` / `files`; `dist` is built, never committed. `typecheck` is a **separate** script from `build` (`tsc --noEmit` vs `tsdown`).
- **Server/client split.** Per-module `"use client"` at the top of client-only modules; tsdown preserves it (`unbundle`). Never a global banner — it would poison the server entry. A server-only module must not be imported by a `"use client"` module.
- **Typed, minimal public API.** No `any` in public surfaces; prefer `unknown` + narrowing, generics, `satisfies`, discriminated unions. Typed errors (a small error type / result), never thrown strings. Export a flat public surface; keep internals unexported.
- **No import-time side effects, no module-level singletons.** Factories over globals; explicit adapter registration into an injected registry.
- **Biome** owns format + lint (2-space, width 100, LF, organized imports). Run `bun run format` to fix.
- **Organize by concern; self-documenting by path.** Group related modules into a **concern folder** with a re-export-only `index.ts` barrel plus concern-named files inside (as `rskit` groups `retry/{backoff,policy,error}.rs` under a barrel-only `mod.rs`, and as `packages/mocks` already does with `data/`, `filter/`, `handlers/`). A single concern stays one clearly named file (`circuit-breaker.ts`). The path must convey the concern on its own — no junk-drawer `utils`/`helpers`/`core`, and no bare verb modules/exports (`compose`, `classify`); qualify them (`pipeline/interceptor.ts` → `composeInterceptors`). Fold proactively when a second sub-concern appears, not once a file grows "too long". A barrel `index.ts` re-exports; it holds no logic.
- **Conventional Commits:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. One commit per branch (amend), no `Co-authored-by` trailer.

### TypeScript: 6 now, 7 later — do not bump blind

The catalog pins `typescript` at `^6.0.3` on purpose. TypeScript 7 (native `tsgo`) does **not** yet ship a JS Compiler API, so the TS-AST toolchain this repo depends on — **dependency-cruiser** (the boundary/cycle gate) and friends — cannot run on TS7. Bumping to 7 would make dependency-cruiser silently stop extracting imports and **disable the layer gate** rather than fail loudly, so a test in `@plainworks/boundaries` asserts the catalog `typescript` stays on the 6 line and fails CI the moment someone raises it. The migration is a one-file flip: alias `typescript` → `@typescript/typescript6` **in `@plainworks/boundaries` only**, then relax the guard. Do not raise the catalog `typescript` past 6 without re-homing the gate first. Full rationale: `docs/architecture.md › Governance`.

## Architecture invariants

Checked in review and by the gates, for every package:

- **No import-time side effects; no module-level singletons** (per-request factories for stores/clients/sessions).
- **Explicit adapter registration** via an injected registry — no global registry, no string service-locator.
- **Header-only auth** — no token in a URL. Server-only auth stays out of `"use client"` graphs.
- **Typed errors; no `any`** in public APIs.
- **ESM-only**, `exports`/`types`/`files` discipline; each package ships a real tsdown `dist`.
- **Single catalog** — every dependency (peer ranges included) references `catalog:`; Syncpack/Sherif fail CI on an inline version or cross-package drift.
- **Accessible & responsive by default** — interactive `./client` code meets WCAG 2.2 AA (semantic roles, keyboard/focus, contrast, target size), is mobile-first and fluid (no fixed-pixel traps; container queries for component adaptivity), and honors `prefers-reduced-motion` / `prefers-color-scheme`. Non-negotiable for any UI/client change.

## Documentation

**How it reads (standards):**

- Write Markdown paragraphs as **one continuous source line** — do not hard-wrap prose to a column; renderers wrap for the viewport. Preserve intentional structure: headings, lists, tables, blockquotes, mermaid diagrams, fenced code.
- Apply the same rule to TSDoc (`/** */`) and `//` comment prose. Preserve TSDoc tags, directives, lists, and code examples.
- Comments and docs describe the code **as it is now** — not history, plans, or the process that produced it.

**How it lands (clarity — a doc is for a human skimming under time pressure):**

- **Simple and organized beats complete.** A crowded, jargon-dense, or overlong explanation is a **defect**, not thoroughness — a reader gives up on a wall of text. Prefer the shortest organized version that still answers the question. Follow current documentation best practices, not old habit.
- **One idea per sentence, plain and active.** Write "Call `createStore`", not a clause-stacked paragraph. Bold the load-bearing terms; keep paragraphs to a few sentences.
- **Scannable structure.** Lead a page or section with the shortest working path (a quickstart) before deep reference. Use meaningful headings, short lists, and tables. Move dense identifier/option detail **into a table or a runnable example** rather than packing it into a sentence.
- **Diagram where prose is the wrong tool.** Reach for a focused `mermaid` diagram for architecture, dependency direction, an auth/reconnect flow, or a state machine — one idea per diagram, with a one-line caption. Don't diagram the trivial.
- The `docs` skill (Pass 3) is the standing check for this; run it when writing or auditing docs.

## Repo workflow

The **agent creates branches and makes edits; the maintainer commits and pushes.** Commit / push / open a PR only when explicitly asked. Branches are named by the change, prefixed `kbukum/`, cut off an up-to-date `main`. PRs are opened in **draft**. Plans are gitignored scratch under `tmp/`. Never commit secrets or `tmp/`. This repo is **pre-stable — no backward compatibility owed**; redesign at the root over patching a symptom.
