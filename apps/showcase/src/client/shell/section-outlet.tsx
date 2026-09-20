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
const OrdersSection = lazy(async () => {
  const module = await import("../orders")
  return { default: module.OrdersSection }
})
const ProductsSection = lazy(async () => {
  const module = await import("../products")
  return { default: module.ProductsSection }
})
const UsersSection = lazy(async () => {
  const module = await import("../users")
  return { default: module.UsersSection }
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
    case "orders":
      content = <OrdersSection />
      break
    case "products":
      content = <ProductsSection />
      break
    case "users":
      content = <UsersSection />
      break
    case "settings":
      content = <SettingsSection announceError={false} />
      break
    default:
      return (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-8 text-center shadow-xs">
          <p className="text-muted-foreground">{section.summary}</p>
        </div>
      )
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
