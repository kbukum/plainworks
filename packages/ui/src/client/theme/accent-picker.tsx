"use client"

import { ToggleGroup, ToggleGroupItem } from "@plainworks/elements/toggle-group"
import { cn } from "@plainworks/theme"
import { useTheme } from "@plainworks/theme/client"
import { COLOR_SCHEMES, type ColorScheme } from "@plainworks/theme/preference"
import type { ReactElement } from "react"

/** Every user-facing string of the {@link AccentPicker}. */
export interface AccentPickerLabels {
  /** Names the group, e.g. `"Accent color"`. */
  readonly label: string
  /** Announced when the choice cannot be saved. Never the underlying error message. */
  readonly error: string
  /** The visible name of each color scheme. */
  readonly schemes: Readonly<Record<ColorScheme, string>>
}

/** Overrides for any subset of {@link AccentPickerLabels}, including single scheme names. */
export type AccentPickerLabelOverrides = Partial<Omit<AccentPickerLabels, "schemes">> & {
  readonly schemes?: Partial<Record<ColorScheme, string>>
}

/** English defaults for every {@link AccentPickerLabels} field. */
export const defaultAccentPickerLabels: AccentPickerLabels = {
  label: "Accent color",
  error: "The accent color could not be changed. Try again.",
  schemes: {
    neutral: "Neutral",
    indigo: "Indigo",
    violet: "Violet",
    blue: "Blue",
    emerald: "Emerald",
    orange: "Orange",
    slate: "Slate",
    rose: "Rose",
    cyan: "Cyan",
  },
}

/**
 * The classes that paint a swatch with a scheme's real accent from the theme stylesheet. Neutral
 * has no `--pw-primary` of its own, so it reads the foreground. A scheme's dark shade lives on the
 * compound `.dark.theme-*` selector, so the swatch carries `dark` under a dark document.
 */
function swatchClass(scheme: ColorScheme, resolvedMode: "light" | "dark"): string {
  if (scheme === "neutral") return "bg-foreground"
  return cn(`theme-${scheme}`, resolvedMode === "dark" && "dark", "bg-primary")
}

/** Props for {@link AccentPicker}. */
export interface AccentPickerProps {
  readonly labels?: AccentPickerLabelOverrides
  /** Announce a failed save below the group. Turn off when the page already announces it. */
  readonly announceError?: boolean
  readonly className?: string
}

/**
 * A picker over the theme's color schemes. Each choice shows its real accent next to its name, so
 * color is never the only signal. It reads and writes the shared theme, so the whole document
 * repaints as the user picks.
 */
export function AccentPicker({
  labels,
  announceError = true,
  className,
}: AccentPickerProps): ReactElement {
  const copy = {
    ...defaultAccentPickerLabels,
    ...labels,
    schemes: { ...defaultAccentPickerLabels.schemes, ...labels?.schemes },
  }
  const { theme, setTheme, resolvedMode, error } = useTheme()

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        aria-label={copy.label}
        variant="outline"
        value={[theme.colorScheme]}
        onValueChange={(values) => {
          const colorScheme = COLOR_SCHEMES.find((scheme) => scheme === values[0])
          if (colorScheme !== undefined && colorScheme !== theme.colorScheme) {
            // The provider keeps the typed failure on `error`, announced below.
            setTheme({ ...theme, colorScheme }).catch(() => undefined)
          }
        }}
        className={cn("max-w-full flex-wrap", className)}
      >
        {COLOR_SCHEMES.map((scheme) => (
          <ToggleGroupItem key={scheme} value={scheme} className="gap-2">
            <span
              aria-hidden
              className={cn("size-3.5 rounded-full border", swatchClass(scheme, resolvedMode))}
            />
            {copy.schemes[scheme]}
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
