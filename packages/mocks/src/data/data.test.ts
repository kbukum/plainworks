import { describe, expect, it } from "vitest"
import { createFixtureSources, createStore } from "./common"
import {
  createDashboardStats,
  createRevenueChartData,
  createUserGrowthChartData,
  generateDailySales,
  generateMonthlyRevenue,
  generateProductSales,
} from "./dashboard"
import { createSettingsStore, createUserSettings, updateUserSettings } from "./settings"
import { createTaskFactory } from "./tasks"
import { createUserFactory } from "./users"

const sources = (domain = "tasks") => createFixtureSources(42, domain)

describe("entity factory (tasks)", () => {
  it("creates a single entity with an id", () => {
    const factory = createTaskFactory(sources())
    const task = factory.create()
    expect(task.id).toBeTruthy()
    expect(task.title).toBeTruthy()
  })

  it("createMany returns the requested count", () => {
    expect(createTaskFactory(sources()).createMany(3)).toHaveLength(3)
  })

  it("getSeeded caches until reset", () => {
    const factory = createTaskFactory(sources())
    const first = factory.getSeeded()
    expect(first).toBe(factory.getSeeded())
    factory.resetSeeded()
    expect(factory.getSeeded()).not.toBe(first)
  })

  it("getSeeded regenerates when the requested count changes", () => {
    const factory = createTaskFactory(sources())
    expect(factory.getSeeded(3)).toHaveLength(3)
    expect(factory.getSeeded(10)).toHaveLength(10)
    expect(factory.getSeeded(10)).toHaveLength(10) // stable while the count is unchanged
  })

  it("applies partial input overrides", () => {
    expect(createTaskFactory(sources()).create({ title: "Custom" }).title).toBe("Custom")
  })

  it("same seed reproduces the same content", () => {
    const fixed = { now: () => Date.parse("2026-01-15T12:00:00.000Z") }
    const a = createTaskFactory(createFixtureSources(5, "tasks", fixed)).create()
    const b = createTaskFactory(createFixtureSources(5, "tasks", fixed)).create()
    // With the same seed and a fixed clock the whole fixture is identical — id included.
    expect(a).toEqual(b)
  })
})

describe("user factory", () => {
  it("honors the department input override", () => {
    expect(createUserFactory(sources()).create({ department: "Legal" }).department).toBe("Legal")
  })
})

describe("entity store", () => {
  it("initializes lazily and supports mutation", () => {
    const factory = createTaskFactory(sources())
    const store = createStore(() => factory.getSeeded())
    const seeded = store.getAll()
    expect(seeded.length).toBeGreaterThan(0)

    const created = factory.create({ title: "Store test" })
    store.prepend(created)
    expect(store.getAll()[0]?.id).toBe(created.id)

    const idx = store.findIndex((t) => t.id === created.id)
    expect(idx).toBe(0)
    expect(store.find((t) => t.id === created.id)?.title).toBe("Store test")

    store.update(idx, { ...created, title: "Updated" })
    expect(store.find((t) => t.id === created.id)?.title).toBe("Updated")

    store.remove(idx)
    expect(store.find((t) => t.id === created.id)).toBeUndefined()

    store.setAll([created])
    expect(store.getAll()).toEqual([created])

    store.reset()
    expect(store.getAll().length).toBeGreaterThan(0) // re-seeds lazily after reset
  })
})

describe("dashboard data", () => {
  it("createDashboardStats returns numeric metrics", () => {
    const stats = createDashboardStats(sources())
    expect(stats.totalUsers).toBeGreaterThan(0)
    expect(typeof stats.revenueGrowth).toBe("number")
  })

  it("chart builders honor the day count", () => {
    expect(createRevenueChartData(sources(), 5).data).toHaveLength(5)
    expect(createUserGrowthChartData(sources(), 5).data).toHaveLength(5)
  })

  it("generators honor their counts", () => {
    expect(generateDailySales(sources(), 4)).toHaveLength(4)
    expect(generateProductSales(sources(), 3)).toHaveLength(3)
    expect(generateMonthlyRevenue(sources(), 6)).toHaveLength(6)
  })

  it("monthly revenue rolls over correctly past one calendar year", () => {
    const series = generateMonthlyRevenue(sources(), 24)
    expect(series).toHaveLength(24)
    expect(series.every((point) => /^\w{3} \d{4}$/.test(point.month))).toBe(true)
    // Stepping backwards: each labeled month precedes the next.
    const dates = series.map((point) => new Date(point.month).getTime())
    expect(dates.every((t, i) => i === 0 || t > (dates[i - 1] ?? 0))).toBe(true)
  })
})

describe("settings store", () => {
  it("creates, updates, and persists user settings", () => {
    const store = createSettingsStore()
    const base = createUserSettings("u1")
    expect(base.userId).toBe("u1")

    const merged = updateUserSettings(base, { theme: "dark", notifications: { email: false } })
    expect(merged.theme).toBe("dark")
    expect(merged.notifications.email).toBe(false)
    expect(merged.notifications.push).toBe(true)

    expect(store.get("u2").userId).toBe("u2")
    expect(store.get("u2")).toBe(store.get("u2"))

    const saved = store.save("u2", { language: "fr" })
    expect(saved.language).toBe("fr")
    expect(store.get("u2").language).toBe("fr")
  })

  it("resets one user without touching the others", () => {
    const store = createSettingsStore()
    store.save("u1", { theme: "dark" })
    store.save("u2", { theme: "light" })

    store.resetUser("u1")

    expect(store.get("u1").theme).toBe("system")
    expect(store.get("u2").theme).toBe("light")
  })
})
