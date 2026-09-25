// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Kbd, KbdGroup } from "@/shadcn/kbd"

afterEach(cleanup)

function Example() {
  return (
    <p>
      Save with{" "}
      <KbdGroup data-testid="combo">
        <Kbd>⌘</Kbd>
        <Kbd>S</Kbd>
      </KbdGroup>
    </p>
  )
}

describe("Kbd", () => {
  it("renders each key and the group as kbd elements", () => {
    render(<Example />)
    const group = screen.getByTestId("combo")
    expect(group.tagName).toBe("KBD")
    const keys = group.querySelectorAll("kbd")
    expect(keys.length).toBe(2)
    expect(screen.getByText("S").tagName).toBe("KBD")
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
