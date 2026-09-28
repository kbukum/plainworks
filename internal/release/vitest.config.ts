import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Barrels re-export only; `cli.ts` and `files.ts` bind the tested command to the real process
      // and disk.
      exclude: ["src/**/*.test.ts", "src/**/index.ts", "src/cli.ts", "src/workspace/files.ts"],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
})
