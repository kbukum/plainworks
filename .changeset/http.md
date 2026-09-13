---
"@plainworks/http": patch
---

Add `@plainworks/http`, a typed fetch client that doubles as the REST/JSON client. It runs anywhere and depends only on the platform's `fetch`, which you can swap out.

You create a client with a factory, one per request, so nothing leaks between server-rendered requests. Every request runs the same safe pipeline:

- **Safe URLs** — rejects credentials hidden in the query string and paths that try to escape the base URL, and re-checks the final URL so nothing can sneak a credential across origins.
- **Interceptors and header-only auth** — a clear order, re-applied on every attempt; tokens go in headers, never the URL.
- **Resilience** — a per-attempt timeout and safe, jittered retries for methods that can be repeated.
- **Typed failures** — every fault becomes a typed error that keeps its cause and says whether it can be retried.
- **Validated responses** — the body is treated as untrusted and validated before you get a typed result; trusting the wire is an explicit opt-in.

Alongside the low-level request, there are convenient `get`/`post`/`put`/`patch`/`delete` methods that return the decoded body. Writes retry only when you provide an idempotency key. Logging hooks receive records with secrets stripped out.
