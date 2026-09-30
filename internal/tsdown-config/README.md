# @plainworks/tsdown-config

Dev-only, never published. `@plainworks/tsdown-config` is the shared tsdown preset for built workspaces. A package declares one typed build description, and the preset plus `@plainworks/shape` derive the rest.

## Package quickstart

```ts
import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
  },
}

export default preset(build)
```

Add a public subpath by adding an entry to `build.entry`, then run `bun run sync-shape`. Do not hand-edit package `exports`, `files`, `sideEffects`, or the standard scripts.

Packages build ESM only, keep the source module graph 1:1 in `dist`, emit declaration source maps, and externalize React plus every `@plainworks/*` dependency. They ship `dist` plus `src` (tests excluded) so JavaScript and declaration source maps point at real TypeScript source.

For published command packages, use `cliPreset` instead. It emits ESM bins into `dist`, keeps source maps, and skips declaration output because commands are not importable surfaces.
