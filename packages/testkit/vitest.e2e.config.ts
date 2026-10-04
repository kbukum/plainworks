import { defineConfig } from "vitest/config"

// The gate self-test drives real Chromium through the Playwright runner, so it runs apart from the
// unit suite, where browsers are absent.
export default defineConfig({ test: { include: ["test/gate/gate.test.ts"] } })
