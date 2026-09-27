// Public `./browser` entry for `@plainworks/testkit`: the shared Playwright gate every reference
// host drives. Re-export-only barrel. It runs in the Playwright test runner, so its peers
// (`@playwright/test`, `@axe-core/playwright`) are optional and only this subpath loads them.
export { settleAnimations } from "./animation"
export type { BrowserAxeOptions } from "./axe"
export { expectNoBrowserAxeViolations } from "./axe"
export type { VisualCapture } from "./capture"
export { expectFocusVisible, pressWithKeyboard } from "./focus"
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
} from "./gate"
export type { BrowserGateHost } from "./host"
export { expectHydrated } from "./hydration"
export {
  expectNoHorizontalOverflow,
  expectOverlaysInViewport,
  expectReflowAtNarrowViewport,
  horizontalOverflow,
} from "./layout"
export type { ColorMode, ViewportName, ViewportSize, VisualMatrix, VisualVariant } from "./matrix"
export { COMPACT_MATRIX, DIALOG_MATRIX, FULL_MATRIX } from "./matrix"
export type { RuntimeError, RuntimeErrorKind, RuntimeErrorWatch } from "./runtime-errors"
export type {
  PlannedVisualTest,
  VisualChecks,
  VisualSurface,
  VisualTestFixtures,
} from "./surface"
export { planVisualTests, runVisualTest, VISUAL_TAG } from "./surface"
