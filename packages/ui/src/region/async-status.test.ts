import { describe, expect, it } from "vitest"
import { asyncStatus } from "./async-status"

describe("asyncStatus", () => {
  it.each([
    [{ pending: true, error: true, empty: true }, "error"],
    [{ pending: true, error: false, empty: true }, "pending"],
    [{ pending: false, error: false, empty: true }, "empty"],
    [{ pending: false, error: false, empty: false }, "ready"],
    [{ pending: false }, "ready"],
  ] as const)("maps %o to %s, with failure outranking loading", (input, expected) => {
    expect(asyncStatus(input)).toBe(expected)
  })
})
