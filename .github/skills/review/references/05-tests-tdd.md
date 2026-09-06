# Pass 05 — Tests & TDD

Behavioral, deterministic tests written **test-first**. Fast AI-assisted code tends to add tests after the fact (or not at all) and to lean on real timers/network — this pass catches that.

> **Run in a separate, clean-context agent** with a high-capability model. A plan/spec may be passed in as a scope checklist only; it never excuses a baseline violation.

**Scope note.** *Changes mode:* every behavioral change in the diff must have a test that would fail without it. *Project mode:* verify coverage floors per package and sweep for non-deterministic or hand-rolled-fake patterns.

## Checks

- **Test-first, behavioral.** Each behavior has a test asserting observable behavior, not implementation detail. A behavioral change with **no test** is a blocker. A test that only re-states the implementation (mirrors the code line-for-line) is weak — flag it.
- **Failure paths covered.** Reconnect, token refresh/expiry, timeout/abort, validation rejection, and error branches are tested — not just the happy path. A new remote/stream/auth path with only a success test is a should-fix.
- **Determinism.** No real clock, network, or filesystem in unit tests. Use Vitest fake timers (`vi.useFakeTimers()` / `vi.advanceTimersByTime`) for backoff/reconnect/timeout; inject the clock rather than reading `Date.now()` directly; seed any RNG. A test that waits on a real `setTimeout` or hits a live URL is a blocker (flaky + slow).
- **Race/shuffle safe.** Tests pass under Vitest's parallel run and don't depend on order or shared mutable module state (a consequence of the no-singletons rule — each test builds its own store/client via the factory).
- **Reuse `@plainworks/testkit`.** Shared fakes/harnesses (fake transport, fake clock, auth harness) come from `testkit`, which is a **shipped product** — extend it, don't hand-roll a one-off fake inline that duplicates one. A duplicated inline fake is a should-fix; move it to `testkit`.
- **Coverage floors.** ≥ 80% per package, ≥ 85% for security-load-bearing packages (`auth`). The generated `vitest.config.ts` sets the threshold; a package that lowered its own threshold below the floor is a should-fix. Coverage is a byproduct of hardening — a test written only to hit a line, asserting nothing meaningful, is a finding, not a pass.
- **Client vs server env.** Client-package tests run under jsdom (`.test.tsx`); server-safe logic tests run under node. A DOM-dependent test in a node-env package (or vice versa) is a should-fix.

## Detection starters

```bash
rg "setTimeout\(|await new Promise\(res" packages/*/src/**/*.test.*   # real timers in tests — use fake timers
rg "http://|https://|fetch\(" packages/*/src/**/*.test.*             # live network in a unit test
rg "Date\.now\(\)|Math\.random\(\)" packages/*/src/**/*.test.*        # inject clock / seed RNG instead
rg "class Fake|const fake\w+ =|vi\.fn\(\)" packages/*/src/**/*.test.* # candidate for a shared testkit double
```

Then run the scoped tests with coverage: `turbo run test --filter=@plainworks/<name>` (each package's `test` script is `vitest run --coverage`). A green run with thin assertions is not a pass — read the tests.
