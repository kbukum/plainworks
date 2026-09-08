import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Integration tests assemble the neutral, server-safe surfaces plus the msw/node mock service,
    // so they run in Node — no DOM. A scenario that renders UI would opt into jsdom per file.
    // Concern folders live directly under the package (no `test/` layer), one scenario per file.
    environment: "node",
    include: ["*/**/*.test.ts", "*/**/*.test.tsx"],
  },
})
