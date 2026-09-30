// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DescriptionItem, DescriptionList } from "./description-list"

afterEach(cleanup)

describe("DescriptionList", () => {
  it("pairs each term with its value", async () => {
    const { container } = render(
      <DescriptionList>
        <DescriptionItem term="Email">ada@example.com</DescriptionItem>
        <DescriptionItem term="Team">Research</DescriptionItem>
      </DescriptionList>,
    )
    const terms = screen.getAllByRole("term").map((term) => term.textContent)
    const values = screen.getAllByRole("definition").map((value) => value.textContent)
    expect(terms).toEqual(["Email", "Team"])
    expect(values).toEqual(["ada@example.com", "Research"])
    await expectNoAxeViolations(container)
  })

  it("adapts to its container, not the viewport", () => {
    const { container } = render(
      <DescriptionList>
        <DescriptionItem term="Email">ada@example.com</DescriptionItem>
      </DescriptionList>,
    )
    const root = container.querySelector('[data-slot="description-list"]')
    expect(root?.className).toContain("@container/description-list")
    expect(root?.querySelector("dl")?.className).toContain("@sm/description-list:grid-cols-2")
  })
})
