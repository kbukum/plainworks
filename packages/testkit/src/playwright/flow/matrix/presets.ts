import { type FlowMode, PREFERENCE_IDS, type PreferenceId } from "./axes"
import { DEVICE_IDS, type DeviceId } from "./devices"

/**
 * Which values of a host-defined theme axis to use: its `default` value only, `all` of them, or a
 * named list.
 */
export type ThemeAxisSelection = "default" | "all" | readonly string[]

/**
 * The matrix a flow runs over. Devices are context-level, so each one replays the flow; every
 * other axis is page-level and switches at each checkpoint on the live page. `pairwise` samples
 * the axes so every two values meet at least once, instead of crossing them all.
 */
export interface MatrixSpec {
  readonly devices: readonly DeviceId[]
  readonly modes: readonly FlowMode[]
  readonly themes: ThemeAxisSelection
  readonly densities: ThemeAxisSelection
  readonly preferences: readonly PreferenceId[]
  readonly sampling: "all" | "pairwise"
}

/**
 * The named matrices. `quick` is the default and stays small enough for every change. The others
 * widen one concern each: `devices` every device profile, `themes` every brand theme and density
 * in both modes, `a11y` every user preference, and `full` everything, sampled pairwise.
 */
export const MATRIX_PRESETS: {
  readonly quick: MatrixSpec
  readonly devices: MatrixSpec
  readonly themes: MatrixSpec
  readonly a11y: MatrixSpec
  readonly full: MatrixSpec
} = {
  quick: {
    devices: ["desktop", "mobile"],
    modes: ["light", "dark"],
    themes: "default",
    densities: "default",
    preferences: ["standard"],
    sampling: "all",
  },
  devices: {
    devices: DEVICE_IDS,
    modes: ["light"],
    themes: "default",
    densities: "default",
    preferences: ["standard"],
    sampling: "all",
  },
  themes: {
    devices: ["desktop"],
    modes: ["light", "dark"],
    themes: "all",
    densities: "all",
    preferences: ["standard"],
    sampling: "pairwise",
  },
  a11y: {
    devices: ["desktop", "mobile"],
    modes: ["light", "dark"],
    themes: "default",
    densities: "default",
    preferences: PREFERENCE_IDS,
    sampling: "pairwise",
  },
  full: {
    devices: DEVICE_IDS,
    modes: ["light", "dark"],
    themes: "all",
    densities: "all",
    preferences: PREFERENCE_IDS,
    sampling: "pairwise",
  },
}

/** The name of one {@link MATRIX_PRESETS} entry. */
export type MatrixPresetName = keyof typeof MATRIX_PRESETS

/** The preset a run uses when it names none. */
export const DEFAULT_MATRIX_PRESET: MatrixPresetName = "quick"
