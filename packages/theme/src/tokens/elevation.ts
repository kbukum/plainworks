/**
 * The elevation levels: `raised` lifts content off its surface (cards, sticky bars) and `overlay`
 * separates floating layers (menus, dialogs, toasts). Dark mode uses stronger shadows to stay
 * visible.
 */
export const ELEVATION_LEVELS = ["raised", "overlay"] as const

export type ElevationLevel = (typeof ELEVATION_LEVELS)[number]
