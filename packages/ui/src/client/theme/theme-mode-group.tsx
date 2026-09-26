"use client"

import { ToggleGroup, ToggleGroupItem } from "@plainworks/elements/toggle-group"
import { cn } from "@plainworks/theme"
import { useTheme } from "@plainworks/theme/client"
import type { ReactElement } from "react"
import {
  defaultThemeModeLabels,
  THEME_MODES,
  type ThemeModeIcons,
  type ThemeModeLabels,
  toThemeMode,
} from "./theme-mode-options"

/** Props for {@link ThemeModeGroup}. */
export interface ThemeModeGroupProps {
  /** Overrides for any subset of the copy. */
  readonly labels?: Partial<ThemeModeLabels>
  /** Per-mode icons shown beside each label. */
  readonly icons?: ThemeModeIcons
  /** Announce a failed save below the group. Turn off when the page already announces it. */
  readonly announceError?: boolean
  readonly className?: string
}

/**
 * A segmented light / dark / system control for a settings page. It reads and writes the same
 * theme context as `ThemeModeMenu`, so the two can never disagree. Pressing the active option again
 * keeps it selected, so a mode is always chosen.
 */
export function ThemeModeGroup({
  labels,
  icons,
  announceError = true,
  className,
}: ThemeModeGroupProps): ReactElement {
  const copy = { ...defaultThemeModeLabels, ...labels }
  const { theme, setTheme, error } = useTheme()

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ToggleGroup
        aria-label={copy.label}
        variant="outline"
        value={[theme.mode]}
        onValueChange={(values) => {
          const mode = toThemeMode(values[0])
          if (mode !== undefined && mode !== theme.mode) {
            // The provider keeps the typed failure on `error`, announced below.
            setTheme({ ...theme, mode }).catch(() => undefined)
          }
        }}
        className="max-w-full flex-wrap"
      >
        {THEME_MODES.map((mode) => (
          <ToggleGroupItem key={mode} value={mode} className="gap-2">
            {icons?.[mode]}
            {copy[mode]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {!announceError || error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {copy.error}
        </p>
      )}
    </div>
  )
}
