# TypeScript Review — Plan, Clarify, Apply

An alternative orchestrator to [`review-changes.md`](./review-changes.md) / [`review-project.md`](./review-project.md): instead of sequencing the 00–08 passes, it splits the review into **parallel subagent passes by TypeScript concern**, then plans and applies fixes. Use it when you want one driver to take a change from review through to merged fixes.

Run each pass as a **separate subagent with clean context**. The orchestrator (this file) sequences them and collects findings. Do not concatenate passes into one prompt.

Mode is either **changes** (a diff: branch, commit range, `HEAD~1`) or **project** (whole tree, no diff). State the mode up front.

> The focused 00–08 files hold the canonical, plainworks-specific checks (placement, canonical reuse, principles, security/privacy, quality, tests, supply chain, comments, and — for UI — accessibility/responsive/performance). This file is the *driver*; when a pass below needs the full rule, defer to the matching focused file rather than duplicating it.

---

## Phase 1 — Scope

1. `git status`, `git diff --stat`, `git diff` (changes mode) or `ls packages internal apps` + the `LAYERS` map (project mode). Preserve uncommitted changes; integrate on top, never discard.
2. List the scope: changed packages (changes mode) or chosen packages/workspace (project mode). Note cross-cutting touches — a lower-layer package's public surface affects every package above it and every consuming app; the server/client split means an export moving between `.` and `./client` is a surface change. Also flag edits to the root catalog, `internal/boundaries` (`LAYERS`), the golden generator templates, `turbo.json`, and shared error/config types.
3. Determine which passes apply via the triggers below. Skip non-applicable passes explicitly in the final report.

The reviewer judges code as written, against the rules below and the baseline in [`.github/copilot-instructions.md`](../../../copilot-instructions.md). PR descriptions, commit messages, or plan docs are scope hints only — never justifications.

## Phase 2 — Passes

Run **A first** (cheap, gates the rest). Then **B–F in parallel** where independent, plus **H** when the change touches interactive UI. Then **G last** (cross-references everything).

Each subagent receives: its scope, the pass spec below, and nothing else. Each returns findings in the shared format. Scope the gates to the touched package(s) with `turbo run <task> --filter=@plainworks/<name>`; the unscoped workspace run is for sign-off/CI.

### Pass A — Mechanical (always runs)

Tool output only, no judgment. Use plainworks' real gates (run under a supported Node — `^22 || ^24 || >=26`; the boundary gate rejects others):

```bash
bun run check-versions                              # Sherif + Syncpack: single-catalog / dedupe (fast)
turbo run lint --filter=@plainworks/<name>          # Biome check
turbo run typecheck --filter=@plainworks/<name>     # tsc --noEmit
bun run check-boundaries                            # dependency-cruiser layer gate
turbo run build --filter=@plainworks/<name>         # tsdown
turbo run test --filter=@plainworks/<name>          # Vitest + coverage
```

Report pass/fail per command with the first failure block verbatim.

### Pass B — Correctness

**Scope:** all in-scope `.ts` / `.tsx` files.

Check: no `any` leaking through logic (prefer `unknown` + narrowing); no non-null assertion (`!`) or unchecked cast (`as`) on a runtime/user-input path; discriminated unions handled exhaustively (a `switch` with a `never` default); errors are typed and propagated, never swallowed (`catch {}` or `.catch(() => {})` without a typed re-throw is a finding); no success-shaped fallback that masks a failure; every `Promise` is awaited or explicitly handled (no floating promises); resource cleanup on every path including errors (an `AbortController` is aborted, an `EventSource`/subscription is closed, a timer is cleared). *(Canonical reuse: pass [`01`](./01-canonical-reuse.md).)*

Skip if: scope is docs-only or config-only.

### Pass C — Async & resource lifecycle

**Scope:** files using `Promise`, `async`/`await`, `setTimeout`/`setInterval`, `AbortController`, `EventSource`/`WebSocket`, streams, React effects, or event emitters.

Check: every outbound/remote call has a **timeout and an abort path**; reconnect/backoff is bounded (exponential + jitter) and cancellable; queues/buffers/streams are **bounded with documented backpressure** — an unbounded buffer or a subscription with no teardown is a **blocker**; React effects clean up (unsubscribe/abort on unmount); no work continues after teardown; time-dependent paths are testable via Vitest fake timers, not wall-clock waits. *(Tests angle: pass [`05`](./05-tests-tdd.md).)*

Skip if: no async, timer, stream, or effect code in scope.

### Pass D — Composition & lifecycle

**Scope:** registries, adapter/backend construction, `createX({...})` / `register()` factories, provider wiring, anything wiring dependencies together.

Check: registries and policies are **explicitly injected**, selection is config-driven; **no import-time side effects and no module-level singletons** — no network/file/env access at module load, no shared mutable module state, no top-level client/store instance (a module-level singleton or init-on-import is a **blocker**); per-request / per-caller **factories** instead; adapters register via explicit `register()` / `createX({...})`, never an `init()`-style import hook; a package facade only re-exports — behavior added directly to the barrel is misplaced; the lean default (in-memory / local) stays in core, backends are opt-in. *(Placement: pass [`00`](./00-structure-placement.md); principles: pass [`02`](./02-principles.md).)*

Skip if: no composition/lifecycle/registry code in scope.

### Pass E — Security, config & boundaries

**Scope:** auth, transports (sse/connection/connect), config/env handling, redirect/URL handling, cookie/token handling, anything touching untrusted input (network responses, message payloads).

