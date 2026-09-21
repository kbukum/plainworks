"use client"

import { createScopedObject } from "@plainworks/state/client"
import { persistentScope } from "@plainworks/state/client/scope"
import { isOneOf, type StandardSchemaV1 } from "@plainworks/std"
import { MOTION_VALUES, type MotionPreference } from "./settings-fields"

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
      isOneOf(value, MOTION_VALUES)
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
  if (isOneOf(oldValue, MOTION_VALUES)) {
    return oldValue
  }
  throw new Error("Unmigratable motion preference.")
}

/** The current persisted schema version for the motion preference. */
export const MOTION_PREFERENCE_VERSION = 3

/**
 * The device-local preferences surface — one versioned, validated field in the persistent scope.
 * Built once at module load (a factory, not a store), it is safe to mount per request: its
 * `Provider` owns the per-mount backend and mirror, seeding from `initial` on the server and
 * reconciling with the stored value on the client with no hydration flash.
 */
export const useLocalPreferences = createScopedObject<{ motion: MotionPreference }>({
  namespace: "showcase",
  fields: {
    motion: {
      scope: persistentScope,
      initial: "system",
      key: "motion-preference",
      schema: motionSchema,
      versioning: { version: MOTION_PREFERENCE_VERSION, migrate: migrateMotionPreference },
    },
  },
})
