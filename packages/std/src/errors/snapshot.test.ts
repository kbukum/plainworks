import { describe, expect, test } from "vitest"
import { createErrorSnapshot } from "./snapshot"

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
