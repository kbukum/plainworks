// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/atoms/sheet"

afterEach(cleanup)

function Example() {
  return (
    <Sheet>
      <SheetTrigger>Open preferences</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notification preferences</SheetTitle>
          <SheetDescription>Choose how product updates reach you.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose>Done</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

describe("Sheet", () => {
  it("exposes the trigger as a button and hides the sheet until opened", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "Open preferences" })).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens on trigger click with an accessible name and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Open preferences" }))

    const sheet = await screen.findByRole("dialog", { name: "Notification preferences" })
    expect(sheet.getAttribute("aria-labelledby")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Notification preferences" })).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it("opens from the keyboard and closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Open preferences" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("dialog", { name: "Notification preferences" })).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes when a close control is activated", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Open preferences" }))
    expect(await screen.findByRole("dialog", { name: "Notification preferences" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
