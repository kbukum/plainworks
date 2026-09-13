---
"@plainworks/mocks": patch
---

Add a paired mock-server helper to `@plainworks/mocks` and align its page envelope with the shared list contract.

- One call builds a seeded mock API and its request-mocking server together, so a cross-package test gets both — the server to intercept the network, and the API to inspect or reset between cases. The test still controls the server's start and stop.
- The mock's page envelope now uses the shared type from `@plainworks/std`, so what the mock returns can never drift from what a consumer expects to decode.
