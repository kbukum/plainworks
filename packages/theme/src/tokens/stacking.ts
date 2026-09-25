/**
 * The stacking layers, lowest first. Use a layer instead of a raw `z-index`, so floating UI stacks
 * the same way everywhere: a popover opened from a dialog sits above it, and a toast sits above
 * both.
 */
export const STACKING_LAYERS = ["sticky", "overlay", "popover", "toast"] as const

export type StackingLayer = (typeof STACKING_LAYERS)[number]
