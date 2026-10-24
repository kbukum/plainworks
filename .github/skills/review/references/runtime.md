# Runtime

Resilience, lifecycle, and composition. These compile cleanly and pass green gates while still being wrong, so they are the reviewer's job.

Rules: [Host independence](../../../engineering.md#host-independence), [Errors, async, and composition](../../../engineering.md#errors-async-and-composition). Model: [Runtime primitives](../../../../docs/architecture.md#runtime-primitives), [Remote failures and forms](../../../../docs/architecture.md#remote-failures-and-forms), [Composition rules](../../../../docs/architecture.md#composition-rules).

**Changes:** reason through every runtime path the diff touches. **Project:** sweep `packages/` for the same invariants.

## Checks

| Finding | Severity |
|---|---|
| Swallowed error, success-shaped fallback, or lost cause on a runtime path | blocker |
| Remote call with no timeout or `AbortSignal`; unbounded retry, or retry of non-idempotent work | blocker |
| Subscription, timer, listener, stream, or effect with no owner, cancellation, or cleanup | blocker |
| Unbounded queue or buffer, or no backpressure | blocker |
| Import-time I/O, module-level singleton, global lookup, or registry filled by import order | blocker |
| Persistent authority recreated per request, or a component disposing a resource it borrowed | blocker |
| Late result applied after cancellation; cleanup that can hang | blocker |
| A domain failure thrown as a plain `Error` that callers must branch on | should-fix |
| A shape that mirrors one backend instead of an idiomatic TS or published standard | should-fix |

The host owns process, request, and browser lifetimes; code receives resources and never decides that lifetime itself.

**Model features (only when touched):** model output and retrieved context are untrusted and validated; tools are least-privilege, with a human gate on destructive actions; prompt and model changes are gated on evals.

## Detection starters

Exclude tests when judging runtime hits.

```bash
rg "catch\s*\{\s*\}|catch\s*\(\w+\)\s*\{\s*\}" packages/*/src
rg "^(export )?const \w+ = (new QueryClient|create\w+)\(" packages/*/src
rg "addEventListener|setInterval|new AbortController|subscribe\(" packages/*/src
rg "fetch\(|EventSource|new WebSocket" packages/*/src
```
