import { preset } from "@plainworks/tsdown-config"

export default preset({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    query: "src/adapters/query/index.ts",
    state: "src/adapters/state/index.ts",
  },
  // tsdown has no CSS pipeline, so the Tailwind-source stylesheet is copied verbatim into `dist`;
  // the `./styles.css` export resolves from the build output the packaging gate covers.
  copy: [{ from: "src/styles.css", to: "dist" }],
})
