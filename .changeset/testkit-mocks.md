---
"@plainworks/std": patch
"@plainworks/testkit": patch
"@plainworks/mocks": patch
---

Add `@plainworks/testkit` and `@plainworks/mocks` (L4), and extend `@plainworks/std` (L0) with `createSeededRandom`/`RandomSource` — the single canonical seeded PRNG both L4 packages build on.

`@plainworks/testkit` is the shared, host-independent test toolkit: a `manualClock` (deterministic `Clock` seam control), a seeded `seededRandom` (mulberry32), a `fakeAuthHeaderProvider` for the header-only auth seam, in-memory event `createEmitter`/`recordEvents` helpers (duplicate subscriptions tracked independently), `Result` assertions (`expectOk`/`expectErr`), and async utilities (`deferred`, bounded-drain `flushMicrotasks`). Server-safe only.

`@plainworks/mocks` ships the shared MSW mock API used by tests and the showcase. `createMockApi({ seed })` builds one fully isolated graph per call — seeded fixture content (reproducible, no `Math.random`), per-server stores/settings/latency/control state with no module-level state or import-time side effects — and the server-safe `.` entry is an explicit, minimal surface. CRUD handlers validate query params and bodies at the boundary (400 on malformed input, immutable ids protected), boolean/numeric filters coerce query strings, `like`/`ilike` escape regex metacharacters, and the `/mock/error` toggle gates every API request. Entries split into a server-safe `.`, a `msw/node` server (`./server`), and Vite middleware (`./vite-plugin`: bounded request bodies, terminal unmatched responses).
