"use client"

import type { ReactElement } from "react"
import type { Section } from "../../app/navigation"

/** Props for {@link SectionOutlet}. */
export interface SectionOutletProps {
  /** The active section whose body renders here. */
  readonly section: Section
}

/**
 * The active section's body renders here, inside the shell frame, displaying the active section's
 * summary.
 */
export function SectionOutlet({ section }: SectionOutletProps): ReactElement {
  return <p className="text-muted-foreground">{section.summary}</p>
}
