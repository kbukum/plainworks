"use client"

import { Button, buttonVariants } from "@plainworks/elements/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plainworks/elements/empty"
import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"

interface ErrorStateBaseProps {
  /** What failed, e.g. `"Orders are unavailable"`. */
  readonly title: ReactNode
  /**
   * What the user can do about it. Keep it generic: never render a raw `Error` message, which can
   * carry URLs or identifiers. The error itself belongs to the reporting seam.
   */
  readonly description?: ReactNode
  /** Leading icon (an SVG element); injected, never imported here. */
  readonly icon?: ReactNode
  readonly className?: string
}

/** A recovery control rendered by {@link ErrorState} as a semantic button or link. */
export type ErrorStateAction =
  | {
      readonly label: ReactNode
      readonly onAction: () => void
      readonly href?: never
    }
  | {
      readonly label: ReactNode
      readonly href: string
      readonly onAction?: never
    }

/**
 * Props for {@link ErrorState}. A failure is always actionable: pass `onRetry` for the built-in
 * retry button, or describe a caller-owned button or link through `action`.
 */
export type ErrorStateProps = ErrorStateBaseProps &
  (
    | {
        /** Retry the failed work, e.g. a query's `refetch`. */
        readonly onRetry: () => void
        /** Label for the retry button. Defaults to `"Try again"`. */
        readonly retryLabel?: string
        readonly action?: never
      }
    | {
        /** A caller-owned recovery button or link, such as sign-in or support. */
        readonly action: ErrorStateAction
        readonly onRetry?: never
        readonly retryLabel?: never
      }
  )

/**
 * The failure view of a region, built on the `empty` atom so it holds the same place as the loading
 * and empty views. It is an `alert` with a destructive frame and title and a recovery action, so a
 * failure is never mistaken for waiting. It also serves as the presentational fallback for an error
 * boundary: wire the boundary's `reset` to `onRetry`.
 */
export function ErrorState(props: ErrorStateProps): ReactElement {
  const { title, description, icon, className } = props
  return (
    <Empty role="alert" data-state="error" className={cn("border border-destructive", className)}>
      <EmptyHeader>
        {icon === undefined ? null : <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle className="text-destructive">{title}</EmptyTitle>
        {description === undefined ? null : <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      <EmptyContent>
        {props.onRetry === undefined ? (
          props.action.href === undefined ? (
            <Button type="button" variant="outline" onClick={props.action.onAction}>
              {props.action.label}
            </Button>
          ) : (
            <a className={buttonVariants({ variant: "outline" })} href={props.action.href}>
              {props.action.label}
            </a>
          )
        ) : (
          <Button type="button" variant="outline" onClick={props.onRetry}>
            {props.retryLabel ?? "Try again"}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  )
}
