import { describe, expect, it } from "vitest"
import { ELEMENT_NAMES } from "./registry"

// The server-safe manifest is the `.` entry: importing it must pull in no DOM, and it must list the
// owned atoms. A regeneration test in the registry tooling holds it in lock-step with the atom
// files on disk; here we assert its runtime shape.
describe("owned-atom manifest", () => {
  it("lists a non-empty, de-duplicated, sorted set of atom names", () => {
    expect(ELEMENT_NAMES.length).toBeGreaterThan(0)
    expect(new Set(ELEMENT_NAMES).size).toBe(ELEMENT_NAMES.length)
    expect([...ELEMENT_NAMES]).toEqual([...ELEMENT_NAMES].sort())
  })

  it("includes the foundational form atoms", () => {
    for (const name of ["button", "input", "label"]) {
      expect(ELEMENT_NAMES).toContain(name)
    }
  })
})
