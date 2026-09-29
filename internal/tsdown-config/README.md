# @plainworks/tsdown-config

Shared tsdown preset for built workspaces. A package declares one typed build description, and the build preset plus shape tool derive the rest.

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

Add a public subpath by adding an entry to `build.entry`, then run `bun run sync-shape`. Do not hand-edit package `exports`, `files`, `sideEffects`, or standard scripts.

Packages ship `dist` plus `src` (tests excluded) so JavaScript and declaration source maps point at TypeScript source. Command packages use `cliPreset` and ship bundled `dist` bins.
