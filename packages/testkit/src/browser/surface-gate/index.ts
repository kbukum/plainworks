// The closed-off surface gate: the retiring committed-pixel-baseline model (declarative
// `VisualSurface` screenshots over a mode × viewport matrix, and the throwing check wrappers the
// app functional specs still call). Superseded by the flow engine and slated for deletion in the
// migrate-and-retire step. No engine module imports it; it only re-exports finding forms downward.
// Re-export-only barrel.
export {
  expectFocusVisible,
  expectHydrated,
  expectNoBrowserAxeViolations,
  expectNoHorizontalOverflow,
  expectOverlaysInViewport,
  expectReflowAtNarrowViewport,
} from "./assertions"
export type { ColorMode, ViewportName, VisualMatrix, VisualVariant } from "./matrix"
export { COMPACT_MATRIX, DIALOG_MATRIX, FULL_MATRIX } from "./matrix"
export type {
  PlannedVisualTest,
  VisualChecks,
  VisualSurface,
  VisualTestFixtures,
} from "./surface"
export { planVisualTests, runVisualTest, VISUAL_TAG } from "./surface"
