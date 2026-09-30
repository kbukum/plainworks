# @plainworks/axe-coverage

> Axe-coverage gate: every React render test file awaits the shared axe assertion and never imports `axe-core` directly.

Dev-only, never published.

## Run it

The root `check-axe-coverage` script calls the bin across the workspace roots:

```sh
plainworks-axe-coverage packages apps internal
```

## What it checks

The command exits `1` and reports each `*.test.tsx` file that imports `@testing-library/react`, calls `render(...)`, and never awaits `expectNoAxeViolations(...)` at least once.

It also reports any `*.test.tsx` file that imports `axe-core` directly instead of going through `@plainworks/testkit/client`.

Generated trees (`node_modules`, `dist`, `.next`, `.bundle-analysis`, `.turbo`, `coverage`) and gate `fixtures` are skipped.

A workspace that uses the gate lists `@plainworks/axe-coverage` as a dev dependency and calls the `plainworks-axe-coverage` bin, never a path under `internal/`.