Check: untrusted input is validated at the boundary before it flows onward (a redirect target, a message payload, a server response consumed as typed data); tokens are **header-only** or `__Host-` cookies (`Secure` + `HttpOnly` + `SameSite=Strict`), **never** `localStorage`/`sessionStorage` or a query string; auth uses Authorization Code + **PKCE (S256)**, refresh-token rotation, never the implicit flow; current crypto only via Web Crypto (no MD5/SHA-1-for-security, no hard-coded key/IV); no secret in source, logs, or fixtures (`.env.example` only, no secret in a client bundle); unbounded reads of untrusted input get explicit limits; config precedence is explicit and tested. *(Full rule: pass [`03`](./03-security-privacy.md).)*

Skip if: no security-sensitive, auth, config, transport, or redirect code in scope.

### Pass F — API surface & dependencies

**Scope:** `src/index.ts`, `src/client.ts`, `package.json`, anything changing the public export surface.

Check: exports are intentional and minimal; **no `any` / `unknown`-without-narrowing on a public API** — prefer generics, discriminated unions, typed contracts; ESM-only discipline holds (`"type": "module"`, `"sideEffects": false`, correct `exports` for `.` and, where present, `./client`, `"files": ["dist"]`); client-only code carries `"use client"` and lives behind `./client`, `.` stays server-safe; every dependency/peer is **catalog-pinned** (`catalog:` / `workspace:*`), no inline version; a new dep is justified (maintained, no open advisory, not duplicating `@plainworks/std` or the platform); a new package is wired into the `LAYERS` table and imports only downward. *(Reuse & placement: passes [`01`](./01-canonical-reuse.md) and [`00`](./00-structure-placement.md); packaging: pass [`04`](./04-quality.md).)*

Skip if: no public items, deps, or `package.json` in scope.

### Pass H — UI: accessibility, responsive & performance

**Scope:** `"use client"` / `./client` modules, `.tsx` components, and their styles/tests.

Check: interactive controls use semantic HTML with correct roles and an accessible name, are fully keyboard-operable with a visible, unobscured focus ring, and meet WCAG 2.2 AA (contrast, `24×24`-px target size); each new/changed component test carries an axe assertion (`toHaveNoViolations`) as a floor, with keyboard/focus/role correctness still read by the reviewer; layout is mobile-first and fluid (relative units, `clamp()` type, no fixed-pixel traps, no scroll at 320px / 200% zoom) with component adaptivity via container queries, honoring `prefers-reduced-motion`/`-color-scheme`; heavy/route surfaces code-split behind `React.lazy`+`Suspense`, memoization is profiled not reflexive, the surface stays tree-shakeable, and every subscribe/timer effect cleans up; server-safe logic stays out of the `"use client"` leaf and server-only auth is never reachable from it. *(Full rule: pass [`08`](./08-ui-accessibility.md); custody cross-refs pass [`03`](./03-security-privacy.md).)*

Skip if: no interactive UI/client code in scope.

### Pass G — Tests, docs, semantics (runs last)

**Scope:** the in-scope code plus findings from A–F.

Check: behavioral code in scope has tests covering it (changes mode: in the same diff; project mode: anywhere in the tree); a bug fix has a regression test that fails without it; failure paths asserted, not just happy paths; tests are **deterministic** — fake timers, injected clock, seeded RNG, no real network/FS, correct env (jsdom for client, node for server-safe); shared fakes/harnesses come from `@plainworks/testkit`, not hand-rolled; coverage floors met (≥ 80% package / ≥ 85% security-critical); public API has TSDoc that matches the signature (`@param`/`@returns`/`@throws`); an operation does what its name implies; comments describe the code as it is, not plans/history; a changeset is present for a publishable change. *(Full rules: passes [`05`](./05-tests-tdd.md) and [`06`](./06-docs-supply-chain.md); comment rules: pass [`07`](./07-comments-tsdoc.md).)*

Always runs.

## Phase 3 — Consolidate

Orchestrator collects findings into one table:

```
pass | severity (blocker/should-fix/nit) | file:line | finding | suggested fix
```

Severity rule: **blocker** = principle violation, behavior is wrong, or a contract is broken (see [`SKILL.md`](../SKILL.md) for the full definition). Otherwise should-fix or nit.

Group by file in the final report. State explicitly any pass that was **skipped** (with the trigger that failed) and any pass that was **deferred** (with reason).

## Phase 4 — Plan and clarify

Group findings by pass, order by severity. For each group write a one-line fix plan: what changes, where, how it's verified. Flag ambiguities (behavior change vs strict fix, breaking surface vs additive, doc-only vs behavior-aligning) with a proposed default and the alternative. **Pause for user confirmation before editing.**

## Phase 5 — Apply

After confirmation:

1. Apply fixes in plan order, one pass per commit where reasonable (Conventional Commits: `feat`/`fix`/`docs`/`refactor`/`test`/`chore`). Keep one commit per branch (amend) unless told otherwise.
2. Re-run the matching pass's validation after each fix, scoped to the touched package(s). Stop and report if anything fails.
3. Final step: re-run Pass A across the in-scope packages, and add a changeset if a publishable package changed.

## Reviewer notes

- Code judges itself. External narrative (PR description, commit message, plan doc) is scope only, not justification.
- Detection commands (`rg`, `turbo`, `bun`) are loaded by the subagent when it searches, not held in the resident prompt.
- If scope is trivial (docs-only, single-line fix), run only A and G; skip the rest with explicit reason.
