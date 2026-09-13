// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Button } from "@/atoms/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/atoms/item"

afterEach(cleanup)

function Example() {
  return (
    <ItemGroup aria-label="Members">
      <Item>
        <ItemMedia variant="icon" aria-hidden="true" />
        <ItemContent>
          <ItemTitle>Ada Lovelace</ItemTitle>
          <ItemDescription>Engineer</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button aria-label="Remove Ada">Remove</Button>
        </ItemActions>
      </Item>
    </ItemGroup>
  )
}

describe("Item", () => {
  it("does not expose ItemGroup as a list by default", () => {
    render(<Example />)
    // The group is a neutral container: a list role without listitem children is invalid ARIA.
    expect(screen.queryByRole("list")).toBeNull()
    expect(screen.queryByRole("listitem")).toBeNull()
  })

  it("keeps action controls reachable with accessible names", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "Remove Ada" })).toBeTruthy()
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
