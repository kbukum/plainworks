# plainworks engineering reference

Read only the task-relevant section after the [agent entry point](copilot-instructions.md). These detailed requirements remain binding; they are not another startup payload.

Foundational, **host-independent** React/TypeScript kit: runtime-agnostic cores plus thin, optional client bindings. Cores assume **no host** (no DOM, React, or host globals), so Next.js, Vite, Astro, TanStack Start, and Remix plug in through explicit seams. The authoritative taxonomy and layer map live in [`../docs/architecture.md`](../docs/architecture.md). This file is the engineering baseline for every change.

## Product and ownership boundary

**Consumers bring their host, backend, and adapters.** Plainworks provides focused capabilities and contracts, not a required application stack. Installing auth must not require a database, an identity-provider service, Next, or a second authentication server. A consumer whose backend already owns sessions uses that backend; a reference host's architecture does not become a kit requirement.

| Owner | Responsibility |
|---|---|
| Core capability | Concern-specific behavior, typed contracts, and a lean default where useful. No unrelated backend implementation or driver. |
| Integration | Code that binds a contract to a database, vendor SDK, exporter, or framework. It implements core contracts and owns its technology dependencies. A reusable kit integration is its own package; a consumer-specific one lives with that consumer. |
| Consumer / host | Select integrations, supply config and secrets, and own startup, request handling, and teardown. |
| Test tooling / fixtures | Reusable test behavior and injected fixture-state contracts. Concrete fixture persistence follows the same integration boundary. |

**A subpath is not a dependency boundary.** Core must not contain a technology backend's implementation, re-export one, or declare its driver as a dependency, optional dependency, or optional peer. Tree shaking and optional peers do not satisfy this rule. Choose the smallest owner the need justifies: host-owned code when one consumer needs it, a separate package when the kit genuinely ships it for reuse. No particular directory tree or package count is required.

This does not mean every core is dependency-free. Libraries implementing the package's promised capability, React bindings, and thin standard-platform bindings are distinct from choosing an unrelated backend for consumers. Use the [dependency classification](../docs/architecture.md#dependency-classification), not a blanket exception for existing peers. A lean memory default must not become a native database requirement.

**Dependency direction:** consumer -> integration -> core contract. Core never imports an integration. A packaged integration also obeys the layer map; place each integration above the contracts it consumes, without a blanket same-layer exemption. Share real common mechanics through a suitable lower owner, not through unrelated auth exports, duplicated app helpers, or a speculative database framework.

When an integration does need its own package, use the existing generator and profiles where they fit, and change workspace tooling only for what that package actually requires. Prove its dependency closure and a clean core-only install.

## Development stage: alpha, redesign over compatibility

plainworks is in **active development** on the `0.1.0-alpha.x` line. **No backward compatibility is owed** to anyone: not consumers, not apps, not templates, not earlier versions of our own code. This stance applies to **every** change, plan, review, and fix:

- **Redesign beats patching.** When code is wrong, outdated, or no longer the simplest design, redesign it on current best practices. Don't bolt a fix onto it. **Breaking changes are welcome**; a patch that preserves a flawed shape is the defect.
- **Design for the end state.** Build new code as if the thing it supersedes is already gone. Never shape new code around, on top of, or next to a legacy path.
- **Replace, don't add alongside.** When a change supersedes something, the **same change** moves every consumer (packages, `apps/*`, `internal/*`, `create-plainworks` templates, docs, skills, instructions) and **deletes** the old path. One concern, one model.
- **Zero compatibility scaffolding.** No shims, aliases, deprecated re-exports, compat flags, `legacy`/`old`/`v2`/`next` names, parallel old-and-new models, or "additive now, remove later" plans.
- **Too big for one PR?** Plan it (`create-plan`). New code still never builds on the old path. The old path is closed off and listed for deletion in a named step, and **no release ships both**.
- **Clean up what you find.** Legacy, dead code, unused exports, stale docs, and outdated patterns in a change's blast radius are removed in that change, not left for later.

