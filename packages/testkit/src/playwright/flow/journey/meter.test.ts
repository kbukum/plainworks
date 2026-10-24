import { describe, expect, it } from "vitest"
import { createJourneyMeter } from "./meter"

describe("createJourneyMeter", () => {
  it("counts the start page once and each later change of path, not of query or hash", () => {
    const meter = createJourneyMeter({ strict: false })
    meter.view("https://app.test/ignored-before-start")
    meter.start("https://app.test/projects")
    meter.view("https://app.test/projects?tab=runs")
    meter.view("https://app.test/projects#top")
    meter.view("https://app.test/datasets")
    meter.view("https://app.test/projects")
    expect(meter.metrics().views).toBe(3)
  })

  it("does not count a blank start page", () => {
    const meter = createJourneyMeter({ strict: false })
    meter.start("about:blank")
    expect(meter.metrics().views).toBe(0)
    meter.view("https://app.test/")
    expect(meter.metrics().views).toBe(1)
  })

  it("lets a first visit define where the journey starts", () => {
    const meter = createJourneyMeter({ strict: true })
    meter.start("https://app.test/home")
    meter.beginVisit()
    meter.view("https://app.test/datasets")
    expect(meter.metrics().views).toBe(1)
  })

  it("rejects a visit after the journey has acted, in a strict journey", () => {
    const meter = createJourneyMeter({ strict: true })
    meter.start("https://app.test/")
    meter.record("activations")
    expect(() => meter.beginVisit()).toThrow(/first step/)
  })

  it("rejects a second visit in a strict journey", () => {
    const meter = createJourneyMeter({ strict: true })
    meter.beginVisit()
    expect(() => meter.beginVisit()).toThrow(/first step/)
  })

  it("allows a later visit in a flow that is not a budgeted journey", () => {
    const meter = createJourneyMeter({ strict: false })
    meter.start("https://app.test/")
    meter.record("activations")
    expect(() => meter.beginVisit()).not.toThrow()
  })

  it("counts each verb and every focus move", () => {
    const meter = createJourneyMeter({ strict: false })
    meter.record("typedFields")
    meter.record("picks")
    meter.record("activations")
    meter.record("activations")
    meter.moveFocus(3)
    expect(meter.metrics()).toEqual({
      views: 0,
      typedFields: 1,
      picks: 1,
      activations: 2,
      focusMoves: 3,
    })
  })

  it("finds a value typed again into another field, without reporting the value", () => {
    const meter = createJourneyMeter({ strict: false })
    meter.typed({ path: "/credentials", name: "Name" }, "  Local-Ollama ")
    meter.typed({ path: "/credentials", name: "Name" }, "local-ollama")
    meter.typed({ path: "/definitions", name: "Credential" }, "LOCAL-OLLAMA")
    const findings = meter.drainFindings()
    expect(findings).toEqual([
      {
        check: "redundant-entry",
        message: '"Credential" repeats a value already typed into "Name" on /credentials',
      },
    ])
    expect(JSON.stringify(findings)).not.toMatch(/ollama/i)
    expect(meter.drainFindings()).toEqual([])
  })

  it("ignores values too short to be a meaningful repeat", () => {
    const meter = createJourneyMeter({ strict: false })
    meter.typed({ path: "/a", name: "Min" }, "1")
    meter.typed({ path: "/a", name: "Max" }, "1")
    meter.typed({ path: "/a", name: "Note" }, "ok")
    meter.typed({ path: "/a", name: "Other" }, "OK")
    expect(meter.drainFindings()).toEqual([])
  })
})
