// The section information architecture as one typed, server-safe source of truth. Both the SSR
// render and the client shell read it, so the navigation rail, the mobile drawer, and the
// breadcrumb trail can never drift from one another. It is data only — no React state, no host
// globals — the icons are component references the shell renders.

import type { LucideIcon } from "lucide-react"
import {
  Bell,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  SquareCheckBig,
  Users,
} from "lucide-react"

/** Stable id of a top-level section. */
export type SectionId =
  | "overview"
  | "tasks"
  | "orders"
  | "products"
  | "users"
  | "notifications"
  | "settings"

/** One navigable section: its id, visible label, route, one-line summary, and rail icon. */
export interface Section {
  readonly id: SectionId
  readonly label: string
  readonly path: string
  readonly summary: string
  readonly icon: LucideIcon
}

const overview: Section = {
  id: "overview",
  label: "Overview",
  path: "/",
  summary: "Key metrics, trends, and recent activity at a glance.",
  icon: LayoutDashboard,
}

const tasks: Section = {
  id: "tasks",
  label: "Tasks",
  path: "/tasks",
  summary: "The flagship interactive surface — filter, sort, edit, and watch live updates.",
  icon: SquareCheckBig,
}

const orders: Section = {
  id: "orders",
  label: "Orders",
  path: "/orders",
  summary: "A read-first catalog of orders with server-prefetched, filterable rows.",
  icon: ShoppingCart,
}

const products: Section = {
  id: "products",
  label: "Products",
  path: "/products",
  summary: "Browse the product catalog in a fluid, responsive grid.",
  icon: Package,
}

const users: Section = {
  id: "users",
  label: "Users",
  path: "/users",
  summary: "The team directory, hydrated from the mock backend.",
  icon: Users,
}

const notifications: Section = {
  id: "notifications",
  label: "Notifications",
  path: "/notifications",
  summary: "Recent notifications you can read and mark done.",
  icon: Bell,
}

const settings: Section = {
  id: "settings",
  label: "Settings",
  path: "/settings",
  summary: "Manage your account and workspace preferences.",
  icon: Settings,
}

/** Every section, in navigation order. Overview owns the root route. */
export const SECTIONS: readonly Section[] = [
  overview,
  tasks,
  orders,
  products,
  users,
  notifications,
  settings,
]

/**
 * The section a pathname resolves to. Overview owns the root; a nested path (`/tasks/42`) resolves
 * to its section; an unknown path falls back to Overview so the shell always has an active section.
 */
export function sectionForPath(path: string): Section {
  const pathname = path.split(/[?#]/, 1)[0] ?? "/"
  const match = SECTIONS.find(
    (section) =>
      section.id !== "overview" &&
      (pathname === section.path || pathname.startsWith(`${section.path}/`)),
  )
  return match ?? overview
}

/** A single breadcrumb hop: a label, plus a path when it links back rather than being the page. */
export interface Crumb {
  readonly label: string
  readonly path?: string
}

/**
 * The breadcrumb trail for a section: Overview alone on the root, otherwise Overview (linked) then
 * the current section as the page.
 */
export function breadcrumbTrail(section: Section): readonly Crumb[] {
  if (section.id === "overview") {
    return [{ label: overview.label }]
  }
  return [{ label: overview.label, path: overview.path }, { label: section.label }]
}
