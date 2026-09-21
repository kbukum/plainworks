"use client"

import type { ReactElement } from "react"
import { ThemeStudio } from "../theme-studio"
import { MotionControl } from "./motion-control"

/**
 * The Appearance panel: the theme studio (color mode and accent, owned by the theme seam) plus the
 * device-local motion control. Both apply instantly and persist — the theme through its cookie, the
 * motion choice through the persistent scope — so neither needs a save button.
 */
export function AppearancePanel(): ReactElement {
  return (
    <div className="grid gap-8">
      <ThemeStudio announceError={false} />
      <section aria-labelledby="motion-heading" className="grid gap-2">
        <div>
          <h3 id="motion-heading" className="text-sm font-medium">
            Motion
          </h3>
          <p className="text-sm text-muted-foreground">
            Control animation across the app. Saved to this device.
          </p>
        </div>
        <MotionControl />
      </section>
    </div>
  )
}
