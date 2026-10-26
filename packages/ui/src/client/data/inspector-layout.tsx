"use client"

import { cn } from "@plainworks/theme"
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react"
import { IconButton } from "../actions/icon-button"

/** Words {@link InspectorLayout} shows. */
export interface InspectorLayoutLabels {
  readonly previous: string
  readonly next: string
  readonly close: string
  /** The open item's place in the list, such as "3 of 12". */
  readonly position: (index: number, total: number) => string
}

export const defaultInspectorLayoutLabels: InspectorLayoutLabels = {
  previous: "Previous",
  next: "Next",
  close: "Close",
  position: (index, total) => `${index} of ${total}`,
}

/** Props for {@link InspectorLayout}. */
export interface InspectorLayoutProps {
  /** The list. Mark each row's focusable control with `data-inspector-item={id}`. */
  readonly list: ReactNode
  /** Item ids in list order, for previous and next. */
  readonly items: readonly string[]
  /** The open item's id, or `null` when the pane is closed. Bind it to the URL in a host. */
  readonly openId: string | null
  /** Called with the item to open, or `null` to close. */
  readonly onOpenChange: (id: string | null) => void
  /** The open item's name; it heads and labels the pane. */
  readonly title: ReactNode
  /** Controls beside the navigation, such as a favourite button. */
  readonly actions?: ReactNode
  /** The open item's details. */
  readonly children: ReactNode
  readonly labels?: Partial<InspectorLayoutLabels> | undefined
  readonly className?: string | undefined
}

/**
 * A list with an inspector pane for one item. On wide screens the pane sits beside the list; on
 * narrow screens it replaces the list until closed. The pane is not modal: the list stays usable,
 * and the open item is controlled so a host can keep it in the URL. Opening moves focus to the pane
 * heading, closing returns it to the row's `data-inspector-item` control, and inside the pane the
 * left and right arrow keys step through `items` while Escape closes.
 */
export function InspectorLayout({
  list,
  items,
  openId,
  onOpenChange,
  title,
  actions,
  children,
  labels,
  className,
}: InspectorLayoutProps): ReactElement {
  const words = { ...defaultInspectorLayoutLabels, ...labels }
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pane = useRef<HTMLElement>(null)
  const previousOpen = useRef<string | null>(openId)
  const open = openId !== null
  const index = openId === null ? -1 : items.indexOf(openId)
  const previousId = index > 0 ? items[index - 1] : undefined
  const nextId = index >= 0 ? items[index + 1] : undefined

  useEffect(() => {
    const before = previousOpen.current
    previousOpen.current = openId
    if (before === openId) return
    if (openId !== null) {
      // Opening from a closed pane, or losing focus with a removed control, lands on the heading.
      const active = document.activeElement
      if (before === null || active === null || !pane.current?.contains(active)) {
        heading.current?.focus()
      }
      return
    }
    if (before !== null) {
      const row = listRef.current?.querySelector<HTMLElement>(
        `[data-inspector-item="${CSS.escape(before)}"]`,
      )
      row?.focus()
    }
  }, [openId])

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === "Escape") {
      event.preventDefault()
      onOpenChange(null)
      return
    }
    if (isEditable(event.target)) return
    const target =
      event.key === "ArrowLeft" ? previousId : event.key === "ArrowRight" ? nextId : undefined
    if (target === undefined) return
    event.preventDefault()
    onOpenChange(target)
  }

  return (
    <div
      className={cn(
        "grid min-w-0 gap-4",
        open && "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]",
        className,
      )}
    >
      <div ref={listRef} className={cn("min-w-0", open && "max-lg:hidden")}>
        {list}
      </div>
      {open ? (
        <aside
          ref={pane}
          aria-labelledby={headingId}
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-col gap-4 self-start rounded-lg border border-border/70 bg-card p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <IconButton
              label={words.close}
              icon="×"
              size="icon-sm"
              onClick={() => onOpenChange(null)}
            />
            <IconButton
              label={words.previous}
              icon="‹"
              size="icon-sm"
              aria-disabled={previousId === undefined || undefined}
              className="aria-disabled:opacity-50"
              onClick={() => previousId !== undefined && onOpenChange(previousId)}
            />
            <IconButton
              label={words.next}
              icon="›"
              size="icon-sm"
              aria-disabled={nextId === undefined || undefined}
              className="aria-disabled:opacity-50"
              onClick={() => nextId !== undefined && onOpenChange(nextId)}
            />
            {index >= 0 ? (
              <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
                {words.position(index + 1, items.length)}
              </p>
            ) : null}
            {actions === undefined ? null : (
              <div className="ms-auto flex items-center gap-2">{actions}</div>
            )}
          </div>
          <h2
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="text-lg font-semibold break-words outline-none"
          >
            {title}
          </h2>
          <div className="min-w-0">{children}</div>
        </aside>
      ) : null}
    </div>
  )
}

function isEditable(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}
