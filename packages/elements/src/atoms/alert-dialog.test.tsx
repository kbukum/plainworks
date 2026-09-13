// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/atoms/alert-dialog"

afterEach(cleanup)

function Example() {
  return (
    <AlertDialog>
      <AlertDialogTrigger>Delete project</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete production project</AlertDialogTitle>
          <AlertDialogDescription>
            This action permanently removes the production project.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

describe("AlertDialog", () => {
  it("exposes the trigger as a button and hides the alert dialog until opened", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "Delete project" })).toBeTruthy()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("opens on trigger click with an accessible name and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Delete project" }))

    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete production project",
    })
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Delete production project" })).toBeTruthy()
    await expectNoAxeViolations(document.body)
  })

  it("opens from the keyboard and closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Delete project" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
    await user.keyboard("{Enter}")
    expect(
      await screen.findByRole("alertdialog", { name: "Delete production project" }),
    ).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("closes when the cancel control is activated", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Delete project" }))
    expect(
      await screen.findByRole("alertdialog", { name: "Delete production project" }),
    ).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})
