/** The color modes every visual surface can be captured in. */
export const COLOR_MODES: readonly ["light", "dark"] = ["light", "dark"]

/** One color mode of {@link COLOR_MODES}. */
export type ColorMode = (typeof COLOR_MODES)[number]

/** A viewport size in CSS pixels. */
export interface ViewportSize {
  readonly width: number
  readonly height: number
}

/**
 * The named viewports the gate captures. `tablet` sits on the common 768 px breakpoint, and
 * `reflow` is the WCAG 1.4.10 target: 320 CSS px, the width of a 1280 px screen at 400% zoom.
 * `landscape` is a phone turned sideways, the shortest common screen, where a tall dialog must
 * scroll instead of running off the top and bottom.
 */
export const GATE_VIEWPORTS: {
  readonly desktop: ViewportSize
  readonly tablet: ViewportSize
  readonly mobile: ViewportSize
  readonly reflow: ViewportSize
  readonly landscape: ViewportSize
} = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
  reflow: { width: 320, height: 640 },
  landscape: { width: 844, height: 390 },
}

/** The name of one {@link GATE_VIEWPORTS} entry. */
export type ViewportName = keyof typeof GATE_VIEWPORTS

/** The modes and viewports one surface is captured in. */
export interface VisualMatrix {
  readonly modes: readonly ColorMode[]
  readonly viewports: readonly ViewportName[]
}

/** Every mode at every viewport: the matrix for routed pages. */
export const FULL_MATRIX: VisualMatrix = {
  modes: COLOR_MODES,
  viewports: ["desktop", "tablet", "mobile", "reflow"],
}

/** Every mode at the widest and the narrowest common layouts: the matrix for overlays and states. */
export const COMPACT_MATRIX: VisualMatrix = {
  modes: COLOR_MODES,
  viewports: ["desktop", "mobile"],
}

/** The compact matrix plus a short landscape screen: the matrix for dialogs and sheets. */
export const DIALOG_MATRIX: VisualMatrix = {
  modes: COLOR_MODES,
  viewports: ["desktop", "mobile", "landscape"],
}

/** One cell of a {@link VisualMatrix}. */
export interface VisualVariant {
  /** `mode-viewport`, used in test titles and screenshot names. */
  readonly id: `${ColorMode}-${ViewportName}`
  readonly mode: ColorMode
  readonly viewport: ViewportName
  readonly size: ViewportSize
}

/**
 * Cross every mode with every viewport, in declaration order and without duplicates. Throws
 * {@link RangeError} for an empty axis, which would declare a surface with no coverage at all.
 */
export function expandMatrix(matrix: VisualMatrix): VisualVariant[] {
  const modes = [...new Set(matrix.modes)]
  const viewports = [...new Set(matrix.viewports)]
  if (modes.length === 0 || viewports.length === 0) {
    throw new RangeError("A visual matrix needs at least one mode and one viewport")
  }
  return modes.flatMap((mode) =>
    viewports.map((viewport) => ({
      id: `${mode}-${viewport}` as const,
      mode,
      viewport,
      size: GATE_VIEWPORTS[viewport],
    })),
  )
}
