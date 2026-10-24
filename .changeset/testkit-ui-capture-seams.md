---
"@plainworks/testkit": minor
---

`@bufbuild/protovalidate` is now an optional peer dependency, needed only by the `./connect` subpath. Projects that use `@plainworks/testkit/connect` must add it themselves. `ui:capture` keeps the run's own failure when closing its browser or cleaning up a base worktree also fails, and its base capture logic now runs behind an injected seam with full unit coverage.
