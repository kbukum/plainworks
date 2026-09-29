import { fileURLToPath } from "node:url"
import { appTestConfig } from "@plainworks/vitest-config"
import { mergeConfig } from "vitest/config"

export default mergeConfig(appTestConfig(), {
  // Next compiles JSX with SWC, so the app's tsconfig preserves it; the tests compile it with
  // Vite's automatic runtime instead.
  oxc: { jsx: { runtime: "automatic" } },
  // Every `src/server` module imports `server-only`, which throws outside a Next server build.
  // Tests resolve it to an empty stub; the build-time boundary stays real.
  resolve: {
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./test/server-only.stub.ts", import.meta.url)),
      },
    ],
  },
})
