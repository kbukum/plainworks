# plainworks engineering standard

These rules bind every change. The [agent entry point](copilot-instructions.md) lists the startup invariants; this file holds the detail. Read only the section your task needs. Where code belongs (layers, owners, entry points) lives in [Architecture](../docs/architecture.md), and settled decisions live in the [ADRs](../docs/adr/README.md).

plainworks is a host-independent React and TypeScript kit: runtime-neutral cores plus thin, optional client bindings. Consumers bring their host, backend, and adapters. Every rule below protects that promise.

| Section | Read when |
|---|---|
| [Development stage](#development-stage) | Any change, plan, review, or fix |
| [Ownership boundary](#ownership-boundary) | Adding integrations, backends, adapters, or packages |
| [Public API and stability](#public-api-and-stability) | Changing exports, entries, types, errors, or the release line |
| [Host independence](#host-independence) | Runtime code in packages |
| [Errors, async, and composition](#errors-async-and-composition) | Remote calls, streams, timers, factories, registries |
| [Security and privacy](#security-and-privacy) | Auth, cookies, crypto, untrusted input, logging, model features |
| [UI quality](#ui-quality) | Interactive client code, theme, atoms |
| [Testing and proof](#testing-and-proof) | Any behavior change |
| [Documentation and consumer experience](#documentation-and-consumer-experience) | Docs, READMEs, TSDoc, comments, Changesets, error messages |
| [Dependencies and supply chain](#dependencies-and-supply-chain) | Dependencies, CI, packaging, releases |
| [Code structure](#code-structure) | New modules, packages, names, manifests |
| [Toolchain](#toolchain) | Tooling or compiler updates |
| [Definition of Done](#definition-of-done) | Accepting any change |
| [Known gaps](#known-gaps) | Before claiming a rule is enforced |

## Where guidance lives

Each topic has one owner. Other files link to it instead of restating it, so a change lands in one place.

| Topic | Owner |
|---|---|
| What plainworks is, packages, quickstart | [README](../README.md) |
| Where code goes: layers, owners, entries, composition | [Architecture](../docs/architecture.md) |
| Why a decision was made | [ADRs](../docs/adr/README.md) |
| Rules every change follows | This file |
| Contributor workflow | [Contributing](../CONTRIBUTING.md) |
| Reporting vulnerabilities and secure use | [Security policy](../SECURITY.md) |
| Agent startup rules and routing | [Agent entry point](copilot-instructions.md) |
| Path-specific reminders | [`instructions/`](instructions), short and linked to sections here |
| Procedures: review, validate, release, and others | [Skills](skills/README.md), linking rules here |
| The gate list | `internal/verify`, shown by `bun run verify --list`; never copied |

## Development stage

plainworks is alpha (`0.1.0-alpha.x`). No backward compatibility is owed to consumers, apps, templates, or our own earlier code.

- **Redesign beats patching.** Fix the root cause on current best practice. A patch that keeps a flawed shape is the defect.
- **Design for the end state.** Build new code as if the code it supersedes is already gone.
- **Replace, don't add alongside.** The same change moves every consumer (packages, `apps/*`, `internal/*`, `create-plainworks` templates, docs, skills, instructions) and deletes the old path.
- **No compatibility scaffolding.** No shims, aliases, deprecated re-exports, compat flags, `legacy`/`old`/`v2`/`next` names, parallel models, or "remove later" plans.
- **Too big for one PR?** Plan it with [create-plan](skills/create-plan/SKILL.md). New code never builds on the old path; the old path is closed off and named for deletion in a step, and no release ships both.
- **Clean the blast radius.** Remove dead code, unused exports, stale docs, and outdated patterns in the code you touch.
- **Decide explicitly.** For each finding choose **Redesign, Align, Enhance, Drop**, or **Leave** (only when it is already the right design), with a one-line reason. Implement the simplest design that fully solves it; complexity must earn its place.

Breaking changes take a `minor` Changeset while pre-1.0, described as a redesign, not a migration path. This freedom ends at stable graduation; see [Public API and stability](#public-api-and-stability).

## Ownership boundary

**Consumers bring their host, backend, and adapters.** plainworks ships capabilities and contracts, not an application stack. Installing auth must not require a database, an identity provider, Next, or a second auth server. A consumer whose backend already owns sessions uses that backend.

| Owner | Owns |
|---|---|
| Core capability | Concern behavior, typed contracts, and a lean default where useful. No unrelated backend or driver. |
| Integration | Binding a contract to a database, vendor SDK, exporter, or framework, plus that technology's dependencies. Lives with the consumer that selects it, or in its own package when the kit ships it for reuse. |
| Consumer or host | Selecting integrations, config, secrets, startup, request handling, and teardown. |
| Test tooling | Reusable test behavior and fixture-state contracts. Concrete fixture persistence follows the integration rule. |

- **A subpath is not a dependency boundary.** Core never contains, re-exports, or declares a technology integration, whether as a dependency, optional dependency, or optional peer. Tree shaking does not change this.
- **Not a zero-dependency rule.** Libraries that implement the package's promised capability, React bindings, and thin standard-platform bindings are fine. Use the [dependency classification](../docs/architecture.md#dependency-classification), not a blanket exemption for existing peers.
- **Direction:** consumer → integration → core contract. A packaged integration sits in the layer map above every contract it imports; core never imports it.
- **Reuse first.** Find the [concern owner](../docs/architecture.md#concern-owners). Consume its behavior, or implement its contract when supplying an adapter. Enhance an inadequate owner generically; never duplicate errors, validation, retries, contracts, or event shapes.
- **Prove isolation.** A new integration package uses the existing generator and proves its dependency closure and a clean core-only install.

## Public API and stability

Every export is a promise a consumer builds on. Keep the surface small, typed, and consistent so it can stay stable after alpha.

- **Minimal surface.** Export only what consumers need. An incidental export that leaks representation is a defect.
- **One path per name.** Named exports only, never `export *`. Each name has exactly one import path, following the [entry vocabulary](../docs/architecture.md#choose-an-entry-point).
- **Typed contracts.** No `any`, unchecked `as`, or non-null `!` in public types. Use `unknown` with narrowing, generics, `satisfies`, and discriminated unions. Document unions that may grow.
- **Typed errors.** Errors are typed, actionable, and preserve their cause. Never throw strings. A failure callers branch on is a typed error or result.
- **Consistent shapes.** The same concept uses the same word and seam shape in every package; internal consistency outranks matching any outside project. Wire shapes follow published standards (RFC 9457 problems, the `google.rpc` error model and canonical codes, SSE), never one backend's conventions.
- **Explicit construction.** Public factories take typed option objects (`createX({...})`), with no hidden global configuration.
- **Documented.** Every public export has TSDoc; see [Documentation and consumer experience](#documentation-and-consumer-experience).
- **Release line.** Alpha versions are `0.1.0-alpha.N` on the `alpha` dist-tag, never `latest`. Breaking changes are welcome now and use a `minor` Changeset.
- **Before stable.** Leaving alpha requires a written stability and deprecation policy: what counts as public, the semver scope, the deprecation window, and the supported React and Node ranges. It is not written yet; see [Known gaps](#known-gaps).

## Host independence

Cores assume no host: no DOM, React, Node, or framework. Next.js, Vite, Astro, TanStack Start, Remix, workers, and React Native plug in through explicit seams.

- **Use universal values directly:** `AbortController`, `AbortSignal`, `Headers`, `URL`, `URLSearchParams`, `Response`, `TextDecoder`.
- **Inject host-varying behavior:** `fetch`, SSE, `WebSocket`, cryptography, and server credential custody. See [runtime primitives](../docs/architecture.md#runtime-primitives).
- **Entries separate runtimes:** neutral `.` and concern subpaths, DOM-free `./client` unless the package declares `dom`, server-only `./server`, thin platform bindings, components, assets, and `./testing`. See [Choose an entry point](../docs/architecture.md#choose-an-entry-point).
- **Portability is proved, not assumed.** The ES2023-only compile profile and boundary fixtures reject DOM or Node types in neutral and client graphs. A separate integration package declares its narrower runtime and never weakens the core gate.
- **Server custody never enters a `"use client"` graph.** `"use client"` is per module, never a global banner.

## Errors, async, and composition

- **No silent failure.** No swallowed errors, empty `catch`, or success-shaped fallbacks on runtime paths.
- **Bound remote work.** Every remote call has a timeout through `AbortSignal`. Retries are bounded, jittered, and only for idempotent operations, using the `std` resilience owner. Exactly one layer retries a given call path. Reconnect, backpressure, and circuit-breaking degrade gracefully.
- **Own every resource.** Each stream, subscription, timer, listener, and `AbortController` has an owner, cancellation, and teardown. Borrowers release their own subscriptions, never their owner's runtime. React effects return cleanup.
- **Fence cancellation.** Cancellation stops late mutation and publication, not just the caller's wait.
- **Clean up honestly.** Cleanup gets a fresh bounded budget, preserves the initiating failure, and keeps a retryable owner if resources cannot be released. Forced termination is not graceful success.
- **Bound memory.** Queues and buffers have limits and documented backpressure. Drain and unsubscribe on shutdown.
- **No import-time effects.** Importing a module never dials the network, reads the environment, or opens a handle.
- **No globals.** No module-level singletons, mutable global registries, or string service locators. Adapters register through an injected registry or `createX({...})`, selected by config.
- **Hosts own lifetimes.** The host creates process-, request-, or browser-root resources explicitly. Request handlers may share authoritative persistence; never recreate authoritative data, such as a session store, per request.
- **One failure model.** `std/failure` is the vocabulary. Transports decode at their boundary through injected decoders, and apps use `createFailureHandler`. See [Remote failures and forms](../docs/architecture.md#remote-failures-and-forms).

## Security and privacy

- **Validate every trust boundary.** Network payloads, decoded stream messages, URL parameters, redirect targets, model output, and retrieved content are untrusted. Bound the size and time of untrusted reads. Default to least privilege.
- **Credentials never go in URLs.** Use headers or secure cookies, including for SSE and WebSocket.
- **Browser sessions are opaque.** The browser holds only an opaque `__Host-` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`. Identity and provider credentials stay at the authoritative backend. No browser access or refresh tokens, in storage or in memory, and no signed identity cookies. See [ADR 0011](../docs/adr/0011-opaque-browser-sessions.md).
- **OIDC.** Authorization Code with PKCE `S256` only, exact redirect matching, and validated state. Server-side provider refresh and rotation stay supported. Cookie-authenticated state changes are CSRF-protected.
- **Current crypto.** Use Web Crypto and `crypto.getRandomValues` for anything security-relevant. No MD5 or SHA-1 for security. JWT verification rejects `alg: none`, uses an algorithm allow-list, and checks `exp`, `iss`, and `aud`.
- **Minimize data.** Never log tokens, credentials, cookies, or full payloads. Redact sensitive fields and bound retention.
- **Render safely.** Rendered user, model, or retrieved content is untrusted: no unsanitized HTML and no `eval`.
- **No secrets** in source, fixtures, logs, or retained artifacts. Only `.env.example` is committed.
- **Model features.** Structured, validated outputs; least-privilege tools with a human gate on destructive actions; versioned prompts and models, gated on evals.

A secure browser session does not require a Next backend; the consumer chooses the authority.

## UI quality

Accessibility and responsive behavior are acceptance criteria for interactive client code, never follow-up work.

- **Accessible.** WCAG 2.2 AA. Semantic HTML first, ARIA only to fill gaps, and an accessible name on every control. Full keyboard operation, logical focus order, visible and unobscured focus, and no traps. Targets of at least `24×24` CSS px; text contrast 4.5:1 and UI contrast 3:1.
- **Axe is a floor.** Every client render test file awaits `expectNoAxeViolations` from `@plainworks/testkit/client`, and `check-axe-coverage` enforces it. Automation finds only part of WCAG issues, so keyboard, focus, and roles are still reviewed.
- **Responsive.** Mobile-first and fluid: relative units, `clamp()` type (never `vw`-only), `minmax()` and `auto-fit` grids, and no fixed-pixel traps or overflow at 320 px or 200% zoom. Components adapt with container queries. Honor `prefers-reduced-motion` and `prefers-color-scheme`.
- **Fast.** Split heavy and route-level surfaces with `React.lazy` and `Suspense`. Let the React compiler memoize; add `memo`, `useMemo`, or `useCallback` only with a profiled win. Virtualize long lists. Keep bundles tree-shakeable with per-component subpaths and `"sideEffects": false`.
- **Neutral logic stays neutral.** Pure logic lives in the neutral graph; the `"use client"` leaf holds only DOM and hook code.

### Vendored atoms

`packages/elements/src/shadcn/` holds vendored shadcn atoms locked by `shadcn.lock.json`; `src/atoms/` holds primitives we own. A name lives in one folder. The model is in [Architecture](../docs/architecture.md#vendored-atoms).

- **Never hand-edit** `src/shadcn/**` or the lock. Change atoms only through `registry:update` or `registry:add`, using the [update-atoms](skills/update-atoms/SKILL.md) skill.
- **Never re-add a variant upstream does not ship.** Follow the deviation ladder and stop at the first rung that works: theme tokens and rules, then the call site (props, `className`, `role`), then a `@plainworks/ui` wrapper. Fix upstream bugs the same way and note them for upstream reporting.
- **Relaxed strictness is only for vendored code.** `tsconfig.shadcn.json` and the Biome override cover `src/shadcn`; `src/atoms` follows every rule.

## Testing and proof

- **Test-first.** Write a failing behavioral test, then the minimal code, then refactor while green. Cover failure paths: timeouts, aborts, reconnects, expiry, and validation rejection.
- **Deterministic.** Injected clocks or fake timers, seeded randomness, and no real network or filesystem in unit tests. Tests are safe under parallel and shuffled runs.
- **Test what users see.** Query by role or label, with `getByTestId` as a last resort. Drive interaction with `@testing-library/user-event`, not `fireEvent`. Never assert class names or internal state.
- **Mock at the boundary.** Use MSW with `onUnhandledRequest: "error"`, not `fetch` stubs.
- **Reuse test owners.** Shared fakes and harnesses live in `@plainworks/testkit`; mocked services and the MSW lifecycle live in `@plainworks/mocks`. Tests may import them upward through the test-only carve-out. `std` uses local fakes because `testkit` depends on it.
- **Coverage.** At least 80% per package and 85% for security-critical packages such as `auth`. Never lower a threshold. A test that only touches lines is not coverage.
- **Proof matches the claim.** Unit doubles prove contracts, not native drivers, processes, TLS, browsers, or packaged consumers. Required integration environments fail loudly when missing. Review both source imports and installed dependency graphs. A capture is not visual acceptance until someone opens and judges it.

Where unit, integration, and browser tests live is in [Testing](../docs/architecture.md#testing).

## Documentation and consumer experience

plainworks succeeds only if someone new can adopt it. Docs, error messages, and examples are part of the product.

**Adoption**

- **Each package stands alone.** A consumer can adopt one package without the rest of the kit. Reference hosts prove the kit; they never become requirements.
- **Shortest working path first.** A package README leads with its one-line concern, the import, and a runnable example, then its entries, contracts, and errors.
- **Errors explain the fix.** A message says what failed and what the caller can do. An error that only says "invalid" is a defect.
- **Strict inside, simple outside.** Layers, profiles, and gates are contributor concerns. Consumer docs explain capabilities and safe use, not internal mechanics.

**Writing**

- **Simple and organized beats complete.** One idea per sentence, plain and active. Short sections, meaningful headings, and lists or tables for dense detail. A crowded page is a defect.
- **Describe the benefit, not the mechanism.** Name one or two representative identifiers, never an exhaustive list.
- **Diagram where prose fails:** dependency direction, auth or reconnect flows, state machines. One idea per diagram with a one-line caption.
- **Describe the code as it is.** No history, plans, or process narration in docs or comments; plans live in `tmp/`.
- **Commands are real.** Every documented command exists in a manifest, `turbo.json`, or a tool bin.
- **Generated content stays generated.** Never hand-edit between `layer-map` markers; run `bun run sync-layer-map`.

**Format**

- Markdown paragraphs are one source line; never hard-wrap prose. Keep headings, lists, tables, diagrams, and code blocks intact.
- Code comments wrap at 100 columns (`bun run check-comments`, `bun run format-comments`). Comments explain why, not what. No commented-out code; a `TODO` or `FIXME` links a tracked issue.
- Every public export has TSDoc: a summary, `@param` and `@returns` when not obvious, `@throws` for typed errors, and `@example` for primary entry points. Client-only and security-sensitive exports state their constraint.

**Release notes.** Changesets are written for consumers: what they gain or must change, not internal mechanics. Until the first release, each package has one note, `.changeset/first-alpha-<package>.md`, that describes the package as it is now. A change edits that note when the summary no longer fits; it never adds another note. Only a new package adds its own.

## Dependencies and supply chain

- **Platform first.** Before adding a dependency, check that no Web API, platform feature, or `std` owner already covers the need.
- **Justify each dependency:** maintained upstream, compatible license, no open advisory, and a one-line reason.
- **One catalog.** Every version, peer ranges included, references `catalog:` or `workspace:*`. Sherif and Syncpack reject drift.
- **Reproducible installs.** `bun.lock` is committed; CI installs with `--frozen-lockfile`.
- **Pinned CI.** Every action is pinned by full commit SHA with a version comment; each job gets least-privilege permissions.
- **Honest packaging.** ESM-only with generated `exports`, `types`, and `files`. Packages ship `dist` plus `src` (tests excluded) with source maps; `dist` is never committed. publint and are-the-types-wrong check the packed tarball.
- **Provenance.** Changesets drive versions. Publishing runs only through `release.yml` with npm trusted publishing and provenance; see the [release](skills/release/SKILL.md) skill.

## Code structure

- **One concern, one plain word.** Packages, folders, and files are named for their concern. No `core`, `engine`, `foundation`, `utils`, `helpers`, or `misc`. Qualify ambiguous verbs (`composeInterceptors`, `classifyError`).
- **Group by concern.** A multi-module concern is a folder with a re-export-only `index.ts`. Group when a second sub-concern appears, not when a file feels long; cohesive files may stay large. Barrels hold no logic.
- **Workspace roots.** `packages/` publishes capabilities, `apps/` holds private reference hosts, and `internal/` holds dev tooling and cross-package tests. Every workspace follows one generated [profile](../docs/architecture.md#workspace-profiles).
- **Generated manifests.** Never hand-edit derived `package.json` fields (`exports`, `files`, `sideEffects`, scripts, preset dev dependencies). Declare entries in `tsdown.config.ts` (`export const build: PackageBuild`) and run `bun run sync-shape`.
- **Generated workspaces.** New packages and tools come from `bun run gen package` or `bun run gen tool`, then join [`layers.json`](../internal/boundaries/layers.json).
- **ESM and style.** Strict TypeScript with `isolatedDeclarations` and bundler resolution, ESM only. `typecheck` (`tsc --noEmit`) is separate from `build` (tsdown). Biome owns format and lint: 2 spaces, width 100, LF, organized imports.

## Toolchain

| Concern | Tool |
|---|---|
| Runtime and packages | Bun (`bun@1.3.6`); Node `^22.12 \|\| ^24 \|\| >=26` in the CI matrix |
| Tasks and caching | Turborepo |
| Build | tsdown through `@plainworks/tsdown-config`: ESM-only, per-module `"use client"`, React as peers |
| Lint and format | Biome |
| Layers and cycles | dependency-cruiser in `@plainworks/boundaries`, fed by `internal/boundaries/layers.json` |
| Versions | Sherif and Syncpack over the Bun catalog |
| Workspace shape | `@plainworks/shape` (`check-shape`, `sync-shape`) |
| Generation | `@turbo/gen` (`bun run gen`) |
| Tests | Vitest with v8 coverage through `@plainworks/vitest-config`; Playwright for browser flows |
| Packaging and release | `@plainworks/release`, Changesets, npm trusted publishing |

### TypeScript compiler boundary

The catalog pins `typescript` at `^6.0.3`. TypeScript 7 has no JavaScript Compiler API, and dependency-cruiser needs it to extract imports, so raising the pin would silently disable the layer gate. A test in `@plainworks/boundaries` enforces the TypeScript 6 line. Raise it only after the boundary package can still extract and validate imports.

## Definition of Done

`bun run verify` runs every gate in order and is the only gate list (`internal/verify`; `bun run verify --list` describes each gate). CI and the release workflow call the same command. A change is done when:

1. `verify` is green: scoped while iterating, unscoped for acceptance, audits, and releases. The [validate](skills/validate/SKILL.md) skill has the scoped forms and extra checks.
2. Behavior is tested first, including failure paths, at the required coverage.
3. A Changeset covers every publishable change.
4. The rules in this file hold, including the ones no gate catches: bounds, teardown, import-time effects, credential placement, and UI judgment.
5. A change a user can see in an app also passes the UI check:
   1. The touched flows pass: `bun run e2e -- e2e/flows.spec.ts --grep "<flow>"`.
   2. `bun run ui:capture --flow <flow>` frames (desktop and mobile, light and dark) were opened and look as intended. Use `--save-as before` and `--base before` for a side-by-side.
   3. The handoff or PR names the flows checked and what changed visually.

A new user journey gets a flow in `apps/<app>/e2e/flows/` with `covers` globs. A changed screen shown in an app README gets `bun run ui:capture --docs` and a fresh look. See the [testkit UI loop](../packages/testkit/README.md#the-ui-loop--uicapture).

Green gates are necessary, not sufficient.

## Known gaps

These are intentionally not built yet and stay open to revisit. Do not claim them as enforced.

| Gap | Today |
|---|---|
| Written stability and deprecation policy for after alpha | Required before stable graduation |
| Public API surface report in CI, to catch accidental breaking changes | Reviewed by hand in the [review](skills/review/SKILL.md) API pass |
| Bundle size budgets per entry | Tree-shaking reviewed by hand; `check-production` covers only devtools exclusion |
| Automated core-only clean install for integrations | Proved by hand per the [validate](skills/validate/SKILL.md) skill |

When a gap gets a gate, move the rule into the sections above and delete its row.
