# @plainworks/vitest-config

Shared Vitest preset for packages, tools, apps, and the integration suite.

| Function | Use |
|---|---|
| `testConfig({ include?, coverage? })` | Packages and tools. It runs in `node`, resolves the `@plainworks/source` condition, collects colocated `src/**/*.test.{ts,tsx}`, and enforces the 80% coverage floor. |
| `appTestConfig({ include? })` | Apps and `internal/integration`. It resolves built `dist` package surfaces and does not enforce package coverage. |

A workspace overrides only what it needs, and each override gets a short comment. Security-load-bearing packages raise coverage thresholds; no package lowers the default floor.
