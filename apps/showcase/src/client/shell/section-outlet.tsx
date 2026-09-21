"use client"

import { assertNever } from "@plainworks/std"
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
const NotificationsSection = lazy(async () => {
  const module = await import("../notifications")
  return { default: module.NotificationsSection }
})
const SettingsSection = lazy(async () => {
  const module = await import("../settings")
  return { default: module.SettingsSection }
})

/** Props for {@link SectionOutlet}. */
export interface SectionOutletProps {
  /** The active section whose body renders here. */
  readonly section: Section
}

/**
 * The active section's body renders here, inside the shell frame. Every section is loaded at its
 * route boundary so the initial client bundle contains only the persistent shell.
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
    case "notifications":
      content = <NotificationsSection />
      break
    case "settings":
      content = <SettingsSection />
      break
    default:
      assertNever(section.id)
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
