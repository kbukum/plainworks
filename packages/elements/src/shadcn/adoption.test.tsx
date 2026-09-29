// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "@/shadcn/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shadcn/card"
import { Input } from "@/shadcn/input"

// Proves separately vendored atoms compose into an accessible form, the way a consumer combines
// them à la carte. The packed exports map is proven by `check-packaging`.
describe("atom composition", () => {
  it("renders the à-la-carte recipe accessibly", async () => {
    const { container } = render(
      <Card aria-labelledby="adoption-title">
        <CardHeader>
          <CardTitle id="adoption-title">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <label htmlFor="adoption-name">Display name</label>
          <Input id="adoption-name" />
          <Button>Save</Button>
        </CardContent>
      </Card>,
    )

    expect(screen.getByText("Profile")).toBeDefined()
    expect(screen.getByRole("textbox", { name: "Display name" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined()
    await expectNoAxeViolations(container)
  })
})
