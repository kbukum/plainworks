import { describe, expect, it } from "vitest"
import { AppConfigError } from "../errors"
import { createApp } from "./app"
import { defineCapability } from "./capability"

const context = { headers: new Headers({ cookie: "mode=dark" }) }

describe("createApp", () => {
  it("resolves every capability into one snapshot", async () => {
    const app = createApp({
      capabilities: [
        defineCapability({ id: "mode", resolve: () => "dark" }),
        defineCapability({ id: "client-only" }),
      ],
    })
    await expect(app.resolve(context)).resolves.toEqual({ capabilities: { mode: "dark" } })
  })

  it("rejects a duplicate capability id", () => {
    expect(() => createApp({ capabilities: [{ id: "a" }, { id: "a" }] })).toThrow(AppConfigError)
  })

  it("joins the root classes each capability derives from its resolved slice", async () => {
    const app = createApp({
      capabilities: [
        defineCapability({ id: "mode", resolve: () => "dark", htmlClass: (mode) => mode }),
        defineCapability({ id: "accent", resolve: () => "teal", htmlClass: (a) => ` theme-${a} ` }),
        defineCapability({ id: "empty", resolve: () => "", htmlClass: () => "" }),
        defineCapability({ id: "plain", resolve: () => 1 }),
      ],
    })
    const snapshot = await app.resolve(context)
    expect(app.htmlClass(snapshot)).toBe("dark theme-teal")
  })

  it("derives no class for a capability whose slice is absent", () => {
    const app = createApp({
      capabilities: [defineCapability({ id: "mode", resolve: () => "dark", htmlClass: () => "x" })],
    })
    expect(app.htmlClass({ capabilities: {} })).toBe("")
  })

  it.each([
    ["an attribute break-out", 'en" onmouseover="alert(1)'],
    ["markup", "<script>"],
    ["an entity", "a&amp;b"],
  ])("rejects a class token carrying %s", (_label, token) => {
    const app = createApp({
      capabilities: [defineCapability({ id: "locale", resolve: () => token, htmlClass: (t) => t })],
    })
    expect(() => app.htmlClass({ capabilities: { locale: token } })).toThrow(AppConfigError)
  })
})
