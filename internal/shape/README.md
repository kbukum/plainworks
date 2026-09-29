# @plainworks/shape

The workspace-shape gate. It keeps every workspace on one generated profile, so manifests stay derived from source instead of hand-maintained.

## Commands

```bash
bun run check-shape
bun run sync-shape
plainworks-shape sync packages/std internal/comment-format
```

## Profiles

| Profile | Workspaces | Contract |
|---|---|---|
| **package** | `packages/*` and built private packages such as `internal/demo` | `tsdown.config.ts` exports `build: PackageBuild`; the manifest derives `exports`, `files`, `sideEffects`, scripts, and preset dev dependencies. |
| **cli** | `create-plainworks` | A published command package with a bin build and packaging checks. |
| **tool** | dev-only `internal/*` tools | Source lives under `src/`, tests are colocated, optional `src/cli.ts` exposes bin `plainworks-<dirname>` and starts with `#!/usr/bin/env -S bun --conditions=@plainworks/source`, optional `src/index.ts` exposes `.`, and `tsconfig.json` extends `../../tsconfig.tool.json`. |
| **app** | `apps/*` and `internal/integration` | `tsconfig.json` extends `../../tsconfig.app.json`, tests use `appTestConfig`, and package tasks run against built package surfaces. |

`check` also loads each `vitest.config.ts` and checks the config it exports, not just its import. Packages and tools must resolve source and hold v8 coverage at 80% or above on every metric. Apps must resolve `dist`.

`sync` rewrites only generated manifest fields. If it changes a file, keep the shape and update the source of truth that drove it: the build description, source files, tsconfig shape, or generator template.
