// Public `./browser` entry for `@plainworks/testkit`: the shared Playwright gate every reference
// host drives, the checks it runs, the flow engine, change review, and `ui:check`. Re-export-only
// barrel. It runs in the Playwright test runner, so its peers (`@playwright/test`,
// `@axe-core/playwright`) are optional and only this subpath loads them.
export * from "./checks"
export * from "./flow"
export type {
  BrowserGateFixtures,
  BrowserGateOptions,
  BrowserGateStorageState,
  BrowserGateTest,
  BrowserGateWorkerFixtures,
} from "./gate"
export {
  BROWSER_GATE_NOW,
  browserGateScreenshot,
  browserGateUse,
  createBrowserGate,
  FIXED_NOW_ENV,
  GATE_ORIGIN_ENV,
} from "./gate"
export type { BrowserGateHost } from "./host"
export * from "./review"
// Closed-off surface gate, retired in the migrate-and-retire step. Kept only for the app specs and
// `create-plainworks` template that still drive it; no engine module imports it.
export * from "./surface-gate"
export * from "./ui-check"
