"use client"

import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react"

// What can take keyboard focus inside the body. A body holding one of these already scrolls by
// moving focus through it, so it needs no tab stop of its own.
const FOCUSABLE =
  "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), " +
  'textarea:not(:disabled), [contenteditable], [tabindex]:not([tabindex="-1"])'

/** Props for {@link OverlayBody}. */
export interface OverlayBodyProps {
  /** The `data-slot` that names the body for styling and tests. */
  readonly slot: string
  /** The id of the overlay's title, which names the body while it scrolls. */
  readonly labelledBy: string
  readonly className: string
  /** Layout for the content inside the scroller, such as the gap between its children. */
  readonly contentClassName?: string
  readonly children: ReactNode
}

/**
 * The scrolling body of an overlay whose title and actions stay pinned. While its content
 * overflows and holds no focusable control, it becomes a focusable region named by the title, so
 * a keyboard user can still scroll it (WCAG 2.1.1). Otherwise it adds no tab stop, and initial
 * focus lands on the first control as before.
 */
export function OverlayBody({
  slot,
  labelledBy,
  className,
  contentClassName,
  children,
}: OverlayBodyProps): ReactElement {
  const body = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [focusable, setFocusable] = useState(false)

  useEffect(() => {
    const element = body.current
    if (element === null) return
    const measure = (): void =>
      setFocusable(
        element.scrollHeight > element.clientHeight &&
          content.current?.querySelector(FOCUSABLE) == null,
      )
    measure()
    // The body resizes with the viewport, and its content grows while the body stays capped.
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    resize?.observe(element)
    // Content can also swap a control in or out, or enable one, without changing size.
    const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(measure)
    if (content.current !== null) {
      resize?.observe(content.current)
      mutation?.observe(content.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "tabindex", "href", "contenteditable"],
      })
    }
    return () => {
      resize?.disconnect()
      mutation?.disconnect()
    }
  }, [])

  return (
    <div
      ref={body}
      data-slot={slot}
      // The body runs edge to edge inside a clipped popup, so its focus ring draws inset.
      className={`focus-visible:[outline-offset:calc(-1*var(--pw-focus-width))] ${className}`}
      {...(focusable ? { role: "region", "aria-labelledby": labelledBy, tabIndex: 0 } : {})}
    >
      <div ref={content} className={contentClassName}>
        {children}
      </div>
    </div>
  )
}
