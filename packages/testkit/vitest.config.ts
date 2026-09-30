import { testConfig } from "@plainworks/vitest-config"

// Generated protobuf output is vendored code. The browser modules below drive a live Playwright
// page, which Vitest cannot host; their pure parts keep unit tests, and both reference hosts'
// browser suites run them end to end.
export default testConfig({
  coverage: {
    exclude: [
      "src/connect/gen/**",
      "src/playwright/gate.ts",
      "src/playwright/checks/{animation,axe,focus,layout,layout-facts}.ts",
      "src/playwright/flow/{page-session,runner}.ts",
      "src/playwright/ui-capture/node-runtime.ts",
    ],
  },
})
