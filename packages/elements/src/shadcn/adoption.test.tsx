// @vitest-environment jsdom

import { Button } from "@plainworks/elements/button"
import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { Input } from "@plainworks/elements/input"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

// Proves the published per-atom subpaths resolve and compose accessibly — the exports map and the
// `"use client"` per-atom entry, exercised the way a consumer imports them à la carte.
describe("published atom subpaths", () => {
  it("renders the à-la-carte recipe accessibly through the published subpaths", async () => {
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
