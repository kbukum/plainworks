# plainworks

Host-independent React/TypeScript capabilities. Consumers choose hosts/backends. `packages/` publishes capabilities; `apps/` owns hosts; `internal/` owns dev tooling. Use Bun and the catalog/tool versions in `package.json`.

## Invariants

- Alpha: redesign root causes; no compatibility shims or parallel old/new models. Replace dependent consumers and remove superseded paths together. Breaking changes use a minor Changeset.
- Imports point strictly downward. Reuse [concern owners](../docs/architecture.md#concern-owners); enhance them before consuming. Core never imports/re-exports a technology integration or declares its driver, including optional peers. A subpath is not a dependency boundary; prove clean core-only installs.
- Typed APIs/errors; no `any`, unchecked assertions, swallowed errors, or success-shaped fallbacks. Concern-named modules; `index.ts` re-exports only. Named exports, one path per name.
- Neutral cores are host-independent. Inject varying behavior; keep server custody out of client graphs. Preserve ES2023 portability and per-module `"use client"`. No import-time I/O, globals, or service locators; hosts own resource lifetimes.
- Validate boundaries; never retain secrets or put credentials in URLs. Browser sessions use opaque Secure/HttpOnly/SameSite=Strict `__Host-` cookies with authoritative backend custody, not browser-token fallback. Preserve server-side OIDC/PKCE and CSRF.
- Bound calls/retries/buffers and own cancellation/cleanup. Cancellation fences late effects; cleanup preserves the initiating failure and a retryable owner.
- Test-first, deterministic behavior/failures; use testkit and mocks. Unit proof is not integration proof. WCAG 2.2 AA and responsive UI are defaults; UI acceptance requires passing flows and opened/judged captures.
- Never hand-edit vendored shadcn atoms/locks. Use registry commands; deviations go theme -> call site -> UI wrapper. Never weaken the TS compiler boundary or generated manifest/layer gates.

## Work and validation

Preserve worktree/index changes. Commit/amend/push/publish/open draft PRs only when authorized. Load only the matching [skill](skills/README.md) and required sections. Keep multi-step state in `tmp/plans/<task>/handoff.md`, not session transcripts.

`bun run verify --filter=@plainworks/<name>` scopes package gates; `bun run verify --list` lists them; unscoped `verify` is full acceptance. Use [validate](skills/validate/SKILL.md) for integration/UI/generator requirements. Prose-only edits need documentation checks. Markdown is not hard-wrapped; TS comments wrap at 100 columns.

Before implementation, read only applicable sections of [engineering](engineering.md): **Product and ownership boundary** for integrations; **Engineering principles** for runtime/test/security/UI; **Package structure** for exports/tooling; **TypeScript compiler boundary** for compiler updates; **Architecture invariants** for failures/forms/retries; **Build, Test, and Lint** for acceptance; **Vendored atoms** for primitives. Do not preload the whole reference.

## Layer map

<!-- layer-map:table -->
| Layer | Packages | Responsibility |
|---|---|---|
| **L0** | `std` | Errors, results, guards, resilience, shared seams, list contracts, and structural web types. No React. |
| **L1** | `state`, `http`, `theme`, `observability` | Reactive state, typed HTTP, the design-token substrate, and logging, error reporting, telemetry, and Web Vitals. |
| **L2** | `channel`, `connect`, `query`, `elements` | Streaming, RPC, TanStack Query integration, and vendored UI atoms. |
| **L3** | `auth`, `ui` | Authentication, OIDC with PKCE, forms, data, navigation, and UI composites. |
| **L4** | `app`, `testkit`, `mocks`, `devtools` | Application composition, shared test tooling, reusable MSW mock-building primitives, and the development-only runtime inspector. |
<!-- /layer-map:table -->
