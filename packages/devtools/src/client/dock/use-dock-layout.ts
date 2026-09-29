"use client"

import { ensureError } from "@plainworks/std"
import { AbortError } from "@plainworks/std/resilience"
import { createSourceReconciler, type StateSource } from "@plainworks/std/seam"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  type DevtoolsDockSide,
  type DevtoolsLayout,
  type ResolvedDock,
  resolveDock,
} from "./layout"
import { useDockViewport } from "./viewport"

/** A layout that could not be restored from, or saved to, its source. */
export interface DockLayoutFailure {
  /** Whether reading the stored layout or writing the new one failed. */
  readonly phase: "restore" | "save"
  /** The source's error, kept for diagnosis. */
  readonly cause: Error
}

/** The dock layout a shell renders from: the user's preference and where it lands now. */
export interface DockLayoutControl {
  /** The user's preference, as persisted. */
  readonly layout: DevtoolsLayout
  /** The preference resolved against the current viewport. */
  readonly dock: ResolvedDock
  /** Whether the viewport currently fits a side dock. */
  readonly sideDockFits: boolean
  /** The latest persistence failure, cleared by the next successful read or write. */
  readonly failure: DockLayoutFailure | undefined
  /** Apply a new preference now and persist it. A failed save keeps it for this page. */
  readonly setLayout: (next: DevtoolsLayout) => void
}

/**
 * Own the dock preference for one mounted shell. It starts on `defaultSide`, then adopts what the
 * source holds and follows later external changes (another tab), through the shared std
 * reconciler, so a slow read never overwrites a newer local choice. A local change applies at once
 * and is then written through the reconciler, which orders writes so the source ends on the latest
 * choice and cancels them on unmount. Only the latest write's outcome sets `failure`, and a failure
 * is never swallowed.
 */
export function useDockLayout(
  source: StateSource<DevtoolsLayout>,
  defaultSide: DevtoolsDockSide,
): DockLayoutControl {
  const [layout, setLayoutState] = useState<DevtoolsLayout>(() => ({ side: defaultSide }))
  const [failure, setFailure] = useState<DockLayoutFailure>()
  const viewport = useDockViewport()

  // An external clear resets to the current default without rebuilding the reconciler.
  const defaultSideRef = useRef(defaultSide)
  defaultSideRef.current = defaultSide

  const reconciler = useMemo(
    () =>
      createSourceReconciler<DevtoolsLayout>({
        source,
        adopt: (value) => {
          setLayoutState(value)
          setFailure(undefined)
        },
        reset: () => setLayoutState({ side: defaultSideRef.current }),
        report: (cause) => setFailure({ phase: "restore", cause: ensureError(cause) }),
      }),
    [source],
  )

  useEffect(() => reconciler.start(), [reconciler])

  // The latest write's ticket: an earlier write settling later must not overwrite its outcome.
  const latestSave = useRef(0)

  const setLayout = (next: DevtoolsLayout): void => {
    setLayoutState(next)
    const ticket = ++latestSave.current
    reconciler.set(next).then(
      () => {
        if (ticket === latestSave.current) setFailure(undefined)
      },
      (cause: unknown) => {
        // A write replaced by a newer one, or cancelled by unmount, is not a failed save.
        if (ticket !== latestSave.current || cause instanceof AbortError) return
        setFailure({ phase: "save", cause: ensureError(cause) })
      },
    )
  }

  return {
    layout,
    dock: resolveDock(layout, viewport),
    sideDockFits: viewport.sideDockFits,
    failure,
    setLayout,
  }
}
