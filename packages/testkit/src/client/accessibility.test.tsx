// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { expectNoAxeViolations, renderA11y } from "./accessibility"

describe("accessibility helpers", () => {
  it("renders accessible markup and reports no violations", async () => {
    const result = renderA11y(<button type="button">Save</button>)
    await expectNoAxeViolations(result.container)
  })

  it("rejects inaccessible markup", async () => {
    const result = renderA11y(<button type="button" />)
    await expect(expectNoAxeViolations(result.container)).rejects.toThrow("button-name")
  })
})
