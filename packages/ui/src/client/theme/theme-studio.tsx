"use client"

import { cn } from "@plainworks/theme"
import { useTheme } from "@plainworks/theme/client"
import { type ReactElement, type ReactNode, useId } from "react"
import { AccentPicker, type AccentPickerLabelOverrides } from "./accent-picker"
import { ThemeModeGroup } from "./theme-mode-group"
import type { ThemeModeIcons, ThemeModeLabels } from "./theme-mode-options"
import { ThemePreview } from "./theme-preview"

/** Every user-facing string the {@link ThemeStudio} renders itself. */
export interface ThemeStudioLabels {
  readonly heading: string
  readonly description: string
  /** Heads the color-mode choice. */
  readonly mode: string
  /** Heads the accent choice. */
  readonly accent: string
  /** Announced once when the theme cannot be loaded or saved. */
  readonly error: string
}

/** English defaults for every {@link ThemeStudioLabels} field. */
export const defaultThemeStudioLabels: ThemeStudioLabels = {
  heading: "Appearance",
  description: "Choose a color mode and accent. Changes apply instantly and are remembered.",
  mode: "Mode",
  accent: "Accent",
  error: "Theme preferences could not be loaded or saved. Try again.",
}

/** Props for {@link ThemeStudio}. */
export interface ThemeStudioProps {
  readonly labels?: Partial<ThemeStudioLabels>
  /** Copy for the color-mode group. */
  readonly modeLabels?: Partial<ThemeModeLabels>
  /** Copy for the accent picker. */
  readonly accentLabels?: AccentPickerLabelOverrides
  /** Per-mode icons for the color-mode group. */
  readonly icons?: ThemeModeIcons
  /** What sits beside the controls. Defaults to a {@link ThemePreview}; pass `null` for none. */
  readonly preview?: ReactNode
  /** Announce a failure here. Turn off when the page already announces it. */
  readonly announceError?: boolean
  readonly className?: string
}

/**
 * The color mode, the accent, and a live preview in one section. Every control drives the shared
 * theme, so a change repaints the whole document and persists through the theme source. It heads
 * itself with an `h2`, so it drops into a page under its `h1`. The preview moves beside the
 * controls once the section has room.
 */
export function ThemeStudio({
  labels,
  modeLabels,
  accentLabels,
  icons,
  preview = <ThemePreview />,
  announceError = true,
  className,
}: ThemeStudioProps): ReactElement {
  const copy = { ...defaultThemeStudioLabels, ...labels }
  const { error } = useTheme()
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className={cn("@container/studio grid gap-6", className)}>
      <div>
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {copy.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      {!announceError || error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {copy.error}
        </p>
      )}
      <div className="grid gap-6 @lg/studio:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">{copy.mode}</h3>
            <ThemeModeGroup
              {...(modeLabels === undefined ? {} : { labels: modeLabels })}
              {...(icons === undefined ? {} : { icons })}
              announceError={false}
            />
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">{copy.accent}</h3>
            <AccentPicker
              {...(accentLabels === undefined ? {} : { labels: accentLabels })}
              announceError={false}
            />
          </div>
        </div>
        {preview}
      </div>
    </section>
  )
}
