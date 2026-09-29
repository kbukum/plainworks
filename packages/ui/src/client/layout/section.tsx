"use client"

import { cn } from "@plainworks/theme"
import { type ComponentProps, type ReactElement, type ReactNode, useId } from "react"

/** The heading level of a {@link Section}; `h1` belongs to the `PageHeader`. */
export type SectionHeadingLevel = 2 | 3 | 4 | 5 | 6

const HEADING_TAG = {
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
} as const satisfies Record<SectionHeadingLevel, string>

/** Props for {@link Section}. */
export interface SectionProps extends Omit<ComponentProps<"section">, "title"> {
  /** The visible heading. It also names the region, so every section is labelled. */
  readonly title: ReactNode
  /** Supporting copy, announced as the region's description. */
  readonly description?: ReactNode
  /** Section-level actions. They sit beside the heading and wrap below it when narrow. */
  readonly actions?: ReactNode
  /** Heading level. Defaults to `2`; use a deeper level for a nested section. */
  readonly headingLevel?: SectionHeadingLevel
}

/**
 * A titled region of a page. The heading names the `<section>` (so it is a labelled `region`
 * landmark), the description describes it, and the body follows with the theme's stack rhythm. It
 * is a container-query root, so the header row and its children adapt to the section's own width.
 */
export function Section({
  title,
  description,
  actions,
  headingLevel = 2,
  className,
  children,
  ...props
}: SectionProps): ReactElement {
  const id = useId()
  const headingId = `${id}heading`
  const descriptionId = `${id}description`
  const Heading = HEADING_TAG[headingLevel]
  return (
    <section
      {...props}
      data-slot="section"
      aria-labelledby={headingId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      className={cn("@container/section flex min-w-0 flex-col gap-stack", className)}
    >
      <div className="flex flex-col gap-2 @lg/section:flex-row @lg/section:items-start @lg/section:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading id={headingId} className="text-title font-semibold text-balance">
            {title}
          </Heading>
          {description === undefined ? null : (
            <p id={descriptionId} className="text-body text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
        {actions === undefined ? null : (
          <div data-slot="section-actions" className="flex shrink-0 flex-wrap gap-2">
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}
