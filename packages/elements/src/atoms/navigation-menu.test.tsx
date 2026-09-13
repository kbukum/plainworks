// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/atoms/navigation-menu"

afterEach(cleanup)

function Example() {
  return (
    <NavigationMenu aria-label="Main navigation">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavigationMenuLink href="/analytics">Analytics</NavigationMenuLink>
            <NavigationMenuLink href="/reports">Reports</NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="/docs">Docs</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

describe("NavigationMenu", () => {
  it("renders a named navigation landmark with trigger and link controls", () => {
    render(<Example />)
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Products" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Docs" })).toBeTruthy()
  })

  it("opens trigger content with named links and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByRole("button", { name: "Products" }))

    expect(await screen.findByRole("link", { name: "Analytics" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Reports" })).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it("opens from the keyboard and closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Products" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("link", { name: "Analytics" })).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("link", { name: "Analytics" })).toBeNull()
  })

  it("moves from the trigger into opened content with the keyboard", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(await screen.findByRole("link", { name: "Analytics" })).toBeTruthy()

    await user.tab()
    expect(screen.getByRole("link", { name: "Analytics" })).toBe(document.activeElement)
  })
})
