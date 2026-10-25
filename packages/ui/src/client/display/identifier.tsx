"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@plainworks/elements/tooltip"
import { cn } from "@plainworks/theme"
import type { ReactElement } from "react"
import { IconButton } from "../actions/icon-button"
import { useClipboard } from "../clipboard/use-clipboard"

/**
 * Shortens `value` to its first `head` and last `tail` characters around an ellipsis. A value that
 * would not get shorter is returned whole.
 */
export function middleTruncate(value: string, head: number, tail: number): string {
  const chars = Array.from(value)
  if (chars.length <= head + tail + 1) return value
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`
}

/** Every user-facing string of an {@link Identifier}. */
export interface IdentifierLabels {
  /** Leads the copy button's name, followed by the identifier's label. */
  readonly copy: string
  readonly copied: string
  readonly failed: string
}

/** English defaults for every {@link IdentifierLabels} field. */
export const defaultIdentifierLabels: IdentifierLabels = {
  copy: "Copy",
  copied: "Copied",
  failed: "Copy failed",
}

/** Props for {@link Identifier}. */
export interface IdentifierProps {
  /** The full identifier. */
  readonly value: string
  /** What the identifier is, such as `"run id"`; names the copy button. */
  readonly label: string
  /** Characters kept at the start. Defaults to 6. */
  readonly head?: number
  /** Characters kept at the end. Defaults to 4. */
  readonly tail?: number
  /** Show the copy button. Defaults to true. */
  readonly copy?: boolean
  readonly labels?: Partial<IdentifierLabels>
  readonly className?: string
}

function CopyGlyph(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="size-3.5"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </svg>
  )
}

/**
 * A machine identifier in mono type, shortened in the middle so its start and end stay readable.
 * The full value shows in a tooltip on hover and keyboard focus, screen readers hear it whole, and
 * a named button copies it.
 */
export function Identifier({
  value,
  label,
  head = 6,
  tail = 4,
  copy = true,
  labels,
  className,
}: IdentifierProps): ReactElement {
  const names = { ...defaultIdentifierLabels, ...labels }
  const clipboard = useClipboard()
  const short = middleTruncate(value, head, tail)
  const status = clipboard.copied ? names.copied : clipboard.error === undefined ? "" : names.failed
  return (
    <span
      data-slot="identifier"
      className={cn("inline-flex min-w-0 items-center gap-0.5 font-mono text-caption", className)}
    >
      {short === value ? (
        <span data-slot="identifier-value">{value}</span>
      ) : (
        <Tooltip>
          {/* Focusable so keyboard users get the tooltip; the full value is read out either way. */}
          <TooltipTrigger
            render={
              // biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip must open on keyboard focus
              <span data-slot="identifier-value" tabIndex={0} className="rounded-sm" />
            }
          >
            <span aria-hidden="true">{short}</span>
            <span className="sr-only">{value}</span>
          </TooltipTrigger>
          <TooltipContent className="font-mono">{value}</TooltipContent>
        </Tooltip>
      )}
      {copy ? (
        <>
          <IconButton
            label={`${names.copy} ${label}`}
            icon={<CopyGlyph />}
            size="icon-xs"
            onClick={() => {
              // A refused write is kept in the hook's error state and announced below.
              clipboard.copy(value).catch(() => undefined)
            }}
          />
          <span role="status" className="sr-only">
            {status}
          </span>
        </>
      ) : null}
    </span>
  )
}
