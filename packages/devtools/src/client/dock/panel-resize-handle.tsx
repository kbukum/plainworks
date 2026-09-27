"use client"

import { cn } from "@plainworks/theme"
import {
  type KeyboardEvent,
  type ReactElement,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { previewPanelSize } from "./host-reservation"
import { keyboardPanelSize, pointerPanelSize, type ResolvedDock } from "./layout"

/** Props for {@link PanelResizeHandle}. */
export interface PanelResizeHandleProps {
  /** The dock in effect: its side sets the handle's axis, its size and bounds its value. */
  readonly dock: ResolvedDock
  /** Id of the panel this handle resizes. */
  readonly controls: string
  /** Commit a new panel size: on each resize key, and once when a drag ends. */
  readonly onResize: (size: number) => void
}

interface Drag {
  readonly pointerId: number
  readonly x: number
  readonly y: number
  readonly dock: ResolvedDock
  size: number
}

/**
 * The panel's resize handle, following the WAI-ARIA window splitter pattern: a focusable
 * `separator` whose value is the panel size, moved by the arrows along its axis (Shift for larger
 * steps) and by Home and End. A pointer drag captures its pointer, previews each frame on the
 * document root without a React render, and commits once, when the pointer is released. A drag
 * that is cancelled, loses its capture, or outlives the handle (the inspector closing mid-drag)
 * restores the committed size. The drag's listeners are owned by the drag and removed when it ends
 * or the handle unmounts.
 */
export function PanelResizeHandle({
  dock,
  controls,
  onResize,
}: PanelResizeHandleProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag>(undefined)
  // Defined only while dragging: the size the drag has reached, for the handle's own value.
  const [dragSize, setDragSize] = useState<number>()
  const dragging = dragSize !== undefined
  const vertical = dock.axis === "inline"
  // Read at release, so a parent re-render mid-drag never tears down and re-owns the drag.
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  useEffect(() => {
    const doc = ref.current?.ownerDocument
    const view = doc?.defaultView
    if (!dragging || doc === undefined || view == null) return
    const root = doc.documentElement
    const move = (event: PointerEvent): void => {
      const current = drag.current
      if (current === undefined || event.pointerId !== current.pointerId) return
      current.size = pointerPanelSize(current.dock, current.dock.size, {
        x: event.clientX - current.x,
        y: event.clientY - current.y,
      })
      previewPanelSize(root, current.size)
      setDragSize(current.size)
    }
    const end = (event: PointerEvent): void => {
      const current = drag.current
      if (current === undefined || event.pointerId !== current.pointerId) return
      drag.current = undefined
      setDragSize(undefined)
      if (event.type === "pointerup") onResizeRef.current(current.size)
      else previewPanelSize(root, current.dock.size)
    }
    view.addEventListener("pointermove", move)
    view.addEventListener("pointerup", end)
    view.addEventListener("pointercancel", end)
    // Capture routes the pointer to the handle even outside the viewport, so the drag always ends.
    // Losing it without a release (the browser revoked it) ends the drag like a cancel.
    view.addEventListener("lostpointercapture", end)
    return () => {
      view.removeEventListener("pointermove", move)
      view.removeEventListener("pointerup", end)
      view.removeEventListener("pointercancel", end)
      view.removeEventListener("lostpointercapture", end)
      // Still dragging here means the handle is unmounting mid-drag: drop the uncommitted preview.
      const current = drag.current
      if (current === undefined) return
      drag.current = undefined
      previewPanelSize(root, current.dock.size)
    }
  }, [dragging])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    // Keep the drag from selecting host or panel text.
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dock,
      size: dock.size,
    }
    setDragSize(dock.size)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = keyboardPanelSize(dock, event.key, event.shiftKey)
    if (next === undefined) return
    event.preventDefault()
    if (next !== dock.size) onResize(next)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a window splitter is a focusable `separator`; `<hr>` cannot hold focus or a value.
    <div
      ref={ref}
      role="separator"
      tabIndex={0}
      aria-label="Resize inspector"
      aria-controls={controls}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuenow={dragSize ?? dock.size}
      aria-valuemin={dock.min}
      aria-valuemax={dock.max}
      data-dragging={dragging || undefined}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      className={cn(
        "group/resize flex shrink-0 touch-none select-none items-center justify-center outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
        vertical ? "w-6 cursor-col-resize" : "h-6 cursor-row-resize",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full bg-border motion-safe:transition-colors",
          "group-hover/resize:bg-ring group-focus-visible/resize:bg-ring group-data-dragging/resize:bg-ring",
          vertical ? "h-8 w-1" : "h-1 w-8",
        )}
      />
    </div>
  )
}
