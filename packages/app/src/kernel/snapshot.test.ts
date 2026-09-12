import { describe, expect, it } from "vitest"
import { AppConfigError } from "../errors"
import type { AnyCapability } from "./capability"
import {
  deserializeSnapshot,
  resolveCapabilities,
  serializeSnapshot,
  snapshotFor,
} from "./snapshot"

function themeCapability(): AnyCapability {
  return {
    id: "theme",
    resolve: (ctx) => ({
      className: ctx.headers.get("cookie")?.includes("theme=dark") ? "dark" : "light",
    }),
  }
}

const context = (cookie: string) => ({ headers: new Headers({ cookie }) })

describe("resolveCapabilities", () => {
  it("collects each resolver's output under its capability id", async () => {
    const snapshot = await resolveCapabilities([themeCapability()], context("theme=dark"))
    expect(snapshot.capabilities).toEqual({ theme: { className: "dark" } })
  })

  it("omits capabilities that have no server resolver", async () => {
    const noResolver: AnyCapability = { id: "toasts" }
    const snapshot = await resolveCapabilities(
      [themeCapability(), noResolver],
      context("theme=dark"),
    )
    expect(Object.keys(snapshot.capabilities)).toEqual(["theme"])
  })

  it("resolves independent capabilities concurrently", async () => {
    const order: string[] = []
    let releaseSlow: () => void = () => {}
    const gate = new Promise<void>((release) => {
      releaseSlow = release
    })
    let slowStarted: () => void = () => {}
    const slowHasStarted = new Promise<void>((started) => {
      slowStarted = started
    })
    const slow: AnyCapability = {
      id: "slow",
      resolve: async () => {
        slowStarted()
        await gate
        order.push("slow")
        return 1
      },
    }
    const fast: AnyCapability = {
      id: "fast",
      resolve: async () => {
        order.push("fast")
        return 2
      },
    }
    const done = resolveCapabilities([slow, fast], context(""))
    // `fast` completes while `slow` is parked at the gate — proves concurrency without a wall
    // clock.
    await slowHasStarted
    expect(order).toEqual(["fast"])
    releaseSlow()
    await done
    expect(order).toEqual(["fast", "slow"])
  })

  it("runs no resolver body when the signal is already aborted", async () => {
    let invoked = false
    const capability: AnyCapability = {
      id: "eager",
      resolve: () => {
        invoked = true
        return 1
      },
    }
    const aborted = new AbortController()
    aborted.abort()
    await expect(
      resolveCapabilities([capability], { headers: new Headers(), signal: aborted.signal }),
    ).rejects.toThrow()
    // The pre-aborted signal short-circuits before the resolver is ever called.
    expect(invoked).toBe(false)
  })

  it("rejects when the signal aborts mid-flight, even if a resolver never cooperates", async () => {
    const controller = new AbortController()
    let started: () => void = () => {}
    const hasStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    // A non-cooperative resolver that ignores the signal and never settles on its own.
    const stalled: AnyCapability = {
      id: "stalled",
      resolve: () => {
        started()
        return new Promise<never>(() => {})
      },
    }
    const done = resolveCapabilities([stalled], {
      headers: new Headers(),
      signal: controller.signal,
    })
    await hasStarted
    controller.abort()
    // `raceAbort` bounds the stalled resolver: the whole resolve rejects instead of hanging.
    await expect(done).rejects.toThrow()
  })
})

describe("serialize/deserialize round-trip", () => {
  it("survives a round-trip through the wire", async () => {
    const snapshot = await resolveCapabilities([themeCapability()], context("theme=dark"))
    const revived = deserializeSnapshot(serializeSnapshot(snapshot))
    expect(revived).toEqual(snapshot)
  })

  it("rejects malformed JSON with a typed error", () => {
    expect(() => deserializeSnapshot("{not json")).toThrow(AppConfigError)
  })

  it("rejects a well-formed-JSON but wrong-shape snapshot", () => {
    expect(() => deserializeSnapshot(JSON.stringify({ nope: true }))).toThrow(AppConfigError)
  })

  it("rejects an array-valued capabilities field", () => {
    expect(() => deserializeSnapshot(JSON.stringify({ capabilities: [] }))).toThrow(AppConfigError)
  })

  it("escapes HTML-hostile characters so a resolved value cannot break out of a <script>", () => {
    const serialized = serializeSnapshot({ capabilities: { note: "</script><b>x</b>" } })
    expect(serialized).not.toContain("</script>")
    expect(serialized).toContain("\\u003c/script\\u003e")
    // The escaped form still parses back to the original value — escaping is lossless.
    expect(deserializeSnapshot(serialized)).toEqual({
      capabilities: { note: "</script><b>x</b>" },
    })
  })

  it("throws a typed error when a resolved value is not JSON-serializable", () => {
    // A top-level non-JSON value makes `JSON.stringify` return undefined — surfaced, not swallowed.
    expect(() =>
      serializeSnapshot(undefined as unknown as Parameters<typeof serializeSnapshot>[0]),
    ).toThrow(AppConfigError)
    // A nested function/undefined/symbol would be silently dropped by raw JSON, turning a resolved
    // capability into an absent client slice — the replacer rejects it instead of corrupting
    // hydration.
    for (const bad of [() => 1, undefined, Symbol("x"), 1n]) {
      expect(() =>
        serializeSnapshot({ capabilities: { bad } } as unknown as Parameters<
          typeof serializeSnapshot
        >[0]),
      ).toThrow(AppConfigError)
    }
    // A native `TypeError` (a circular reference) is wrapped as the typed error, never leaked raw.
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => serializeSnapshot({ capabilities: { circular } })).toThrow(AppConfigError)
  })
})

describe("snapshotFor", () => {
  it("reads a capability's untrusted slice, or undefined when absent", async () => {
    const snapshot = await resolveCapabilities([themeCapability()], context("theme=dark"))
    expect(snapshotFor(snapshot, "theme")).toEqual({ className: "dark" })
    expect(snapshotFor(snapshot, "missing")).toBeUndefined()
  })

  it("returns undefined for an inherited property name, never Object.prototype", () => {
    const snapshot = { capabilities: {} }
    expect(snapshotFor(snapshot, "toString")).toBeUndefined()
    expect(snapshotFor(snapshot, "constructor")).toBeUndefined()
  })
})
