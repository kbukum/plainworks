import { describe, expect, it } from "vitest"
import { formatAxeViolations } from "./axe"

describe("formatAxeViolations", () => {
  it("names the rule, its help, and every failing target", () => {
    expect(
      formatAxeViolations([
        {
          id: "color-contrast",
          help: "Elements must meet minimum color contrast ratio thresholds",
          nodes: [{ target: ["main", "p.muted"] }, { target: ["#save"] }],
        },
        { id: "target-size", help: "All touch targets must be 24px large", nodes: [] },
      ]),
    ).toBe(
      [
        "color-contrast: Elements must meet minimum color contrast ratio thresholds — main p.muted, #save",
        "target-size: All touch targets must be 24px large — (no target)",
      ].join("\n"),
    )
  })
})
