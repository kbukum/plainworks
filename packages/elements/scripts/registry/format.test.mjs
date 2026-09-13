import { describe, expect, it } from "vitest"
import { formatTsx } from "./format.mjs"

describe("formatTsx", () => {
  it("reformats a source to the repo Biome style", () => {
    const formatted = formatTsx('export const x = {a: 1};\n')
    expect(formatted).toBe("export const x = { a: 1 }\n")
  })
})
