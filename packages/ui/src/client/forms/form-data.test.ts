import { describe, expect, it } from "vitest"
import { formDataToObject } from "./form-data"

describe("formDataToObject", () => {
  it("keeps a single value as a string and repeated names as an array", () => {
    const data = new FormData()
    data.append("name", "Ada")
    data.append("role", "admin")
    data.append("role", "editor")
    expect(formDataToObject(data)).toEqual({ name: "Ada", role: ["admin", "editor"] })
  })

  it("drops File entries — this concern submits scalar values, not uploads", () => {
    const data = new FormData()
    data.append("name", "Ada")
    data.append("avatar", new File(["x"], "a.png"))
    expect(formDataToObject(data)).toEqual({ name: "Ada" })
  })

  it("treats a reserved name as an own field without polluting the prototype", () => {
    const data = new FormData()
    data.append("__proto__", "attacker")
    data.append("constructor", "attacker")
    const result = formDataToObject(data)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(Object.hasOwn(result, "__proto__")).toBe(true)
    // Read the own data property directly, never through the deprecated accessor.
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toBe("attacker")
    // No plain object gained an "attacker" prototype from the reserved name.
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
  })
})
