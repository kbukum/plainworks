"use client"

import { type RefObject, useLayoutEffect } from "react"
import type { ResolvedDock } from "./layout"

/** What the shell currently occupies, as published to the host. */
export interface HostReservation {
  /** Where the dock sits now and how big its panel is. */
  readonly dock: ResolvedDock
  /** Whether the inspector panel is open. */
  readonly open: boolean
  /** Whether the package stylesheet should reserve the space for the host. */
  readonly reserve: boolean
}

/**
 * Root attributes of the host integration contract. The package stylesheet turns them into the
 * `--plainworks-devtools-inset-*` custom properties and, with `reserve`, into root padding.
 */
export const HOST_ATTRIBUTES = {
  docked: "data-plainworks-devtools-docked",
  panel: "data-plainworks-devtools-panel",
  reserve: "data-plainworks-devtools-reserve",
} as const

/** The root custom property carrying the open panel's size, which the chrome and insets read. */
export const PANEL_SIZE_PROPERTY = "--plainworks-devtools-panel-size"

// The host's own root padding, captured before the reservation applies so the package stylesheet
// adds the devtools inset on top of it instead of replacing it. Sides are physical, like the dock.
const HOST_BASE = ["bottom", "left", "right"].flatMap((side): (readonly [string, string])[] => [
  [`padding-${side}`, `--plainworks-devtools-host-padding-${side}`],
  [`scroll-padding-${side}`, `--plainworks-devtools-host-scroll-padding-${side}`],
])

/**
 * Publish the space the docked chrome occupies on the document root that owns `scope`, and clear
 * it on unmount. The root carries the side and open state as attributes and the panel size as
 * {@link PANEL_SIZE_PROPERTY}; the package stylesheet derives the insets from them, so the chrome
 * and the reservation read one value and can never disagree. With `reserve`, the host's own root
 * padding is captured first, so the reservation adds to it. Layout effects let the host reflow in
 * the same frame the chrome moves.
 *
 * The root is shared, so one shell per document owns the contract.
 */
export function useHostReservation(
  scope: RefObject<HTMLElement | null>,
  { dock, open, reserve }: HostReservation,
): void {
  const { side, size } = dock

  useLayoutEffect(() => {
    const root = scope.current?.ownerDocument.documentElement
    if (root === undefined) return
    if (reserve) {
      // Read before any reservation attribute is set; the previous run's cleanup removed its own.
      const host = root.ownerDocument.defaultView?.getComputedStyle(root)
      for (const [property, name] of HOST_BASE) {
        root.style.setProperty(name, hostLength(host?.getPropertyValue(property)))
      }
      root.setAttribute(HOST_ATTRIBUTES.reserve, "")
    }
    root.setAttribute(HOST_ATTRIBUTES.docked, side)
    if (open) root.setAttribute(HOST_ATTRIBUTES.panel, "")
    return () => {
      for (const name of Object.values(HOST_ATTRIBUTES)) root.removeAttribute(name)
      for (const [, name] of HOST_BASE) root.style.removeProperty(name)
    }
  }, [scope, side, open, reserve])

  // Resizing only moves the size, so it never re-captures the host's padding.
  useLayoutEffect(() => {
    const root = scope.current?.ownerDocument.documentElement
    if (root === undefined) return
    previewPanelSize(root, size)
    return () => {
      root.style.removeProperty(PANEL_SIZE_PROPERTY)
    }
  }, [scope, size])
}

/**
 * Show a panel size on `root` without a React render, for the frames of a drag. The committed size
 * replaces it on the next render.
 */
export function previewPanelSize(root: HTMLElement, size: number): void {
  root.style.setProperty(PANEL_SIZE_PROPERTY, `${size}px`)
}

// `scroll-padding` computes to `auto` when unset; for the root it behaves as zero.
function hostLength(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  return trimmed === "" || trimmed === "auto" ? "0px" : trimmed
}
