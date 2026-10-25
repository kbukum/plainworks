---
"@plainworks/mocks": minor
"@plainworks/testkit": minor
"@plainworks/auth": patch
---

Let one browser-gate host serve every worker, with each test's data kept in its own scope.

- **Mock data scopes** — the new `@plainworks/mocks/scope` keeps one mock instance per scope, named by the `plainworks-mock-scope` request header, with a bounded least-recently-used set. A malformed scope gets a `400` problem, never shared data. The control client's `releaseScope()` drops a scope through `DELETE /mock/scope`.
- **Mock IdP sign-ins never run out** — a new refresh grant now evicts the oldest one when 128 are live, instead of refusing the sign-in.
- **Shared gate host** — `createBrowserGate` takes a `dataScope` that sends a per-test scope header on every request and releases the scope after the test. `setupSharedGateHost` starts one host for the whole run from `globalSetup`. `PLAINWORKS_GATE_ORIGIN` with a `dataScope` can serve several workers.
- **Auth tolerates a lagging server clock** — the browser session store now allows the server's `Date` header to lag by up to 5 s, so a busy server no longer makes the client drop a fresh session.
