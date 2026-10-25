import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// `index` is the neutral link policy; `markdown` is the DOM renderer.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    markdown: "src/client/markdown.tsx",
  },
  dom: true,
  // tsdown has no CSS pipeline, so the Tailwind-source stylesheet is copied verbatim.
  assets: { "styles.css": { from: "src/styles.css" } },
}

export default preset(build)
