"use client"

import { MotionControl } from "@plainworks/ui/theme/motion-control"
import { ThemeStudio } from "@plainworks/ui/theme/theme-studio"
import type { ReactElement } from "react"
import { THEME_MODE_ICONS } from "../theme-mode-icons"
import { useLocalPreferences } from "./local-preferences"

/**
 * The Appearance panel: the theme studio (color mode and accent, owned by the theme seam) plus the
 * device-local motion choice. Both apply instantly and persist — the theme through its cookie, the
 * motion choice through the persistent scope — so neither needs a save button.
 */
export function AppearancePanel(): ReactElement {
  const motion = useLocalPreferences((state) => state.motion)
  const preferences = useLocalPreferences.useApi()

  return (
    <div className="grid gap-8">
      <ThemeStudio icons={THEME_MODE_ICONS} announceError={false} />
      <MotionControl
        value={motion}
        onValueChange={(next) => preferences.set({ motion: next })}
        labels={{ description: "Control animation across the app. Saved to this device." }}
      />
    </div>
  )
}
