// Change review: what a run changed against a base run, as pixel and ARIA diffs, plus contact
// sheets that show every variant of a checkpoint at once. Re-export-only barrel.
export type { AriaDiff, AriaDiffOptions } from "./aria-diff"
export { diffAriaSnapshots } from "./aria-diff"
export type { ReviewChangesOptions, ReviewedRun } from "./compare"
export { reviewChanges } from "./compare"
export type { FrameDiff, FrameDiffOptions } from "./frame-diff"
export { diffFrames } from "./frame-diff"
export type { ContactSheetOptions, SheetRenderer, SheetTarget } from "./sheets"
export { writeContactSheets } from "./sheets"
