"use client"

import { ToggleGroup, ToggleGroupItem } from "@plainworks/elements/toggle-group"
import type { ColorScheme } from "@plainworks/theme"
import { COLOR_SCHEMES, cn } from "@plainworks/theme"
import { useTheme } from "@plainworks/theme/client"
import type { ReactElement } from "react"
import { THEME_ERROR_MESSAGE } from "./theme-error"

/** Title-case an accent scheme id for its visible, screen-reader label. */
function accentLabel(scheme: ColorScheme): string {
  return scheme.charAt(0).toUpperCase() + scheme.slice(1)
}

/**
 * The classes that paint a swatch dot with a scheme's real accent, read from the kit CSS rather
 * than a hardcoded copy.
 *
 * Two kit facts shape this. First, `.theme-neutral` sets no `--pw-primary` (its accent is the
 * neutral foreground, which already flips with mode), so neutral reads `bg-foreground` directly
 * instead of an undefined variable it would otherwise inherit from the active document theme.
 * Second, a scheme's dark shade lives on the compound `.dark.theme-*` selector, so the swatch also
 * carries `dark` when the document is dark — otherwise it would show the light shade under a dark
 * document.
 */
function swatchClass(scheme: ColorScheme, resolvedMode: "light" | "dark"): string {
  if (scheme === "neutral") {
    return "bg-foreground"
  }
  return cn(`theme-${scheme}`, resolvedMode === "dark" && "dark", "bg-primary")
}

/** Props for {@link AccentPicker}. */
export interface AccentPickerProps {
  /** Announce provider failures here. Disable when a parent owns the shared error. */
  readonly announceError?: boolean
  readonly className?: string
}

/**
 * A picker over the theme's nine accent schemes. Each swatch carries the scheme's real accent —
 * read from the kit's own CSS, never a hardcoded copy — alongside its name, so the choice is never
 * conveyed by color alone. It reads and writes `colorScheme` on the shared theme context, so the
 * whole document repaints live.
 */
export function AccentPicker({ announceError = true, className }: AccentPickerProps): ReactElement {
  const { theme, setTheme, resolvedMode, error } = useTheme()

  const select = (colorScheme: ColorScheme): void => {
    void setTheme({ ...theme, colorScheme }).catch(() => {
      // The provider exposes the typed failure; it is announced generically below.
    })
  }

  return (
    <>
      <ToggleGroup
        aria-label="Accent color"
        variant="outline"
        value={[theme.colorScheme]}
        onValueChange={(value) => {
          // Narrow the untyped group value through the scheme vocabulary; ignore an empty array so
          // an accent is always chosen.
          const next = COLOR_SCHEMES.find((scheme) => scheme === value[0])
          if (next !== undefined) {
            select(next)
          }
        }}
        className={cn("flex-wrap", className)}
      >
        {COLOR_SCHEMES.map((scheme) => (
          <ToggleGroupItem key={scheme} value={scheme} className="gap-2">
            <span
              aria-hidden
              className={cn("size-3.5 rounded-full border", swatchClass(scheme, resolvedMode))}
            />
            {accentLabel(scheme)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {!announceError || error === undefined ? null : (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {THEME_ERROR_MESSAGE}
        </p>
      )}
    </>
  )
}
