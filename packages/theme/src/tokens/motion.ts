/**
 * The motion durations. All collapse to `0ms` when the user prefers reduced motion, so motion built
 * on them needs no extra media query.
 */
export const MOTION_DURATIONS = ["fast", "base", "slow"] as const

export type MotionDuration = (typeof MOTION_DURATIONS)[number]

/** The easing curves: `standard` for movement on screen, `enter` and `exit` for appearing content. */
export const MOTION_EASINGS = ["standard", "enter", "exit"] as const

export type MotionEasing = (typeof MOTION_EASINGS)[number]
