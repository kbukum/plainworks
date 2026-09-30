import { isOneOf } from "@plainworks/std"

/**
 * How much motion the user wants. `system` follows the device's `prefers-reduced-motion`; `reduce`
 * stops motion whatever the device says. The theme stylesheet reads the choice from `data-motion`
 * on the document root.
 */
export const MOTION_PREFERENCES = ["system", "reduce"] as const

export type MotionPreference = (typeof MOTION_PREFERENCES)[number]

export const DEFAULT_MOTION: MotionPreference = "system"

/** Narrow an untrusted value, such as a stored preference, to a {@link MotionPreference}. */
export function isMotionPreference(value: unknown): value is MotionPreference {
  return isOneOf(value, MOTION_PREFERENCES)
}

/** Coerce an untrusted value to a {@link MotionPreference}, falling back when it is not one. */
export function motionPreferenceOf(
  value: unknown,
  fallback: MotionPreference = DEFAULT_MOTION,
): MotionPreference {
  return isMotionPreference(value) ? value : fallback
}
