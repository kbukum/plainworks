"use client"

import { useTheme } from "@plainworks/theme/client"
import type { ReactElement } from "react"
import { AccentPicker } from "./accent-picker"
import { ModeControl } from "./mode-control"
import { THEME_ERROR_MESSAGE } from "./theme-error"
import { ThemePreview } from "./theme-preview"

/** Props for {@link ThemeStudio}. */
export interface ThemeStudioProps {
  /** Announce provider failures here. Disable when the application shell owns the shared error. */
  readonly announceError?: boolean
}

/**
 * The theme studio: the mode control, the accent picker, and a live preview in one surface.
 * Every control drives the shared theme context, so a change is reflected across the whole document
 * — the preview included — and persists through the existing theme source with no extra path.
 * Settings embeds this studio; it carries its own labelled region and control headings so it drops
 * into a page section without assuming a heading level above `h2`.
 */
export function ThemeStudio({ announceError = true }: ThemeStudioProps): ReactElement {
  const { error } = useTheme()

  return (
    <section aria-labelledby="theme-studio-heading" className="@container/studio grid gap-6">
      <div>
        <h2 id="theme-studio-heading" className="text-lg font-semibold tracking-tight">
          Appearance
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose a color mode and accent. Changes apply instantly and are remembered next time.
        </p>
      </div>

      {!announceError || error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {THEME_ERROR_MESSAGE}
        </p>
      )}

      <div className="grid gap-6 @lg/studio:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Mode</h3>
            <ModeControl announceError={false} />
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Accent</h3>
            <AccentPicker announceError={false} />
          </div>
        </div>
        <ThemePreview />
      </div>
    </section>
  )
}
