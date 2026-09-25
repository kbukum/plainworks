"use client"

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

/** Props for {@link EmptyState}. */
export interface EmptyStateProps {
  /** What is empty, e.g. `"No orders match"`. */
  readonly title: ReactNode
  /** Why it is empty, or what to do next. */
  readonly description?: ReactNode
  /** Leading icon (an SVG element); injected, never imported here. */
  readonly icon?: ReactNode
  /** The next useful action, such as clearing filters or creating the first item. */
  readonly action?: ReactNode
  readonly className?: string
}

/**
 * The empty view of a region, built on the `empty` atom: a framed, centered message with an
 * optional icon and the next useful action, so a blank result never reads as missing content.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <Empty data-state="empty" className={cn("border", className)}>
      <EmptyHeader>
        {icon === undefined ? null : <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description === undefined ? null : <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action === undefined ? null : <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
