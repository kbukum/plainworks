"use client"

import { useMotion } from "@plainworks/app/capabilities/theme"
import { useToast } from "@plainworks/ui/feedback/toast"
import { MotionControl } from "@plainworks/ui/theme/motion-control"
import { ThemeStudio } from "@plainworks/ui/theme/theme-studio"
import type { ReactElement } from "react"
import { THEME_MODE_ICONS } from "../theme-mode-icons"

/**
 * The Appearance panel: the theme studio (color mode and accent, owned by the theme seam) plus the
 * device-local motion choice. Both apply instantly and persist — the theme through its cookie, the
 * motion choice through the persistent scope — so neither needs a save button. A failed motion
 * save keeps the previous choice and raises a toast.
 */
export function AppearancePanel(): ReactElement {
  const { motion, setMotion } = useMotion()
  const toast = useToast()

  return (
    <div className="grid gap-8">
      <ThemeStudio icons={THEME_MODE_ICONS} announceError={false} />
      <MotionControl
        value={motion}
        onValueChange={(next) => {
          setMotion(next).catch(() => toast.error("Your device preferences could not be saved"))
        }}
        labels={{ description: "Control animation across the app. Saved to this device." }}
      />
    </div>
  )
}
