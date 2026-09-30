# @plainworks/vitest-config

Dev-only, never published. `@plainworks/vitest-config` supplies the shared Vitest presets for packages, tools, apps, and the integration suite.

## Choose a preset

| Function | Use |
|---|---|
| `testConfig({ include?, coverage? })` | Packages and tools. It runs in `node`, resolves `@plainworks/*` through the `@plainworks/source` condition, collects colocated `src/**/*.test.{ts,tsx}`, sets the shared 15 s timeout, and enforces the shared v8 coverage floor. |
| `appTestConfig({ include? })` | Apps and `internal/integration`. It also runs in `node`, collects the same test globs, resolves built `dist` package surfaces, and does not enforce the package coverage floor. |

A workspace overrides only what it needs, and each override gets a short comment. Security-load-bearing packages such as `auth` raise the coverage threshold; no workspace can lower the shared 80% floor.
