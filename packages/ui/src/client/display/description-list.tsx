import { cn } from "@plainworks/theme"
import type { ReactElement, ReactNode } from "react"

/** Props for {@link DescriptionList}. */
export interface DescriptionListProps {
  /** {@link DescriptionItem} pairs. */
  readonly children: ReactNode
  readonly className?: string | undefined
}

/**
 * A list of labelled details, such as a record's fields. It is one column on a narrow container and
 * two once its container has room, whatever the viewport.
 */
export function DescriptionList({ children, className }: DescriptionListProps): ReactElement {
  return (
    <div data-slot="description-list" className="@container/description-list">
      <dl className={cn("grid gap-4 @sm/description-list:grid-cols-2", className)}>{children}</dl>
    </div>
  )
}

/** Props for {@link DescriptionItem}. */
export interface DescriptionItemProps {
  /** The label, e.g. `"Email"`. */
  readonly term: ReactNode
  /** The value. */
  readonly children: ReactNode
  readonly className?: string | undefined
}

/** One term and its value inside a {@link DescriptionList}. */
export function DescriptionItem({ term, children, className }: DescriptionItemProps): ReactElement {
  return (
    <div data-slot="description-item" className={cn("grid gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}
