import { PlainError } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { StateError } from "./errors"

describe("StateError", () => {
  test("is a PlainError with the state discriminant and its own name", () => {
    const error = new StateError("boom")
    expect(error).toBeInstanceOf(PlainError)
    expect(error).toBeInstanceOf(StateError)
    expect(error.name).toBe("StateError")
    expect(error.kind).toBe("state/missing-provider")
    expect(error.message).toBe("boom")
  })

  test("preserves the underlying cause", () => {
    const cause = new Error("root")
    const error = new StateError("boom", { cause })
    expect(error.cause).toBe(cause)
  })
})
