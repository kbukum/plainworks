# Pass 02 — Principle conformance

Each item here is a hard principle from [`../../../copilot-instructions.md`](../../../copilot-instructions.md), not a preference. This is where fast AI-assisted coding drifts most — especially around resilience, async teardown, and composition.

> **Run in a separate, clean-context agent** with a high-capability model. A plan/spec may be passed in as a scope checklist only; it never excuses a baseline violation.

**Scope note.** *Changes mode:* grep the touched packages and reason about each runtime path. *Project mode:* the typed-API/async/composition invariants below hold across the whole surface — sweep all of `packages/`.

## Typed, minimal APIs

- **No `any` in a public surface.** Prefer `unknown` + narrowing, generics, `satisfies`, discriminated unions. An `any` param/return, or an unchecked `as`/`!` used to launder a type across a public boundary, is a blocker. `any` genuinely required for an opaque third-party contract is documented at the call site.
- **Typed errors, no thrown strings.** A small typed error / result that preserves cause. `throw new Error("...")` for a domain failure that callers must branch on is a should-fix — model it as a typed error/result.
- **Minimal surface.** Export only the intended API from `index.ts`; keep internals unexported. An incidental `export` that leaks a representation detail is a should-fix.

## Errors & resilience

- No swallowed errors (`catch {}`) or success-shaped fallbacks that mask failure on runtime paths.
- **Every remote call has a timeout** via `AbortSignal`. Retries are **bounded, jittered, and applied to idempotent operations only** (reuse the `std` policy — pass 01). Reconnect/backpressure/circuit-break and degrade gracefully rather than hang or storm.

## Async & concurrency

- Every stream, subscription, timer, and `AbortController` has clear **ownership, cancellation, and teardown**. A subscription with no unsubscribe path, or a timer/listener never cleared, is a blocker (leak).
- Queues / buffers are **bounded with documented backpressure**; connections/streams **drain and unsubscribe on shutdown**. An unbounded in-memory buffer (e.g. an SSE/WS message queue that grows without limit) is a blocker.
- A React `useEffect` that subscribes must return its cleanup; a missing cleanup is a blocker.

## Composition

- Registries and adapters are **explicitly injected / created**; selection is config-driven.
- **No import-time side effects** (importing a module dials no network, reads no env, opens no handle) and **no module-level singletons** — stores, query clients, sessions, and connections come from **per-request factories** (SSR/RSC-safe). A module-level `createStore()` / `new QueryClient()` at top level, or a registry populated by import order, is a blocker.
- No reaching for a global — inject the store/client/logger.

## Keep code current

Current idioms and standards, not old habits (also pass 01). Prefer platform APIs (`AbortController`, `structuredClone`, `crypto.subtle`, `URL`) over dependencies. Best practices outrank cross-kit mimicry: a non-idiomatic TS shape that exists only to mirror gokit/rskit (a stringly-typed union that should be a discriminated union, a transliterated API) is a should-fix — name the idiomatic TS alternative. Internal consistency across plainworks outranks cross-kit sameness.

## AI / model features (only if the change touches them)

Model output and retrieved context are **untrusted**; outputs are structured/validated; tool calls are least-privilege with a **human gate on destructive actions**; prompts/models are versioned and changes gated on evals.

## Detection starters

Exclude `*.test.ts(x)` when judging runtime-path hits.

```bash
rg ": any\b|as any|<any>| any\[\]" packages/*/src         # any in a surface
rg "catch\s*\{\s*\}|catch\s*\(\w+\)\s*\{\s*\}" packages/*/src   # swallowed errors
rg "new QueryClient\(|createStore\(" packages/*/src        # module-level singleton smell (must be in a factory)
rg "addEventListener|setInterval|new AbortController|subscribe\(" packages/*/src   # needs teardown
rg "fetch\(|EventSource|new WebSocket" packages/*/src      # each remote call needs a timeout/AbortSignal
```

Read each hit for the missing timeout / teardown / factory. A green typecheck does not prove any of these — they are the reviewer's job.
