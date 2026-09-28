import { describe, expect, it } from "vitest"
import { ReleaseToolError } from "../error"
import type { PublishableWorkspace } from "../workspace"
import { assertPublishOrder, orderForPublish } from "./order"

function workspace(name: string, deps: readonly string[] = []): PublishableWorkspace {
  return { dir: `packages/${name}`, name, version: "1.0.0", deps }
}

describe("orderForPublish", () => {
  it("puts each package after every publishable package it depends on", () => {
    const set = [
      workspace("ui", ["theme", "std", "react"]),
      workspace("theme", ["std"]),
      workspace("std"),
      workspace("app", ["ui"]),
    ]
    expect(orderForPublish(set).map((w) => w.name)).toEqual(["std", "theme", "ui", "app"])
  })

  it("breaks ties by name so the order is stable", () => {
    const set = [workspace("b"), workspace("c"), workspace("a")]
    expect(orderForPublish(set).map((w) => w.name)).toEqual(["a", "b", "c"])
  })

  it("fails on a dependency cycle and names it", () => {
    const set = [workspace("a", ["b"]), workspace("b", ["a"])]
    expect(() => orderForPublish(set)).toThrow(new ReleaseToolError("Dependency cycle: a → b → a"))
  })
})

describe("assertPublishOrder", () => {
  const set = [workspace("std"), workspace("http", ["std"])]

  it("accepts the derived order", () => {
    expect(() => assertPublishOrder(set, orderForPublish(set))).not.toThrow()
  })

  it("fails when a workspace is missing or extra", () => {
    expect(() => assertPublishOrder(set, [workspace("std")])).toThrow(/missing: http; extra: none/)
    const extra = [...orderForPublish(set), workspace("ghost")]
    expect(() => assertPublishOrder(set, extra)).toThrow(/missing: none; extra: ghost/)
  })

  it("fails when a package comes before its dependency", () => {
    const reversed = [workspace("http", ["std"]), workspace("std")]
    expect(() => assertPublishOrder(set, reversed)).toThrow(
      "http is published before its dependency std.",
    )
  })
})
