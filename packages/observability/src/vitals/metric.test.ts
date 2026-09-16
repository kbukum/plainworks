import { describe, expect, test } from "vitest"
import { rateWebVital, type WebVitalName } from "./metric"

describe("rateWebVital", () => {
  const cases: Array<[WebVitalName, number, string]> = [
    ["LCP", 2000, "good"],
    ["LCP", 2500, "good"],
    ["LCP", 3000, "needs-improvement"],
    ["LCP", 5000, "poor"],
    ["CLS", 0.1, "good"],
    ["CLS", 0.2, "needs-improvement"],
    ["CLS", 0.3, "poor"],
    ["INP", 200, "good"],
    ["INP", 350, "needs-improvement"],
    ["INP", 600, "poor"],
    ["FCP", 1800, "good"],
    ["TTFB", 800, "good"],
    ["TTFB", 2000, "poor"],
  ]

  test.each(cases)("rates %s of %d as %s", (name, value, expected) => {
    expect(rateWebVital(name, value)).toBe(expected)
  })
})
