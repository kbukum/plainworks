import type { ThemeMode } from "@plainworks/theme/preference"
import type { ReactNode } from "react"

/** Every user-facing string of the color-mode controls, injected so they ship no fixed copy. */
export interface ThemeModeLabels {
  /** Names the control, e.g. `"Color mode"`. */
  readonly label: string
  readonly light: string
  readonly dark: string
  readonly system: string
  /** Announced when the preference cannot be saved. Never the underlying error message. */
  readonly error: string
}

/** Icon slots per mode, injected so the controls never import an icon library. */
export type ThemeModeIcons = Partial<Record<ThemeMode, ReactNode>>

/** English defaults for every {@link ThemeModeLabels} field. */
export const defaultThemeModeLabels: ThemeModeLabels = {
  label: "Color mode",
  light: "Light",
  dark: "Dark",
  system: "System",
  error: "The color mode could not be changed. Try again.",
}

/**
 * The selectable modes, in display order. `system` is a peer choice, not a fallback, so the stored
 * mode (never the resolved light/dark) drives the selection.
 */
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"]

/** Narrow an untrusted control value to a {@link ThemeMode}. */
export function toThemeMode(value: unknown): ThemeMode | undefined {
  return THEME_MODES.find((mode) => mode === value)
}
