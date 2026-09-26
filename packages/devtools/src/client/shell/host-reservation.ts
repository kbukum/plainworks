"use client"

import { type RefObject, useLayoutEffect } from "react"

/** Where the inspector docks: pinned to one edge, or `auto` (bottom on narrow viewports). */
export type DevtoolsDock = "auto" | "right" | "bottom"

/** What the shell currently occupies, as published to the host. */
export interface HostReservation {
  /** The inspector's dock preference. */
  readonly dock: DevtoolsDock
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

// The host's own root padding, captured before the reservation applies so the package stylesheet
// adds the devtools inset on top of it instead of replacing it.
const HOST_BASE = [
  ["padding-block-end", "--plainworks-devtools-host-padding-block-end"],
  ["padding-inline-end", "--plainworks-devtools-host-padding-inline-end"],
  ["scroll-padding-block-end", "--plainworks-devtools-host-scroll-padding-block-end"],
  ["scroll-padding-inline-end", "--plainworks-devtools-host-scroll-padding-inline-end"],
] as const

/**
 * Publish the space the shell's docked chrome occupies on the document root that owns `scope`,
 * and clear it on unmount. The sizes live in the package stylesheet, so the chrome and the
 * reservation can never disagree and no layout is measured. With `reserve`, the host's own root
 * padding is captured into custom properties first, so the reservation adds to it. It runs as a
 * layout effect so the host reflows in the same frame the chrome appears.
 *
 * The root is shared, so one shell per document owns the contract.
 */
export function useHostReservation(
  scope: RefObject<HTMLElement | null>,
  { dock, open, reserve }: HostReservation,
): void {
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
    root.setAttribute(HOST_ATTRIBUTES.docked, "")
    if (open) root.setAttribute(HOST_ATTRIBUTES.panel, dock)
    return () => {
      for (const name of Object.values(HOST_ATTRIBUTES)) root.removeAttribute(name)
      for (const [, name] of HOST_BASE) root.style.removeProperty(name)
    }
  }, [scope, dock, open, reserve])
}

// `scroll-padding` computes to `auto` when unset; for the root it behaves as zero.
function hostLength(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  return trimmed === "" || trimmed === "auto" ? "0px" : trimmed
}
