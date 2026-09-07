import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Fixtures under test/fixtures are inputs to the cruiser, not test suites. Some intentionally
    // carry a `.test.ts` name (they exercise the test-file boundary exception), so exclude the
    // whole fixtures tree from collection or vitest would try to run them as suites.
    exclude: ["test/fixtures/**"],
  },
})
