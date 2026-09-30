// The flow matrix: device profiles (context-level), page-level axes, presets, and the expansion
// into one plan per device. Re-export-only barrel.
export type {
  FlowMode,
  PageVariant,
  PreferenceEmulation,
  PreferenceId,
  ThemeAxes,
  ThemeRoot,
} from "./axes"
export {
  defineThemeAxes,
  FLOW_MODES,
  MODE_ONLY_THEME_AXES,
  PREFERENCE_IDS,
  PREFERENCES,
  pageVariant,
} from "./axes"
export type { DeviceContextOptions, DeviceId, DeviceProfile, ViewportSize } from "./devices"
export { DEVICE_IDS, DEVICE_PROFILES, deviceContextOptions } from "./devices"
export type { DevicePlan } from "./expand"
export { expandFlowMatrix } from "./expand"
export { samplePairwise } from "./pairwise"
export type { MatrixPresetName, MatrixSpec, ThemeAxisSelection } from "./presets"
export { DEFAULT_MATRIX_PRESET, MATRIX_PRESETS } from "./presets"
