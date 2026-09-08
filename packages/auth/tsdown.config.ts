import { preset } from "@plainworks/tsdown-config"

export default preset({
  entry: { index: "src/index.ts", server: "src/server.ts" },
})
