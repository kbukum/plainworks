// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/atoms/popover"

afterEach(cleanup)

function Example() {
  return (
    <Popover>
      <PopoverTrigger>Show account details</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Account details</PopoverTitle>
          <PopoverDescription>Review account status and plan information.</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  )
}

describe("Popover", () => {
  it("exposes the trigger as a button and hides the popover until opened", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "Show account details" })).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens on trigger click with an accessible name and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Show account details" }))

    const popover = await screen.findByRole("dialog", { name: "Account details" })
    expect(popover.getAttribute("aria-labelledby")).toBeTruthy()
    expect(screen.getByText("Review account status and plan information.")).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it("opens from the keyboard with Space and Enter", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Show account details" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
    await user.keyboard(" ")
    expect(await screen.findByRole("dialog", { name: "Account details" })).toBeTruthy()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()

    await user.keyboard("{Enter}")
    expect(await screen.findByRole("dialog", { name: "Account details" })).toBeTruthy()
  })

  it("closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Show account details" }))
    expect(await screen.findByRole("dialog", { name: "Account details" })).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
