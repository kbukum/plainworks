# @plainworks/shape

Dev-only, never published. The workspace-shape gate keeps every workspace on one generated profile, so manifests, tsconfig wiring, build declarations, and Vitest presets stay derived from source instead of drifting by hand.

## Common commands

```bash
bun run check-shape
bun run sync-shape
plainworks-shape check
plainworks-shape sync packages/std internal/comment-format
```

## Profiles

| Profile | Workspaces | Contract |
|---|---|---|
| **package** | `packages/*` and built private packages such as `internal/demo` | `tsdown.config.ts` exports `build: PackageBuild`; the manifest derives `exports`, `files`, `sideEffects`, scripts, and preset dev dependencies. |
| **cli** | `create-plainworks` | A published command package with a bin build and packaging checks. |
| **tool** | dev-only `internal/*` tools | Source lives under `src/`, tests are colocated, optional `src/cli.ts` exposes bin `plainworks-<dirname>` and starts with `#!/usr/bin/env -S bun --conditions=@plainworks/source`, optional `src/index.ts` exposes `.`, `tsconfig.json` extends `../../tsconfig.tool.json`, and no non-config root code or `test/` directory is allowed. |
| **app** | `apps/*` and `internal/integration` | `tsconfig.json` extends `../../tsconfig.app.json`, tests use `appTestConfig`, and package tasks run against built package surfaces. |

`check` inspects each workspace's manifest, tsconfig files, Vitest config, and, for built workspaces, the `build` export from `tsdown.config.ts`. It loads the Vitest config a workspace actually exports, not just the import line.

Packages and tools must resolve source and hold v8 coverage at 80% or above on every metric. Apps and `internal/integration` must resolve built `dist` package surfaces.

`sync` rewrites only generated manifest fields. If it changes a file, keep the generated shape and update the source of truth that drove it: the build description, source files, tsconfig shape, or generator template.
