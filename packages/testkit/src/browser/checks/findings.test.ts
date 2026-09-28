import { describe, expect, it } from "vitest"
import { applyAllowances, capFindingsPerCheck, type Finding } from "./findings"

const findings: readonly Finding[] = [
  { check: "axe", message: "color-contrast: Elements must meet contrast — .badge" },
  { check: "axe", message: "target-size: Touch target too small — .chip" },
  { check: "runtime", message: "console: Failed to load resource: status of 500" },
]

describe("applyAllowances", () => {
  it("keeps every finding a failure when nothing is allowed", () => {
    expect(applyAllowances(findings, [])).toEqual({ failures: findings, allowed: [] })
  })

  it("moves a matching finding to the allowed list with its reason", () => {
    const result = applyAllowances(findings, [
      { check: "runtime", match: /status of 500/, reason: "the error state provokes a 500" },
    ])
    expect(result.failures.map((finding) => finding.check)).toEqual(["axe", "axe"])
    expect(result.allowed).toEqual([
      {
        check: "runtime",
        message: "console: Failed to load resource: status of 500",
        reason: "the error state provokes a 500",
      },
    ])
  })

  it("allows every finding of a check when the allowance has no pattern", () => {
    const result = applyAllowances(findings, [{ check: "axe", reason: "third-party widget" }])
    expect(result.failures.map((finding) => finding.check)).toEqual(["runtime"])
    expect(result.allowed).toHaveLength(2)
  })

  it("never lets an allowance for one check hide a finding of another", () => {
    const result = applyAllowances(findings, [
      { check: "reflow", match: /contrast/, reason: "wrong check on purpose" },
    ])
    expect(result.failures).toEqual(findings)
  })
})

describe("capFindingsPerCheck", () => {
  it("keeps the first findings of each check and counts the rest", () => {
    const many = [
      ...Array.from({ length: 4 }, (_, index): Finding => ({ check: "axe", message: `a${index}` })),
      { check: "runtime", message: "boom" } satisfies Finding,
    ]
    expect(capFindingsPerCheck(many, 2)).toEqual([
      { check: "axe", message: "a0" },
      { check: "axe", message: "a1" },
      { check: "runtime", message: "boom" },
      { check: "axe", message: "…and 2 more axe findings" },
    ])
  })

  it("leaves a short list alone", () => {
    expect(capFindingsPerCheck(findings)).toEqual(findings)
  })
})
