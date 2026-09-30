"use client"

import { useEffect } from "react"
import type { MotionPreference } from "../preference"

/**
 * Write the user's motion choice to `data-motion` on the document root, where the theme stylesheet
 * reads it. `reduce` stops motion whatever the device says; `system` leaves the device's
 * `prefers-reduced-motion` in charge. Where the choice is stored is the caller's concern. On
 * unmount the root gets back what it held before.
 */
export function useDocumentMotion(motion: MotionPreference): void {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.motion
    root.dataset.motion = motion
    return () => {
      if (previous === undefined) delete root.dataset.motion
      else root.dataset.motion = previous
    }
  }, [motion])
}
