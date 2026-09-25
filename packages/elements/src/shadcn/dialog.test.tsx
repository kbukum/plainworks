// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shadcn/dialog"

afterEach(cleanup)

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update your display name.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe("Dialog", () => {
  it("exposes the trigger as a button and hides the dialog until opened", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "Open dialog" })).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens on trigger click with an accessible name and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Open dialog" }))

    const dialog = await screen.findByRole("dialog")
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Edit profile" })).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it("closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Open dialog" }))
    expect(await screen.findByRole("dialog")).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes when a close control is activated", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Open dialog" }))
    expect(await screen.findByRole("dialog")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
