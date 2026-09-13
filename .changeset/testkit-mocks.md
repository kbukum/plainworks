---
"@plainworks/std": patch
"@plainworks/testkit": patch
"@plainworks/mocks": patch
---

Add `@plainworks/testkit` and `@plainworks/mocks`, and give `@plainworks/std` one shared seeded random generator both build on.

- `@plainworks/testkit` is the shared test toolkit: a controllable clock, seeded randomness, an auth-header fake, event helpers, result assertions, and async utilities. Server-safe.
- `@plainworks/mocks` is the shared mock API used by tests and the showcase. Each call builds a fully isolated, seeded API with no shared global state, so results are reproducible. Its handlers validate inputs at the boundary and can simulate errors, and it ships as a plain API, a request-mocking server, and a dev-server plugin.
