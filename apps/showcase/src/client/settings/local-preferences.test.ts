import { describe, expect, it } from "vitest"
import { migrateMotionPreference } from "./local-preferences"

describe("migrateMotionPreference", () => {
  it("upgrades a legacy reduce-motion boolean to the current choices", () => {
    expect(migrateMotionPreference(true)).toBe("reduce")
    expect(migrateMotionPreference(false)).toBe("system")
  })

  it("passes an already-current value through", () => {
    expect(migrateMotionPreference("reduce")).toBe("reduce")
  })

  it("maps the former full-motion choice to the system preference", () => {
    expect(migrateMotionPreference("full")).toBe("system")
  })

  it("throws on an unmigratable payload rather than fabricating one", () => {
    expect(() => migrateMotionPreference("nonsense")).toThrow("Unmigratable motion preference.")
  })
})
