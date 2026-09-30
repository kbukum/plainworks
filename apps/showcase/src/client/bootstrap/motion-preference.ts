"use client"

import { jsonSerializer } from "@plainworks/state"
import { persistentScope } from "@plainworks/state/web-storage"
import type { StandardSchemaV1, StateSource } from "@plainworks/std/seam"
import { isMotionPreference, type MotionPreference } from "@plainworks/theme/preference"

// The one genuinely device-local UI preference the hub owns: how much motion to show. Unlike the
// account settings (which live on the server), this belongs to the browser it was chosen in, so it
// lives in the `@plainworks/state` persistent scope — versioned, so a shape change upgrades an old
// payload instead of discarding it. The theme (mode + accent) is owned by the theme seam and is not
// duplicated here.

const motionSchema: StandardSchemaV1<unknown, MotionPreference> = {
  "~standard": {
    version: 1,
    vendor: "showcase",
    validate: (value) =>
      isMotionPreference(value)
        ? { value }
        : { issues: [{ message: "unknown motion preference" }] },
  },
}

/**
 * Upgrade an older persisted motion payload to the current choices. The first shipped version
 * stored a plain `reduceMotion` boolean; a stored `true` becomes `"reduce"` and `false` becomes
 * `"system"`. The former `"full"` choice now becomes `"system"` because both respected the device
 * preference. An already-current value passes through; anything else throws.
 */
export function migrateMotionPreference(oldValue: unknown): MotionPreference {
  if (typeof oldValue === "boolean") {
    return oldValue ? "reduce" : "system"
  }
  if (oldValue === "full") {
    return "system"
  }
  if (isMotionPreference(oldValue)) {
    return oldValue
  }
  throw new Error("Unmigratable motion preference.")
}

/** The current persisted schema version for the motion preference. */
export const MOTION_PREFERENCE_VERSION = 3

/**
 * Build the motion choice's backing {@link StateSource} in the persistent scope. The motion
 * capability reads and writes through it. Host access is deferred to the first read, so building it
 * during SSR touches no `localStorage`.
 */
export function createMotionSource(): StateSource<MotionPreference> {
  return persistentScope.createSource<MotionPreference>({
    key: "showcase:motion-preference",
    serializer: jsonSerializer<MotionPreference>(),
    schema: motionSchema,
    versioning: { version: MOTION_PREFERENCE_VERSION, migrate: migrateMotionPreference },
  })
}
