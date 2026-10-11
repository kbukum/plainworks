# Review and apply fixes

Use only when fixes are requested. Follow [review](../SKILL.md) and the [baseline](../../../copilot-instructions.md). Preserve edits/index; review directly unless an independent agent is requested.

## Scope

Inspect the requested diff or tree, close callers/callees, and contracts. Flag public entry changes, runtime graphs, catalog/layer metadata, generated manifests/templates, and app impacts. Plans define scope, not exceptions.

## Passes

Use [validate](../../validate/SKILL.md) and `bun run verify --list` for current scoped gates. Load detailed rules only for applicable triggers.

| Pass | Trigger and checks | Detail |
|---|---|---|
| Placement/reuse | Packages, exports, integrations, shared behavior; canonical owners and strict downward dependencies | [00](00-structure-placement.md), [01](01-canonical-reuse.md) |
| Correctness | TS behavior; narrowed unknowns, exhaustive unions, typed causes, handled promises, no unchecked assertions/swallowed errors/success fallbacks | [02](02-principles.md), [04](04-quality.md) |
| Async/lifecycle | Requests, streams, timers, effects; bounded retry/backpressure, cancellation fencing, fresh bounded cleanup, retained retry owners | [02](02-principles.md), [05](05-tests-tdd.md) |
| Composition | Factories/registries; explicit selection and resource ownership, no singleton/import-time I/O, no per-request recreation of persistent authority | [00](00-structure-placement.md), [02](02-principles.md) |
| Security/config | Auth, URLs, untrusted data; validated bounds, opaque secure cookies, server-side OIDC/PKCE and refresh, CSRF, redaction, no browser-token fallback | [03](03-security-privacy.md) |
| API/dependencies | Entries/manifests; neutral/client/server separation, named exports, generated shape, catalog versions, clean-consumer dependency isolation | [01](01-canonical-reuse.md), [04](04-quality.md) |
| UI | Interactive client code; WCAG 2.2 AA, keyboard/focus, 24px targets, axe floor, mobile/zoom/container adaptivity, motion preferences, measured performance | [08](08-ui-accessibility.md) |
| Tests/docs | Every scope; deterministic behavior/failures, package/security coverage, current TSDoc, working examples, necessary Changesets | [05](05-tests-tdd.md), [06](06-docs-supply-chain.md), [07](07-comments-tsdoc.md) |

Use testkit for shared helpers and mocks/MSW at the network boundary. Core std may use local doubles to avoid dependency cycles. Unit, native/process, clean-package, and real-browser claims require matching evidence; captures need to be opened and judged. Prose-only work needs documentation checks, not application builds.

## Findings and acceptance

Report `severity — file:line — finding — principle — fix`, grouping patterns. Principle violations, wrong behavior, and broken contracts block acceptance. Explain skipped/deferred passes and evidence gaps.

Apply authorized root-cause fixes test-first; validate affected packages and required acceptance. Ask only for unresolved scope or behavior decisions. Commit/amend/push/PR require separate authorization.
