import { PlainError } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { StateConfigError, StateError, StateSourceError } from "./errors"

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

describe("StateConfigError", () => {
  test("carries a distinct config discriminant, apart from StateError", () => {
    const error = new StateConfigError("misconfigured")
    expect(error).toBeInstanceOf(PlainError)
    expect(error).toBeInstanceOf(StateConfigError)
    expect(error).not.toBeInstanceOf(StateError)
    expect(error.name).toBe("StateConfigError")
    expect(error.kind).toBe("state/invalid-config")
    expect(error.message).toBe("misconfigured")
  })

  test("preserves the underlying cause", () => {
    const cause = new Error("root")
    const error = new StateConfigError("misconfigured", { cause })
    expect(error.cause).toBe(cause)
  })
})

describe("StateSourceError", () => {
  test("carries a distinct source discriminant and preserves the cause", () => {
    const cause = new SyntaxError("Unexpected token")
    const error = new StateSourceError("could not deserialize", { cause })
    expect(error).toBeInstanceOf(PlainError)
    expect(error).toBeInstanceOf(StateSourceError)
    expect(error).not.toBeInstanceOf(StateError)
    expect(error.name).toBe("StateSourceError")
    expect(error.kind).toBe("state/source")
    expect(error.cause).toBe(cause)
  })
})
