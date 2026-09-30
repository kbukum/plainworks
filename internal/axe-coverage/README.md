# @plainworks/axe-coverage

> Axe-coverage gate: every React render test file awaits the shared axe assertion and never imports axe-core directly.

Dev-only, never published. The root `check-axe-coverage` script runs it over the workspace roots:

```sh
plainworks-axe-coverage packages apps internal
```

It exits `1` and names each `*.test.tsx` that renders through `@testing-library/react` without awaiting `expectNoAxeViolations` at least once, or that imports `axe-core` instead of going through `@plainworks/testkit/client`. Generated trees (`node_modules`, `dist`, `.next`, coverage) and gate `fixtures` are skipped.

A workspace that calls it lists `@plainworks/axe-coverage` as a dev dependency and calls the `plainworks-axe-coverage` bin, never a path under `internal/`.