Breaking changes take a `minor` Changeset while pre-1.0 (see the `release` skill). Describe the change as a redesign, never as a migration path.

## Engineering principles

Shared baseline — apply to all work here:

- **Phases:** discover → decide (Redesign / Align / Enhance / Drop / Leave) → implement completely → validate. **Leave** only what is already the right design. Anything legacy, outdated, or superseded is Redesigned or Dropped (see [Development stage](#development-stage-alpha-redesign-over-compatibility)). Implement the *simplest* design that fully solves it — flexible, extensible, scalable — on current idiomatic TS best practices, not folklore. Complexity must earn its place.
- **Layering & reuse:** explicit, acyclic dependency direction — a package in `Ln` imports `@plainworks` packages only in a strictly lower layer (see the layer map). Consult the [concern owners](../docs/architecture.md#concern-owners) first. **Consume** a lower owner's behavior; **implement** its contract when supplying an adapter. Neither permits an upward or sideways import. Enhance an inadequate owner generically before consuming it; never duplicate shared errors, validation, retries, contracts, or event shapes. `@plainworks/std` is the bottom and depends on no other package.
- **Structure & naming (self-documenting by path):** organize by concern the way `rskit` does — a concern that spans more than one module is a **folder** with a re-export-only `index.ts` barrel (the TS equivalent of a barrel-only `mod.rs`) plus concern-named files inside; a single concern is one clearly named file. The folder/file path must tell a reader *what the code is without opening it*: no junk-drawer `utils`/`helpers`/`misc`/`core`, and no bare, ambiguous verb modules or exports (`compose`, `classify`, `handle`, `process`) — qualify by concern (`pipeline/interceptor.ts` exporting `composeInterceptors`, `resilience/classify.ts` exporting `classifyError`). Group **proactively** when a second sub-concern appears, not reactively once a file is "too long"; a cohesive single-concern file is fine at any length. Barrels (`index.ts`/`src/index.ts`) re-export only — never logic.
- **APIs:** typed and minimal; **no `any`** (and no unchecked `as`/`!`) in public surfaces — use `unknown` + narrowing, generics, and discriminated unions. Actionable typed errors that preserve cause; never throw strings.
- **Errors & resilience:** no swallowed errors or success-shaped fallbacks on runtime paths; timeout every remote call (`AbortSignal`); bounded, jittered retries for idempotent operations only; reconnect/backpressure/circuit-break and degrade gracefully.
- **Concurrency & async:** every stream/subscription/timer/`AbortController` has explicit ownership, cancellation, and teardown; bound queues and buffers with documented backpressure; drain and unsubscribe on shutdown. Borrowers release their subscriptions, not another owner's runtime. Cancellation fences late mutation and publication, not just the caller's wait. Cleanup has a fresh bounded budget, preserves the initiating failure, and retains a retryable owner if resources cannot be released. No unbounded in-memory buffering.
- **Host-independence (the axis):** use universal WHATWG value primitives directly (`AbortController`, `Headers`, `URL`, `Response`, `TextDecoder`). Inject behavior that varies by host or needs test substitution (`fetch`, streaming, cryptography, custody). Core uses the [entry vocabulary](../docs/architecture.md#choose-an-entry-point): neutral `.` and concern subpaths, DOM-free React `./client` unless the package declares `dom`, server-only `./server`, thin platform-binding subpaths such as `state/web-storage`, component entries, assets, and `./testing`. Core neutral/client portability is proved by the ES2023-only compile profile and boundary fixtures; no DOM/Node types leak into those graphs. A separate integration package declares its narrower runtime and cannot weaken the core gate. Barrels use named exports only; each name has one import path. Server credential custody never enters a `"use client"` graph.
- **Composition:** explicitly injected registries and config-driven selection. **No import-time side effects** (importing a module never dials the network, reads env, or opens a handle); **no module-level singletons**. The host explicitly owns process-, request-, or browser-root resources as appropriate. Request-local handlers do not imply request-local authoritative data; recreating a memory session store on every request loses sessions. Adapters register via an explicit `register()` / `createX({...})`, never a package-global mutable registry or service-locator lookup by string.
- **Security & privacy:** validate at every trust boundary; least-privilege and secure-by-default; credentials travel in headers or secure cookies, never URL/query strings. Browser sessions use opaque `Secure`+`HttpOnly`+`SameSite=Strict` `__Host-` cookies; identity and provider credentials stay at the authoritative backend. No browser access/refresh-token fallback or signed identity-cookie session. Keep legitimate server-side OIDC refresh, Authorization Code + PKCE `S256`, exact redirect validation, and CSRF protection. Use current crypto, reject `alg: none`, and never use MD5/SHA-1 for security. Minimize, redact, and retention-bound sensitive data; never log tokens or payloads. Treat rendered user/model/retrieved content as untrusted; no unsanitized HTML or `eval`. A secure browser session does not require the backend to be Next.
- **Accessibility & responsive UI (the client-binding acceptance bar):** interactive `./client` code is accessible and responsive **by default, not as a follow-up** — semantic HTML with correct ARIA roles, full keyboard operability with a visible focus ring, and WCAG 2.2 AA (text contrast, `24×24` CSS-px minimum target size, focus never obscured). Every client render test file awaits `expectNoAxeViolations` from `@plainworks/testkit/client` at least once, and the `check-axe-coverage` gate rejects a file that doesn't (automation catches ~half of WCAG issues — it is a floor, not proof; keyboard/focus/roles are still reviewed). Layout is mobile-first and fluid — relative units, `clamp()` type (never `vw`-only, it breaks zoom), `minmax()`/`auto-fit` grids, no fixed-pixel width/height traps; component-scoped adaptivity uses CSS **container queries** over viewport media queries; honor `prefers-reduced-motion` and `prefers-color-scheme`.
- **Performance:** code-split heavy and route-level surfaces behind `React.lazy` + `Suspense`; keep components small and let the React compiler memoize — reach for `memo`/`useMemo`/`useCallback` only where a profile shows a measurable win, never prophylactically; virtualize large lists; keep the client bundle tree-shakeable (per-component subpath exports, `"sideEffects": false`).
- **Tests:** behavioral and deterministic; **test-first** (failing test → minimal code → refactor while green); cover failure paths; injected clocks and seeded RNG, no real network/FS in unit tests; race/shuffle safe. Coverage ≥ 80% per package, ≥ 85% for security-load-bearing packages (`auth`). React/DOM tests assert what the user perceives — query by role/label (`getByRole` first, `getByTestId` last resort), drive interaction with `@testing-library/user-event` (not `fireEvent`), never couple to implementation detail (class names, internal state); mock the network at the boundary with **MSW** (`onUnhandledRequest: "error"`), not by stubbing `fetch`. Shared fakes and harnesses live in **`@plainworks/testkit`**; mocked services, request dispatch, and MSW lifecycle live in **`@plainworks/mocks`**. Tests may import either package upward through the narrow test-only boundary carve-out. The one exception is `@plainworks/std`, which testkit depends on and therefore tests with local fakes to avoid a cycle.
- **AI / model features:** treat model output and retrieved context as untrusted; enforce structured, validated outputs; least-privilege tool calls with a human gate on destructive actions; version prompts/models and gate changes on evals.
- **Supply chain:** one shared version list (the bun **catalog**) enforced by Sherif + Syncpack; ESM-only with correct `exports`/`types`/`files` proven by the **publint + are-the-types-wrong** packaging gate; pin CI actions by commit SHA; audit and license-check new dependencies; Changesets-driven releases published with npm **provenance** (SLSA attestation).
- **Keep code current:** use current idioms and standards. Verify that each dependency is maintained, no platform or standard-library feature already covers the need, and no open advisory applies.
- **Proof matches the claim:** unit doubles prove contracts, not native-driver, process, TLS, browser, or packaged-consumer behavior. Required integration environments fail explicitly when unavailable. Record measured bounds and cleanup; forced termination is not graceful success, and a capture is not visual acceptance until opened and judged. Review both source imports and installed dependency graphs.
- **Best practices over parity, consistency above both:** current idiomatic TS/React best practices outrank any cross-kit mimicry of gokit/rskit — parity is spirit and intuition-transfer, never a forced non-idiomatic type or API shape. Above both, be **consistent across plainworks**: internal consistency of naming, seams, and package shapes is one of the most important properties.

Use the matching [skill](skills/README.md). Review affected behavior and its dependencies; delegate only when the user requests it. Scope `bun run` / `turbo` validation while implementing.

## Stack

- **Language:** TypeScript, pinned at **`^6.0.3`** in the catalog deliberately. See the TypeScript compiler boundary below. Strict, `isolatedDeclarations`, `moduleResolution: bundler`, ESM-only.
- **Runtime / package manager:** **bun** (`bun@1.3.6`); Node `^22.12 || ^24 || >=26` (N / N-1 LTS matrix in CI).
- **Task runner / caching:** **Turborepo** (`turbo`) — cache-correct, topological, affected-aware. Dev-only; zero consumer footprint.
- **Build:** **tsdown** (ESM-only, per-module `"use client"` preserved, `react`/`react-dom` externalized as peers, ships `dist` plus source maps), via the shared `@plainworks/tsdown-config` preset.
- **Lint / format:** **Biome**.
- **Layer boundaries + cycles:** **dependency-cruiser**, isolated in `@plainworks/boundaries`.
- **Version sync (single catalog):** **Sherif** (fast CI gate) + **Syncpack** (catalog-aware fix/migrate).
- **Tests / coverage:** **Vitest** (v8 coverage) through `@plainworks/vitest-config`.
- **Releases:** **Changesets**.
- **Workspace shape:** `@plainworks/shape` derives manifest fields, scripts, exports, files, and preset dependencies for every workspace profile.
- **Generator:** `@turbo/gen` via `bun run gen` — the golden package and tool templates.

## Build, Test, and Lint

`bun run verify` runs every Definition-of-Done gate in order, and it is the only place the gate list lives (`internal/verify`). CI, the release workflow, and the skills all call it. Each gate is also a root script, cache-correct through `turbo`. **Scope to the package(s) you changed**; the unscoped run is for CI sign-off. See the `validate` skill for the scoped forms.

```bash
bun install                                   # bun workspaces + catalog
bun run verify                                # every gate, in order
bun run verify --filter=@plainworks/<name>    # scope the package gates (repeatable turbo filter)
bun run verify --list                         # the gates and what each enforces
bun run format                                # Biome safe fixes
bun run format-comments                       # reflow over-width comment prose
bun run check-shape                           # verify generated workspace manifests
bun run sync-shape                            # rewrite derived workspace manifest fields
bun run sync-layer-map                        # regenerate the layer-map docs from layers.json
bun run gen package                           # scaffold a new @plainworks/* package from the golden template
bun run gen tool                              # scaffold a new internal tool from the golden template
bun run changeset                             # add a Changeset for the release
```

The Definition of Done for every change is `verify` green, a Changeset, and the architecture invariants below. `verify` includes the vendored-atom lock check (`check-registry`), the generated workspace-shape check (`check-shape`), and the render-test axe check (`check-axe-coverage`); also run the `elements` tests when `theme` changes. Scope with turbo filters: `--filter=@plainworks/<name>` for one package, `--filter='...[origin/main]'` for the affected set.

A change that alters what a user sees or does in an app also meets the **UI Definition of Done**. Run it in the app (today `apps/showcase`):

1. **Check** the flows you touched: `bun run e2e -- e2e/flows.spec.ts --grep "<flow>"`. They must pass.
2. **Look** at them: `bun run ui:capture --flow <flow>` writes a frame at every checkpoint (desktop and mobile, light and dark). Open the frames or the contact sheets in `sheets/` and confirm the change looks as intended. Add `--save-as before` before editing and `--base before` after when a side-by-side diff helps.
3. **Record a short summary** in the hand-off or PR: which flows you checked and looked at, and what changed visually and why.

A new user-facing journey gets a flow in `apps/<app>/e2e/flows/` with `covers` globs, so `--affected` selects it. If the change alters a screen an app README shows, rerun `bun run ui:capture --docs` in that app and look at the refreshed images. See the [testkit guide](../packages/testkit/README.md#the-ui-loop--uicapture).

## Package structure

bun workspaces, three roots:

- `packages/<name>/` — published `@plainworks/*` packages. One concern, one plain word, the **same word everywhere** — no `core`, `engine`, `foundation`, or junk-drawer `utils`. Each is born from the golden generator.
- `apps/<name>/` — private reference hosts and examples. Route trees stay app-local and packages never import them.
- `internal/<name>/` — dev-only tooling, private package fixtures, and cross-package tests that are never published.

A technology integration never hides inside a core package (see [Product and ownership boundary](#product-and-ownership-boundary)).

Every workspace follows exactly one generated profile:

| Profile | Workspaces | Shape |
|---|---|---|
| **package** | `packages/*` and built private packages such as `internal/demo` | `tsdown.config.ts` exports `build: PackageBuild`; `sync-shape` derives `exports`, `files`, `sideEffects`, scripts, and preset dev dependencies. |
| **cli** | `create-plainworks` | Published command package with a bin build and packaging checks. |
| **tool** | dev-only `internal/*` tools | `src/` with colocated tests, optional `src/cli.ts` bin named `plainworks-<dirname>` whose shebang runs Bun with the `@plainworks/source` condition, optional `src/index.ts` export, `tsconfig.json` extends `../../tsconfig.tool.json`, no root source files and no `test/` directory. |
| **app** | `apps/*` and `internal/integration` | `tsconfig.json` extends `../../tsconfig.app.json`, tests use `appTestConfig`, and package tasks run against built package surfaces. |

Do not hand-maintain derived manifest fields. Add a package subpath in `tsdown.config.ts` (`export const build: PackageBuild = { entry: { ... } }`, then `export default preset(build)`) and run `bun run sync-shape`. Per-workspace `lint` scripts are absent; root `bun run lint` runs Biome over the repository.

Shared root tsconfigs match the profiles: `tsconfig.base.json` for packages, `tsconfig.tool.json` for source-run internal tools with Node types and `.ts` import specifiers, and `tsconfig.app.json` for apps and integration with DOM+Node types and dist resolution.

## Layer map

See the generated [layer map](copilot-instructions.md#layer-map) in the agent entry point.

The map has a single source of truth: [`../internal/boundaries/layers.json`](../internal/boundaries/layers.json). The agent entry point, README, and `docs/architecture.md` tables are generated from it (`bun run sync-layer-map`), and `verify` fails when they drift. Adding a package means adding it to `layers.json` (a package absent from the map may import no other `@plainworks` package — the gate fails **closed**, never vacuously green). A fixture-backed test in `@plainworks/boundaries` proves the gate rejects an upward import.

## Vendored atoms

`@plainworks/elements` has two folders. **`src/shadcn/`** holds **vendored** atoms: exact shadcn CLI output plus only the compat transform (`cn` from `@plainworks/theme`, `"use client"`) and Biome safe fixes. They are **locked** by `shadcn.lock.json` (CLI version, style, per-atom hash). **`src/atoms/`** holds primitives we write and own (today, `number-field`). A name lives in only one folder.

- **Never hand-edit `src/shadcn/**` or `shadcn.lock.json`.** Change an atom only with `registry:update <atom>` (or `registry:add`), which relocks it and reruns `registry:codegen`. `registry:validate` and the lock test fail on a hand edit, an unlocked atom, or a stale entry.
- **Never re-add a variant upstream doesn't ship** (a tone, size, or state). Follow the **deviation ladder** and stop at the lowest rung that fixes it:
  1. **Theme** — `@plainworks/theme` tokens and rules: color, contrast, focus, radius, and focus for keyboard stops an atom leaves unmarked.
  2. **Call site** — props, `className`, `role`.
  3. **`@plainworks/ui` wrapper** — reusable tones or behavior.
- **Upstream bug?** Fix it at the lowest rung and note it for upstream reporting. Never patch the atom.

The strictness relaxations for vendored code (`tsconfig.shadcn.json`, the `src/shadcn` Biome override) exist only for `src/shadcn`; `src/atoms` stays under the full rules. See [`../packages/elements/README.md`](../packages/elements/README.md).

## Code style

- **ESM-only.** Correct generated `exports` / `types` / `files`; `dist` is built, never committed. Packages ship `dist` plus `src` (tests excluded) so JavaScript and declaration source maps point at real TypeScript source. `typecheck` is a **separate** script from `build` (`tsc --noEmit` vs `tsdown`).
- **Server/client split.** Per-module `"use client"` at the top of client-only modules; tsdown preserves it (`unbundle`). Never a global banner — it would poison the server entry. A server-only module must not be imported by a `"use client"` module.
- **Typed, minimal public API.** No `any` in public surfaces; prefer `unknown` + narrowing, generics, `satisfies`, discriminated unions. Typed errors (a small error type / result), never thrown strings. Export a flat public surface; keep internals unexported.
- **No import-time side effects, no module-level singletons.** Factories over globals; explicit adapter registration into an injected registry.
- **Biome** owns format + lint (2-space, width 100, LF, organized imports). Run `bun run format` to fix.
- **Organize by concern; self-documenting by path.** Group related modules into a **concern folder** with a re-export-only `index.ts` barrel plus concern-named files inside (as `rskit` groups `retry/{backoff,policy,error}.rs` under a barrel-only `mod.rs`, and as `packages/mocks` already does with `data/`, `filter/`, `handlers/`). A single concern stays one clearly named file (`circuit-breaker.ts`). The path must convey the concern on its own — no junk-drawer `utils`/`helpers`/`core`, and no bare verb modules/exports (`compose`, `classify`); qualify them (`pipeline/interceptor.ts` → `composeInterceptors`). Fold proactively when a second sub-concern appears, not once a file grows "too long". A barrel `index.ts` re-exports; it holds no logic.
- **Conventional Commits:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. One commit per branch (amend), no `Co-authored-by` trailer.

### TypeScript compiler boundary

The catalog pins `typescript` at `^6.0.3` because TypeScript 7 does not ship a JavaScript Compiler API. The TS-AST toolchain, including **dependency-cruiser**, cannot run on TypeScript 7. Raising the catalog would make dependency-cruiser stop extracting imports and silently **disable the layer gate**. A test in `@plainworks/boundaries` enforces the TypeScript 6 line. Do not raise the catalog past TypeScript 6 unless the boundary package first receives a compiler implementation that still extracts and validates imports. See `docs/architecture.md › TypeScript 6 boundary`.

## Architecture invariants

For remote failures, use `std/failure` as the application vocabulary. HTTP/Connect decode at their boundaries; apps use `createFailureHandler`, not local detail decoders. Connect transport owns retries and total budgets; its Query options/hooks disable a second retry loop. Forms consume the lower `FormSchema` seam; protobuf requests use `connect/forms` with real Protovalidate and descriptor JSON names. Malformed responses and validator failures stay operational, never field prompts.

Checked in review and by the gates, for every package:

- **No import-time side effects; no module-level singletons** (explicit scope-owned factories for stores/clients/sessions).
- **Core/integration separation** — no technology backend, driver declaration, or integration re-export in core. Consumers can implement contracts without installing any integration we ship.
- **Explicit adapter registration** via an injected registry — no global registry, no string service-locator.
- **Header-only auth** — no token in a URL. Server-only auth stays out of `"use client"` graphs.
- **Typed errors; no `any`** in public APIs.
- **ESM-only**, `exports`/`types`/`files` discipline; each package ships a real tsdown `dist`.
- **Single catalog** — every dependency (peer ranges included) references `catalog:`; Syncpack/Sherif fail CI on an inline version or cross-package drift.
- **Accessible & responsive by default** — interactive `./client` code meets WCAG 2.2 AA (semantic roles, keyboard/focus, contrast, target size), is mobile-first and fluid (no fixed-pixel traps; container queries for component adaptivity), and honors `prefers-reduced-motion` / `prefers-color-scheme`. Non-negotiable for any UI/client change.
- **Vendored atoms are locked** — `packages/elements/src/shadcn/**` changes only through `registry:update`/`registry:add`, never by hand, and never gains a variant upstream doesn't ship. Deviations follow the deviation ladder (theme → call site → `ui` wrapper); see [Vendored atoms](#vendored-atoms).

## Documentation

**How it reads (standards):**

- Write Markdown paragraphs as **one continuous source line** — do not hard-wrap prose to a column; renderers wrap for the viewport. Preserve intentional structure: headings, lists, tables, blockquotes, mermaid diagrams, fenced code.
- **Code comments are the exception — wrap them.** A `/** */` TSDoc or `//` comment is read at its source column, not reflowed by a renderer, so wrap its prose to the Biome print width (100 columns) like the code it documents — never a long single line trailing off-screen, and never hard-wrap Markdown to match. Keep TSDoc tags, directives (`@param`, `@throws`, `{@link}`), lists, and code examples intact, and break paragraphs on blank comment lines rather than joining them. Biome does not touch comment content, so `bun run check-comments` reports over-width comments and `bun run format-comments` reflows them safely (via `@plainworks/comment-format`, which edits only comment prose and never code).
- Comments and docs describe the code **as it is now** — not history, plans, or the process that produced it.

**How it lands (clarity — every reader-facing artifact is for a human skimming under time pressure):** the same voice governs docs, READMEs, comment prose, changesets, and PR/commit descriptions.

- **Simple and organized beats complete.** A crowded, jargon-dense, or overlong explanation is a **defect**, not thoroughness — a reader gives up on a wall of text. Prefer the shortest organized version that still answers the question. Follow current documentation best practices, not old habit.
- **One idea per sentence, plain and active.** Write "Call `createStore`", not a clause-stacked paragraph. Bold the load-bearing terms; keep paragraphs to a few sentences.
- **Describe the benefit, not the mechanism.** Say what the reader can now do — "you control the table's state" — not the internal shape — "compound, controlled-first, injected labels/icons". Name a representative identifier or two, never dump an exhaustive API list.
- **Scannable structure.** Lead a page or section with the shortest working path (a quickstart) before deep reference. Use meaningful headings, short lists, and tables. Move dense identifier/option detail **into a table or a runnable example** rather than packing it into a sentence.
- **Diagram where prose is the wrong tool.** Reach for a focused `mermaid` diagram for architecture, dependency direction, an auth/reconnect flow, or a state machine — one idea per diagram, with a one-line caption. Don't diagram the trivial.
- The `docs` skill (Pass 3) is the standing check for this; run it when writing or auditing docs.

## Repo workflow

The **agent creates branches and makes edits; the maintainer commits and pushes.** Commit / push / open a PR only when explicitly asked. Branches are named by the change, prefixed `kbukum/`, cut off an up-to-date `main`. PRs are opened in **draft**. Plans are gitignored scratch under `tmp/`. Never commit secrets or `tmp/`. This repo is **alpha, with no backward compatibility owed**. Redesign at the root, welcome breaking changes, and delete legacy in the same change (see [Development stage](#development-stage-alpha-redesign-over-compatibility)).
