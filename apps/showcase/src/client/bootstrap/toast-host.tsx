"use client"

import { ToastProvider } from "@plainworks/ui/feedback/toast"
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

const TOAST_ICONS = {
  success: <CircleCheckIcon aria-hidden="true" />,
  error: <CircleAlertIcon aria-hidden="true" />,
  info: <InfoIcon aria-hidden="true" />,
  warning: <TriangleAlertIcon aria-hidden="true" />,
}

// The viewport's edge offsets, pushed past the space the dev-only chrome claims on each edge. The
// insets are unset, so 0px, unless the dev tools module maps them.
const CLEAR_OF_OVERLAY_INSETS =
  "bottom-[calc(1rem+var(--showcase-overlay-inset-bottom,0px))] left-[calc(1rem+var(--showcase-overlay-inset-left,0px))] right-[calc(1rem+var(--showcase-overlay-inset-right,0px))] sm:right-[calc(1rem+var(--showcase-overlay-inset-right,0px))] sm:left-auto"

/** The app's toast host: the kit provider with the app's icon set, clear of the dev chrome. */
export function ToastHost({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <ToastProvider icons={TOAST_ICONS} viewportClassName={CLEAR_OF_OVERLAY_INSETS}>
      {children}
    </ToastProvider>
  )
}
