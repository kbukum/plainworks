import { describe, expect, test } from "vitest"
import { createErrorSnapshot, ensureError, getErrorMessage, PlainError } from "./errors"

describe("PlainError", () => {
  test("carries a typed kind and message", () => {
    const error = new PlainError("std/test", "boom")
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("PlainError")
    expect(error.kind).toBe("std/test")
    expect(error.message).toBe("boom")
  })

  test("preserves the underlying cause when provided", () => {
    const cause = new Error("root")
    const error = new PlainError("std/test", "wrapped", { cause })
    expect(error.cause).toBe(cause)
  })

  test("omits cause when none is given", () => {
    const error = new PlainError("std/test", "no cause")
    expect(error.cause).toBeUndefined()
  })

  test("a subclass reports its own constructor name, not the base name", () => {
    class HttpError extends PlainError<"http"> {
      constructor(message: string) {
        super("http", message)
      }
    }
    const error = new HttpError("bad status")
    expect(error.name).toBe("HttpError")
    expect(error.kind).toBe("http")
  })
})

describe("ensureError", () => {
  test("returns Error values unchanged", () => {
    const original = new Error("keep me")
    expect(ensureError(original)).toBe(original)
  })

  test("wraps a thrown string as the message and keeps the value as cause", () => {
    const error = ensureError("plain string")
    expect(error).toBeInstanceOf(PlainError)
    expect(error.message).toBe("plain string")
    expect(error.cause).toBe("plain string")
  })

  test("wraps a non-string, non-Error value with a generic message", () => {
    const value = { code: 42 }
    const error = ensureError(value)
    expect(error.message).toBe("Unknown error thrown")
    expect(error.cause).toBe(value)
  })
})

describe("getErrorMessage", () => {
  test("reads the message of an Error", () => {
    expect(getErrorMessage(new Error("hi"))).toBe("hi")
  })

  test("returns a string value directly", () => {
    expect(getErrorMessage("literal")).toBe("literal")
  })

  test("falls back for unknown shapes", () => {
    expect(getErrorMessage(123)).toBe("Unknown error")
  })
})

describe("createErrorSnapshot", () => {
  test("reads standard and enumerable error fields without invoking accessors", () => {
    let invoked = false
    const error = Object.assign(new Error("boom"), { status: 503 })
    Object.defineProperty(error, "secret", {
      enumerable: true,
      get() {
        invoked = true
        return "live-secret"
      },
    })

    expect(createErrorSnapshot(error)).toMatchObject({
      name: "Error",
      message: "boom",
      status: 503,
      secret: "[Getter]",
    })
    expect(invoked).toBe(false)
  })

  test("surfaces standard accessors without invoking them", () => {
    let invoked = false
    const error = new Error("boom")
    Object.defineProperty(error, "message", {
      get() {
        invoked = true
        throw new Error("accessed")
      },
    })

    expect(createErrorSnapshot(error).message).toBe("[Getter]")
    expect(invoked).toBe(false)
  })

  test("preserves the structural fields of a non-error thrown value as an inert copy", () => {
    const thrown = { kind: "http", status: 401, token: "live-secret" }

    const snapshot = createErrorSnapshot(thrown)
    expect(snapshot).not.toBe(thrown)
    expect(snapshot).toMatchObject({ kind: "http", status: 401, token: "live-secret" })
    // A structural value still carries the required snapshot shape for downstream redaction.
    expect(snapshot.name).toBe("PlainError")
    expect(snapshot.message).toBe("Unknown error thrown")
  })

  test("normalizes a primitive thrown value to a generic shape", () => {
    expect(createErrorSnapshot("boom")).toEqual({ name: "PlainError", message: "boom" })
    expect(createErrorSnapshot(42)).toEqual({
      name: "PlainError",
      message: "Unknown error thrown",
    })
  })

  test("copies nested fields inertly so no toJSON or function is retained", () => {
    let invoked = false
    const error = Object.assign(new Error("boom"), {
      context: {
        toJSON() {
          invoked = true
          return "live-secret"
        },
        handler: () => "live-secret",
        user: { id: 7 },
      },
    })

    const snapshot = createErrorSnapshot(error)
    const context = snapshot.context as Record<string, unknown>
    expect(context.toJSON).toBe("[Function]")
    expect(context.handler).toBe("[Function]")
    expect(context.user).toEqual({ id: 7 })
    // Serializing the "safe" snapshot must not execute the original nested hook.
    JSON.stringify(snapshot)
    expect(invoked).toBe(false)
  })

  test("copies array fields and a nested cause inertly", () => {
    const cause = Object.assign(new Error("root"), { fn: () => "x" })
    const error = Object.assign(new Error("boom"), { tags: ["a", { fn: () => "y" }] }, { cause })

    const snapshot = createErrorSnapshot(error)
    const tags = snapshot.tags as unknown[]
    expect(tags[0]).toBe("a")
    expect((tags[1] as Record<string, unknown>).fn).toBe("[Function]")
    const snapshotCause = snapshot.cause as Record<string, unknown>
    expect(snapshotCause.name).toBe("Error")
    expect(snapshotCause.message).toBe("root")
    expect(snapshotCause.fn).toBe("[Function]")
  })

  test("degrades gracefully when an object cannot be enumerated", () => {
    const proxy = new Proxy(Object.assign(new Error("boom"), { hostile: true }), {
      ownKeys() {
        throw new Error("blocked")
      },
    })

    const snapshot = createErrorSnapshot(proxy)
    expect(snapshot.name).toBe("Error")
    expect(snapshot.message).toBe("boom")
    expect(snapshot.hostile).toBeUndefined()
  })

  test("guards reference cycles and unbounded depth", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const error = Object.assign(new Error("boom"), { cyclic })

    const snapshot = createErrorSnapshot(error)
    expect((snapshot.cyclic as Record<string, unknown>).self).toBe("[Circular]")

    let deep: Record<string, unknown> = {}
    const root = deep
    for (let i = 0; i < 12; i += 1) {
      const next: Record<string, unknown> = {}
      deep.next = next
      deep = next
    }
    expect(
      JSON.stringify(createErrorSnapshot(Object.assign(new Error("boom"), { root }))),
    ).toContain("[MaxDepth]")
  })
})
