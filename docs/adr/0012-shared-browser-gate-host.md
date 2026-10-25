# 0012 — One browser-gate host per run, with data scoped per test

**Status:** Accepted · **Date:** 2026-10-25

## Context

The browser gate started one host per Playwright worker so each worker could reset its own mock backend. Every worker paid the host's startup and compile cost, so runs added workers slowly and CI ran 1–2 workers. The showcase gate took about 17 minutes in CI.

## Decision

Each run starts one host, and every worker shares it. Each test gets its own data scope: a random id sent in a request header through the browser context's `extraHTTPHeaders`. The host serves each scope from its own seeded mock backend and drops it when the test releases it.

- **A header, not a cookie.** The header reaches navigations, fetches, and API requests alike. Page scripts can't read or change it, and it stays out of the session cookie's custody.
- **testkit stays independent of mocks.** The gate takes the header name and a release callback (`dataScope`). `@plainworks/mocks/scope` supplies one way to honor it.
- **A malformed scope fails.** It gets a `400` problem, never the shared data. A request without the header uses the default backend, so local development is unchanged. Hosts ignore the header in production.
- **Server reads forward the scope.** Server code that reads the mock backend over HTTP sends the request's scope header too. The showcase SSR instead calls a per-scope backend directly.
- **Sessions and the mock IdP stay shared,** keyed by cookie. So the mock IdP retires its oldest refresh grant when full, as real providers do, instead of refusing new sign-ins.
- **The showcase serves a built bundle.** It's built once per run with development React, so hydration warnings and the inspector stay part of the proof. `check-production` proves the production bundle. The Next host shares one `next dev`.
- **The full gallery theme matrix runs nightly.** Pull requests keep every gallery group in light and dark, plus the theme token contrast tests for every scheme.

For now, CI runs 3 showcase workers and 2 Next host workers. These are a first choice to tune from measured CI runs.

## Consequences

A run pays host startup once, so adding workers makes it faster until the machine's CPU runs out. Tests can no longer rely on one backend per worker; any new mock state must live inside the scope. The scope set is bounded (32 by default, least recently used evicted), so a leaked scope can't grow memory without limit. Local runs cap workers at a quarter of that capacity, so eviction only reaches scopes a crashed test left behind, never a live one.

Sharing one host also showed a real product bug. A busy server can send an HTTP `Date` header a second or more behind. The auth client checked session expiry against it with 1 s of slack, so it rejected fresh sessions. It now allows 5 s of server clock lag.
