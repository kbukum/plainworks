"use client"

import { useMediaQuery } from "@plainworks/ui/hooks"
import { useSyncExternalStore } from "react"
import type { DockViewport } from "./layout"

/** The viewport width from which a side dock fits; narrower viewports dock at the bottom. */
export const SIDE_DOCK_QUERY = "(width >= 48rem)"

function subscribeToResize(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

const serverExtent = (): number => 0

// The bar's thickness in `rem`, as `--plainworks-devtools-bar-size` sets it in the host contract.
const BAR_SIZE_REM = 2.75

// Resolved against the root font size, so a user's larger default text grows the bar the panel
// must fit beside. Zooming and resizing both fire `resize`, which re-reads it.
function barSize(): number {
  const fontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return BAR_SIZE_REM * (Number.isFinite(fontSize) ? fontSize : 16)
}

/**
 * Track the viewport the dock lays out in. The size bounds the panel; the side-dock breakpoint is a
 * media query, so it follows the user's font size like the stylesheet's own breakpoints. The server
 * snapshot is an empty, narrow viewport; the shell renders no panel before hydration anyway.
 */
export function useDockViewport(): DockViewport {
  const width = useSyncExternalStore(subscribeToResize, () => window.innerWidth, serverExtent)
  const height = useSyncExternalStore(subscribeToResize, () => window.innerHeight, serverExtent)
  const bar = useSyncExternalStore(subscribeToResize, barSize, serverExtent)
  const sideDockFits = useMediaQuery(SIDE_DOCK_QUERY)
  return { width, height, barSize: bar, sideDockFits }
}
