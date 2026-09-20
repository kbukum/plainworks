// Public surface of the theme-studio concern — re-export-only barrel, no logic. `ModeControl` is
// the shell's quick affordance and part of the studio; `ThemeStudio` is the full surface Settings
// embeds.
export { AccentPicker, type AccentPickerProps } from "./accent-picker"
export { ModeControl, type ModeControlProps } from "./mode-control"
export { THEME_ERROR_MESSAGE } from "./theme-error"
export { ThemePreview } from "./theme-preview"
export { ThemeStudio, type ThemeStudioProps } from "./theme-studio"
