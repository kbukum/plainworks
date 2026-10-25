// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"
import { installLayoutApis } from "./layout"

describe("installLayoutApis", () => {
  it("gives jsdom an inert ResizeObserver and scrollIntoView", () => {
    installLayoutApis()
    const callback = vi.fn()
    const observer = new ResizeObserver(callback)
    const element = document.createElement("div")
    observer.observe(element)
    observer.unobserve(element)
    observer.disconnect()
    element.scrollIntoView()
    expect(callback).not.toHaveBeenCalled()
  })

  it("can be installed again", () => {
    installLayoutApis()
    installLayoutApis()
    expect(typeof globalThis.ResizeObserver).toBe("function")
  })

  it("refuses to run without a DOM", () => {
    const element = globalThis.Element
    Reflect.deleteProperty(globalThis, "Element")
    try {
      expect(() => installLayoutApis()).toThrow("installLayoutApis needs a DOM test environment")
    } finally {
      globalThis.Element = element
    }
  })
})
