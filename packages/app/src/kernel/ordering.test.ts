import { describe, expect, it } from "vitest"
import { AppConfigError } from "../errors"
import { type OrderedNode, orderCapabilities } from "./ordering"

function capability(id: string, dependsOn?: readonly string[]): OrderedNode {
  return dependsOn === undefined ? { id } : { id, dependsOn }
}

describe("orderCapabilities", () => {
  it("mounts a dependency outermost — before every capability that declares it", () => {
    // auth depends on query, so query must wrap auth (lower index = outermost wrapper).
    const ordered = orderCapabilities([capability("auth", ["query"]), capability("query")])
    expect(ordered.map((entry) => entry.id)).toEqual(["query", "auth"])
  })

  it("preserves registration order when nothing declares a dependency", () => {
    const ordered = orderCapabilities([capability("a"), capability("b"), capability("c")])
    expect(ordered.map((entry) => entry.id)).toEqual(["a", "b", "c"])
  })

  it("breaks ties by registration order so the tree is deterministic", () => {
    // Both depend on `base`; neither depends on the other, so registration order decides.
    const ordered = orderCapabilities([
      capability("base"),
      capability("second", ["base"]),
      capability("first", ["base"]),
    ])
    expect(ordered.map((entry) => entry.id)).toEqual(["base", "second", "first"])
  })

  it("resolves a transitive chain into dependency order", () => {
    const ordered = orderCapabilities([
      capability("c", ["b"]),
      capability("a"),
      capability("b", ["a"]),
    ])
    expect(ordered.map((entry) => entry.id)).toEqual(["a", "b", "c"])
  })

  it("keeps newly-unblocked capabilities in registration order among already-ready ones", () => {
    // `c` is independent (ready from the start); unblocking `b` (a lower index) must slot it
    // *before* `c`, so the tie-break by registration index holds as the ready set grows.
    const ordered = orderCapabilities([capability("a"), capability("b", ["a"]), capability("c")])
    expect(ordered.map((entry) => entry.id)).toEqual(["a", "b", "c"])
  })

  it("rejects a dependency on an unknown capability with a typed config error", () => {
    expect(() => orderCapabilities([capability("auth", ["query"])])).toThrow(AppConfigError)
  })

  it("rejects a cyclic dependency with a typed config error", () => {
    expect(() => orderCapabilities([capability("a", ["b"]), capability("b", ["a"])])).toThrow(
      AppConfigError,
    )
  })

  it("rejects a self-dependency as a cycle", () => {
    expect(() => orderCapabilities([capability("a", ["a"])])).toThrow(AppConfigError)
  })

  it("names only the cycle members, not capabilities merely blocked behind the cycle", () => {
    // `a → b → a` cycles; `c → b` is stranded behind it but is not itself on the cycle.
    expect(() =>
      orderCapabilities([capability("a", ["b"]), capability("b", ["a"]), capability("c", ["b"])]),
    ).toThrow(/among: a, b\./)
  })

  it("rejects a duplicate id with a typed config error", () => {
    expect(() => orderCapabilities([capability("theme"), capability("theme")])).toThrow(
      AppConfigError,
    )
  })

  it("leaves the input array untouched (returns a new ordered array)", () => {
    const input = [capability("b", ["a"]), capability("a")]
    const ordered = orderCapabilities(input)
    expect(input.map((entry) => entry.id)).toEqual(["b", "a"])
    expect(ordered).not.toBe(input)
  })
})
