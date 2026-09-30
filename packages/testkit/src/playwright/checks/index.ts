// The checks a browser test or flow runs on a live page. Each check returns findings, which the
// flow engine turns into its verdict; the `expectPage*` assertions throw on those same findings for
// a single moment a flow does not reach. Re-export-only barrel.
export { settleAnimations } from "./animation"
export {
  expectNoPageAxeViolations,
  expectPageFocusVisible,
  expectPageHydrated,
  expectPageReflow,
} from "./assertions"
export type { AxeViolationSummary, BrowserAxeOptions } from "./axe"
export { BROWSER_AXE_TAGS, formatAxeViolations, scanBrowserAxe } from "./axe"
export type { Allowance, AllowedFinding, CheckId, Finding, JudgedFindings } from "./findings"
export { applyAllowances, CHECK_IDS, capFindingsPerCheck } from "./findings"
export { findFocusProblems, focusWithKeyboard, pressWithKeyboard } from "./focus"
export type {
  FocusableFact,
  ImageFact,
  LayoutBox,
  LayoutFacts,
  TargetFact,
  TextFact,
  TrackedBox,
} from "./heuristics"
export {
  judgeBrokenImages,
  judgeClippedText,
  judgeLayout,
  judgeLayoutShift,
  judgeObscuredFocusables,
  judgeOverlappingTargets,
} from "./heuristics"
export { waitForHydration } from "./hydration"
export { findOverlaysOutsideViewport, horizontalOverflow } from "./layout"
export { measureLayoutFacts } from "./layout-facts"
export type { RuntimeError, RuntimeErrorKind, RuntimeErrorWatch } from "./runtime-errors"
