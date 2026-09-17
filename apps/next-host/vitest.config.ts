import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Smoke tests assemble the published surfaces the way a consumer does. The server-side scenarios
// (auth flow, mock-backend dispatch, neutral theme/read helpers) run in Node; the client scenarios
// (account gate, task list, app-shell navigation) opt into jsdom per file via a
// `// @vitest-environment jsdom` docblock. The app's tsconfig sets `jsx: preserve` for Next's SWC
// compiler; overriding Vite's oxc transform to the automatic runtime is what compiles the TSX here.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  // Every `src/server` module keeps its enforced `import "server-only"` tripwire; under Node that
  // marker throws on import, so tests resolve it to an empty stub instead. The build-time boundary
  // stays real — only the test run swaps the poison for a no-op.
  resolve: {
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./test/server-only.stub.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
