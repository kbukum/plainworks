// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Button } from "@/shadcn/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/shadcn/item"

afterEach(cleanup)

function Example() {
  return (
    <ItemGroup aria-label="Members">
      <Item role="listitem">
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
  it("exposes ItemGroup as a named list whose items are listitems", () => {
    render(<Example />)
    // Upstream ItemGroup is `role="list"`, so call sites mark each Item as a listitem.
    const list = screen.getByRole("list", { name: "Members" })
    expect(list.querySelectorAll('[role="listitem"]')).toHaveLength(1)
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
