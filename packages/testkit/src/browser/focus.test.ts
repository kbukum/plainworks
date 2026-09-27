import { describe, expect, it } from "vitest"
import { judgeFocus } from "./focus"

describe("judgeFocus", () => {
  it("accepts a focused control with a 2 px indicator that is at least partly uncovered", () => {
    expect(
      judgeFocus({ name: "Save", indicator: { drawnBy: "page", width: 2 }, uncoveredSamples: 1 }),
    ).toEqual([])
  })

  it("reports a missing focus", () => {
    expect(judgeFocus(null)).toEqual(["no element has keyboard focus"])
  })

  it("reports an indicator thinner than 2 CSS px (WCAG 2.4.7 visible focus)", () => {
    expect(
      judgeFocus({ name: "Save", indicator: { drawnBy: "page", width: 1 }, uncoveredSamples: 9 }),
    ).toEqual(["Save: focus indicator is 1px wide, expected at least 2px"])
  })

  it("accepts the browser's own indicator on an internal control such as a date picker button", () => {
    expect(
      judgeFocus({ name: "Start date", indicator: { drawnBy: "browser" }, uncoveredSamples: 9 }),
    ).toEqual([])
  })

  it("accepts a text field's caret, which WCAG 2.4.7 names as a focus indicator", () => {
    expect(
      judgeFocus({ name: "Command menu", indicator: { drawnBy: "caret" }, uncoveredSamples: 9 }),
    ).toEqual([])
  })

  it("still reports a browser-drawn stop that other content covers", () => {
    expect(
      judgeFocus({ name: "Start date", indicator: { drawnBy: "browser" }, uncoveredSamples: 0 }),
    ).toEqual(["Start date: focused control is entirely covered by other content"])
  })

  it("reports a control entirely hidden by other content (WCAG 2.4.11 focus not obscured)", () => {
    expect(
      judgeFocus({ name: "Search", indicator: { drawnBy: "page", width: 2 }, uncoveredSamples: 0 }),
    ).toEqual(["Search: focused control is entirely covered by other content"])
  })
})
