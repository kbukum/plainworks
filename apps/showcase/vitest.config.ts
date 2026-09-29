import { appTestConfig } from "@plainworks/vitest-config"
import { mergeConfig } from "vitest/config"

// The root gate runs every workspace's tests at once. This jsdom-heavy suite keeps to one worker so
// the shared load does not starve async rendering and axe checks.
export default mergeConfig(appTestConfig(), { test: { maxWorkers: 1 } })
