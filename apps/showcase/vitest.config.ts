import { defineConfig } from "vitest/config"

// Smoke tests assemble the published surfaces the way a consumer does. The SSR-response and
// unified-stream scenarios run in Node; the hydration and client-navigation scenarios opt into
// jsdom per file via a `// @vitest-environment jsdom` docblock. Vite's default (oxc) automatic JSX
// runtime compiles the TSX, matching the app build.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The root gate runs every workspace test task concurrently. Keep this jsdom-heavy suite to
    // one worker so CI does not starve async rendering and axe checks under that shared load.
    maxWorkers: 1,
  },
})
