// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Drawer } from "./drawer"
import { Modal } from "./modal"

afterEach(cleanup)

describe("Modal", () => {
  it("opens from its trigger with an accessible name and description", async () => {
    const user = userEvent.setup()
    render(
      <Modal
        trigger="Open settings"
        title="Settings"
        description="Manage your account."
        footer={<button type="button">Save</button>}
      >
        <p>Body</p>
      </Modal>,
    )
    await user.click(screen.getByRole("button", { name: "Open settings" }))
    const dialog = screen.getByRole("dialog", { name: "Settings" })
    expect(dialog.textContent).toContain("Manage your account.")
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined()
    await expectNoAxeViolations(document.body)
  })

  it("reports open-state changes to a controller", async () => {
    const onOpenChange = vi.fn()
    render(
      <Modal trigger="Open" title="Titled" onOpenChange={onOpenChange}>
        body
      </Modal>,
    )
    await userEvent.setup().click(screen.getByRole("button", { name: "Open" }))
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(true)
  })

  it("composes an element trigger through render instead of nesting a button", async () => {
    const user = userEvent.setup()
    render(
      <Modal trigger={<button type="button">Open</button>} title="Titled">
        body
      </Modal>,
    )
    const triggers = screen.getAllByRole("button", { name: "Open" })
    expect(triggers).toHaveLength(1)
    expect(triggers[0]?.querySelector("button")).toBeNull()
    await user.click(triggers[0] as HTMLElement)
    expect(screen.getByRole("dialog", { name: "Titled" })).toBeDefined()
  })

  it("moves focus into the dialog when it opens (focus trap)", async () => {
    const user = userEvent.setup()
    render(
      <Modal trigger="Open" title="Titled" footer={<button type="button">Save</button>}>
        body
      </Modal>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    const dialog = screen.getByRole("dialog", { name: "Titled" })

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })

  it("dismisses on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup()
    render(
      <Modal trigger="Open" title="Titled">
        body
      </Modal>,
    )
    const trigger = screen.getByRole("button", { name: "Open" })
    await user.click(trigger)
    expect(screen.getByRole("dialog", { name: "Titled" })).toBeDefined()

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(trigger).toBe(document.activeElement))
  })

  it("dismisses on an outside click", async () => {
    const user = userEvent.setup()
    render(
      <Modal trigger="Open" title="Titled">
        body
      </Modal>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(screen.getByRole("dialog", { name: "Titled" })).toBeDefined()

    await user.click(document.body)

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})

describe("Drawer", () => {
  it("opens a labelled drawer with description and footer from the chosen edge", async () => {
    const user = userEvent.setup()
    render(
      <Drawer
        trigger="Open filters"
        title="Filters"
        description="Refine the results."
        side="left"
        footer={<button type="button">Apply</button>}
      >
        <p>filter body</p>
      </Drawer>,
    )
    await user.click(screen.getByRole("button", { name: "Open filters" }))
    const dialog = screen.getByRole("dialog", { name: "Filters" })
    expect(dialog.textContent).toContain("Refine the results.")
    expect(screen.getByRole("button", { name: "Apply" })).toBeDefined()
    await expectNoAxeViolations(document.body)
  })
})
