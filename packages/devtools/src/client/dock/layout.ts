import { isAbsentOr, isOneOf, isRecord } from "@plainworks/std"

/** The viewport edge the devtools dock to. The bar runs along it; the panel opens beside the bar. */
export type DevtoolsDockSide = "bottom" | "left" | "right"

/** Every dock side, in the order the side picker offers them. */
export const DEVTOOLS_DOCK_SIDES: readonly DevtoolsDockSide[] = ["bottom", "left", "right"]

/**
 * The user's dock preference, as persisted. Each axis remembers its own size, so moving between a
 * side and the bottom restores the size last chosen there. An absent size means "not chosen yet":
 * the panel then sizes itself from the viewport.
 */
export interface DevtoolsLayout {
  /** The preferred side. Narrow viewports dock at the bottom whatever this says. */
  readonly side: DevtoolsDockSide
  /** Width of a left- or right-docked panel, in CSS pixels. */
  readonly inlineSize?: number
  /** Height of a bottom-docked panel, in CSS pixels. */
  readonly blockSize?: number
}

/** What the dock needs to know about the viewport it lays out in. */
export interface DockViewport {
  /** Viewport width in CSS pixels. */
  readonly width: number
  /** Viewport height in CSS pixels. */
  readonly height: number
  /** The bar's thickness in CSS pixels; it shares the dock edge, so the panel fits beside it. */
  readonly barSize: number
  /** Whether the viewport is wide enough for a side dock; narrower ones dock at the bottom. */
  readonly sideDockFits: boolean
}

/** A layout resolved against the viewport: where the panel actually sits and how big it is. */
export interface ResolvedDock {
  /** The side in effect, after the narrow-viewport fallback. */
  readonly side: DevtoolsDockSide
  /** The axis the panel resizes along: `inline` (width) for a side dock, `block` for the bottom. */
  readonly axis: "inline" | "block"
  /** The panel size in effect, in CSS pixels, always within `min`..`max`. */
  readonly size: number
  /** Smallest panel size that keeps the inspector usable. */
  readonly min: number
  /** Largest panel size that still leaves the host a usable area. */
  readonly max: number
}

// Bounds, in CSS pixels. A panel never shrinks below a usable inspector, and never grows past the
// point where the host's own area, beside both the bar and the panel, drops below `hostReserve`.
// On a viewport too small for both, the panel minimum wins, so the inspector stays operable.
// On one too small for even that minimum beside the bar, the panel takes all the space the bar
// leaves, so no part of it is ever pushed off-screen.
const INLINE = { min: 320, fluid: 0.36, cap: 704, hostReserve: 360 } as const
const BLOCK = { min: 192, fluid: 0.55, cap: 576, hostReserve: 240 } as const

const KEYBOARD_STEP = 16
const KEYBOARD_LARGE_STEP = 64

/**
 * Resolve a preference against the viewport: apply the narrow-viewport fallback, pick the axis,
 * and clamp the size (or derive a fluid default when none was chosen).
 */
export function resolveDock(layout: DevtoolsLayout, viewport: DockViewport): ResolvedDock {
  const side = viewport.sideDockFits ? layout.side : "bottom"
  const axis = side === "bottom" ? "block" : "inline"
  const bounds = axis === "inline" ? INLINE : BLOCK
  const extent = axis === "inline" ? viewport.width : viewport.height
  const chosen = axis === "inline" ? layout.inlineSize : layout.blockSize
  const available = Math.max(0, extent - viewport.barSize)
  const min = Math.min(bounds.min, available)
  const max = Math.min(available, Math.max(min, available - bounds.hostReserve))
  const fluid = Math.max(min, Math.min(bounds.cap, Math.round(extent * bounds.fluid)))
  return { side, axis, size: clamp(chosen ?? fluid, min, max), min, max }
}

/** The layout with `size` (clamped) stored on the axis `dock` resizes along. */
export function withPanelSize(
  layout: DevtoolsLayout,
  dock: ResolvedDock,
  size: number,
): DevtoolsLayout {
  const next = clamp(size, dock.min, dock.max)
  return dock.axis === "inline" ? { ...layout, inlineSize: next } : { ...layout, blockSize: next }
}

/**
 * The panel size a splitter key moves to, or `undefined` for a key this splitter ignores. Follows
 * the WAI-ARIA window splitter pattern: the arrows along the splitter's axis move it (Shift for a
 * larger step), Home and End jump to the smallest and largest size. The arrow pointing into the
 * host grows the panel.
 */
export function keyboardPanelSize(
  dock: ResolvedDock,
  key: string,
  largeStep: boolean,
): number | undefined {
  if (key === "Home") return dock.min
  if (key === "End") return dock.max
  const direction = GROW_KEYS[dock.side][key]
  if (direction === undefined) return undefined
  const step = largeStep ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP
  return clamp(dock.size + direction * step, dock.min, dock.max)
}

const GROW_KEYS: Readonly<Record<DevtoolsDockSide, Readonly<Record<string, 1 | -1>>>> = {
  right: { ArrowLeft: 1, ArrowRight: -1 },
  left: { ArrowRight: 1, ArrowLeft: -1 },
  bottom: { ArrowUp: 1, ArrowDown: -1 },
}

/** The panel size after a drag that moved the pointer by `delta` from where `startSize` began. */
export function pointerPanelSize(
  dock: ResolvedDock,
  startSize: number,
  delta: { readonly x: number; readonly y: number },
): number {
  const growth = dock.side === "right" ? -delta.x : dock.side === "left" ? delta.x : -delta.y
  return clamp(Math.round(startSize + growth), dock.min, dock.max)
}

/**
 * Whether an untrusted value (read back from storage) is a {@link DevtoolsLayout}. Sizes must be
 * finite, non-negative numbers; out-of-range sizes are accepted and clamped on use.
 */
export function isDevtoolsLayout(value: unknown): value is DevtoolsLayout {
  if (!isRecord(value) || !isOneOf(value.side, DEVTOOLS_DOCK_SIDES)) return false
  return isAbsentOr(value.inlineSize, isSize) && isAbsentOr(value.blockSize, isSize)
}

function isSize(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
