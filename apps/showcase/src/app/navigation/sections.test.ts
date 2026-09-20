import { describe, expect, it } from "vitest"
import { breadcrumbTrail, SECTIONS, sectionForPath } from "./sections"

// The route map is the one source both the shell nav and the breadcrumbs read, so its resolution
// rules (which path is which section, and the trail each produces) are worth pinning directly.

describe("section route map", () => {
  it("lists the seven sections in navigation order with Overview owning the root", () => {
    expect(SECTIONS.map((section) => section.id)).toEqual([
      "overview",
      "tasks",
      "orders",
      "products",
      "users",
      "notifications",
      "settings",
    ])
    expect(SECTIONS.map((section) => section.path)).toContain("/")
  })

  it("resolves the root path to Overview", () => {
    expect(sectionForPath("/").id).toBe("overview")
  })

  it("resolves a section path, ignoring query and hash", () => {
    expect(sectionForPath("/tasks").id).toBe("tasks")
    expect(sectionForPath("/tasks?filter=open").id).toBe("tasks")
    expect(sectionForPath("/settings#account").id).toBe("settings")
  })

  it("resolves a nested path to its owning section", () => {
    expect(sectionForPath("/orders/42").id).toBe("orders")
  })

  it("falls back to Overview for an unknown path", () => {
    expect(sectionForPath("/nowhere").id).toBe("overview")
  })

  it("builds a single current crumb for Overview", () => {
    expect(breadcrumbTrail(sectionForPath("/"))).toEqual([{ label: "Overview" }])
  })

  it("builds an Overview → section trail for a non-root section", () => {
    expect(breadcrumbTrail(sectionForPath("/tasks"))).toEqual([
      { label: "Overview", path: "/" },
      { label: "Tasks" },
    ])
  })
})
