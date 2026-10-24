# plainworks

Host-independent React and TypeScript capabilities. Consumers choose their hosts, backends, and adapters. `packages/` publishes capabilities, `apps/` holds reference hosts, and `internal/` holds dev tooling. Use Bun and the catalog versions in `package.json`.

## Invariants

- **Alpha:** redesign root causes. No compatibility shims or parallel old and new models; move every consumer and delete the superseded path in the same change. Breaking changes use a `minor` Changeset.
- **Ownership:** imports point strictly downward. Reuse or enhance the [concern owner](../docs/architecture.md#concern-owners) before adding code. Core never contains, re-exports, or declares a technology integration, even as an optional peer; a subpath is not a dependency boundary.
- **Public API:** small and typed, named exports, one path per name, concern-named modules, re-export-only barrels. No `any`, unchecked assertions, string throws, swallowed errors, or success-shaped fallbacks.
- **Runtime:** neutral cores assume no host and inject host-varying behavior. `"use client"` is per module. No import-time I/O, globals, or service locators; hosts own resource lifetimes. Bound calls, retries, and buffers; own cancellation and cleanup.
- **Security:** validate trust boundaries; never put credentials in URLs or retain secrets. Browser sessions are opaque `__Host-` cookies with backend custody and no browser tokens. Keep server-side OIDC with PKCE, and CSRF protection.
- **Proof:** test-first and deterministic, using testkit and mocks. Unit proof is not integration proof. WCAG 2.2 AA and responsive UI are defaults; app-visible changes need passing flows and opened, judged captures.
- **Generated and locked:** never hand-edit vendored atoms, their lock, derived manifest fields, or layer-map blocks. Never weaken the TypeScript compiler boundary or any gate.
- **Docs:** concise, task-first, written for the reader. Markdown is not hard-wrapped; TS comments wrap at 100 columns. Agent instructions state rules; skills state actions and link canonical detail.

## Work and validation

- Preserve worktree and index changes. Commit, amend, push, publish, or open draft PRs only when authorized, through the matching skill.
- Load only the matching [skill](skills/README.md) and the sections it needs. Plans live in `tmp/<plan>/`, reusing existing folders; apply each selected step fully and record progress in the step.
- `bun run verify --filter=@plainworks/<name>` scopes package gates, `bun run verify --list` describes them, and unscoped `bun run verify` is full acceptance. Use [validate](skills/validate/SKILL.md) for integration, UI, and generator checks. Prose-only edits need documentation checks only.

## Where to read

Read only the section the task needs; do not preload the whole reference.

| Task | Read |
|---|---|
| Place code, choose an entry, find an owner | [Architecture](../docs/architecture.md) |
| Any change, plan, or review | [Development stage](engineering.md#development-stage) |
| Integrations, adapters, new packages | [Ownership boundary](engineering.md#ownership-boundary), [Code structure](engineering.md#code-structure) |
| Exports, types, errors, release line | [Public API and stability](engineering.md#public-api-and-stability) |
| Runtime, async, failures | [Host independence](engineering.md#host-independence), [Errors, async, and composition](engineering.md#errors-async-and-composition) |
| Auth, crypto, untrusted input | [Security and privacy](engineering.md#security-and-privacy) |
| UI, theme, atoms | [UI quality](engineering.md#ui-quality) |
| Tests and acceptance | [Testing and proof](engineering.md#testing-and-proof), [Definition of Done](engineering.md#definition-of-done) |
| Docs, comments, Changesets | [Documentation and consumer experience](engineering.md#documentation-and-consumer-experience) |
| Dependencies, CI, compiler | [Dependencies and supply chain](engineering.md#dependencies-and-supply-chain), [Toolchain](engineering.md#toolchain) |

## Layer map

<!-- layer-map:table -->
| Layer | Packages | Responsibility |
|---|---|---|
| **L0** | `std` | Errors, results, guards, resilience, shared seams, list contracts, and structural web types. No React. |
| **L1** | `state`, `http`, `theme`, `observability` | Reactive state, typed HTTP, the design-token substrate, and logging, error reporting, telemetry, and Web Vitals. |
| **L2** | `channel`, `connect`, `query`, `elements` | Streaming, RPC, TanStack Query integration, and vendored UI atoms. |
| **L3** | `auth`, `ui` | Authentication, OIDC with PKCE, forms, data, navigation, and UI composites. |
| **L4** | `app`, `testkit`, `mocks`, `devtools`, `vite` | Application composition, shared test tooling, reusable MSW mock-building primitives, the development-only runtime inspector, and the Vite source link for consumer feedback loops. |
<!-- /layer-map:table -->
