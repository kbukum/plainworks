import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  // A DOM-only package: its client provider applies the theme to the browser document. `index` is
  // the prelude (`cn`, `ThemeError`); each concern is its own subpath.
  dom: true,
  entry: {
    index: "src/index.ts",
    preference: "src/preference/index.ts",
    tokens: "src/tokens/index.ts",
    client: "src/client.ts",
  },
  assets: {
    "styles.css": { from: "src/styles.css" },
    "tokens.css": { from: "src/tokens.css" },
  },
}

export default preset(build)
