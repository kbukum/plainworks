import { preset } from "@plainworks/tsdown-config"

export default preset({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
  },
  copy: [
    { from: "src/styles.css", to: "dist" },
    { from: "src/tokens.css", to: "dist" },
  ],
})
