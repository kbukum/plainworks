"use client"

import { lazy, type ReactElement, Suspense } from "react"
import type { Section } from "../../app/navigation"

const OverviewSection = lazy(async () => {
  const module = await import("../overview")
  return { default: module.OverviewSection }
})
const TasksSection = lazy(async () => {
  const module = await import("../tasks")
  return { default: module.TasksSection }
})
const SettingsSection = lazy(async () => {
  const module = await import("../theme-studio")
  return { default: module.ThemeStudio }
})

/** Props for {@link SectionOutlet}. */
export interface SectionOutletProps {
  /** The active section whose body renders here. */
  readonly section: Section
}

/**
 * The active section's body renders here, inside the shell frame. Built sections render their real
 * surfaces; every other section shows its one-line summary until it is built.
 */
export function SectionOutlet({ section }: SectionOutletProps): ReactElement {
  let content: ReactElement
  switch (section.id) {
    case "overview":
      content = <OverviewSection />
      break
    case "tasks":
      content = <TasksSection />
      break
    case "settings":
      content = <SettingsSection announceError={false} />
      break
    default:
      return <p className="text-muted-foreground">{section.summary}</p>
  }
  return (
    <Suspense
      fallback={
        <p role="status" className="text-muted-foreground">
          Loading {section.label.toLocaleLowerCase()}...
        </p>
      }
    >
      {content}
    </Suspense>
  )
}
