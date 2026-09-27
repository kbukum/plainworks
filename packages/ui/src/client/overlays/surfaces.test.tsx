// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Drawer } from "./drawer"
import { Modal } from "./modal"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

  it("scrolls a tall body inside the dialog while the title and actions stay pinned", async () => {
    const user = userEvent.setup()
    render(
      <Modal trigger="Open" title="Titled" footer={<button type="button">Save</button>}>
        <p>modal body</p>
      </Modal>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    const dialog = screen.getByRole("dialog", { name: "Titled" })
    const body = screen.getByText("modal body").closest("[data-slot='modal-body']")
    expect(dialog.className).toContain("overflow-hidden")
    expect(body?.className).toContain("overflow-y-auto")
    expect(body?.contains(screen.getByRole("heading", { name: "Titled" }))).toBe(false)
    expect(body?.contains(screen.getByRole("button", { name: "Save" }))).toBe(false)
  })

  it("lets the keyboard reach a body that overflows, as a region named by the title", async () => {
    // jsdom lays nothing out, so the overflow is stubbed: content taller than the capped body.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300)
    const user = userEvent.setup()
    render(
      <Modal trigger="Open" title="Titled">
        <p>modal body</p>
      </Modal>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    const region = await screen.findByRole("region", { name: "Titled" })
    expect(region.tabIndex).toBe(0)
    expect(region.textContent).toBe("modal body")
    await expectNoAxeViolations(document.body)
  })

  it("keeps initial focus on the first control of an overflowing body", async () => {
    // A body holding controls is already keyboard-scrollable by moving focus through them.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300)
    const user = userEvent.setup()
    render(
      <Modal trigger="Open" title="Titled">
        <input aria-label="Name" />
      </Modal>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Name" })).toBe(document.activeElement),
    )
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("drops the body tab stop once a control arrives without a resize", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300)
    const user = userEvent.setup()
    const { rerender } = render(
      <Modal trigger="Open" title="Titled">
        <p>Loading</p>
      </Modal>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    await screen.findByRole("region", { name: "Titled" })

    rerender(
      <Modal trigger="Open" title="Titled">
        <input aria-label="Name" />
      </Modal>,
    )

    await waitFor(() => expect(screen.queryByRole("region")).toBeNull())
  })

  it("adds no tab stop to a body that fits", async () => {
    const user = userEvent.setup()
    render(
      <Modal trigger="Open" title="Titled">
        <p>modal body</p>
      </Modal>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    const body = screen.getByText("modal body").closest("[data-slot='modal-body']")
    expect(body?.hasAttribute("tabindex")).toBe(false)
    expect(screen.queryByRole("region")).toBeNull()
  })

  it("renders no body region when it has no content", async () => {
    const user = userEvent.setup()
    render(<Modal trigger="Open" title="Titled" />)
    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(
      screen.getByRole("dialog", { name: "Titled" }).querySelector("[data-slot='modal-body']"),
    ).toBeNull()
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

  it("scrolls long content inside its own body while the header stays in view", async () => {
    const user = userEvent.setup()
    render(
      <Drawer trigger="Open filters" title="Filters">
        <p>filter body</p>
      </Drawer>,
    )
    await user.click(screen.getByRole("button", { name: "Open filters" }))
    const body = screen.getByText("filter body").closest("[data-slot='drawer-body']")
    expect(body?.className).toContain("overflow-y-auto")
    expect(body?.contains(screen.getByRole("heading", { name: "Filters" }))).toBe(false)
  })

  it("lets the keyboard reach a body that overflows, as a region named by the title", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300)
    const user = userEvent.setup()
    render(
      <Drawer trigger="Open filters" title="Filters">
        <p>filter body</p>
      </Drawer>,
    )
    await user.click(screen.getByRole("button", { name: "Open filters" }))
    const region = await screen.findByRole("region", { name: "Filters" })
    expect(region.tabIndex).toBe(0)
  })

  it.each(["top", "right", "bottom", "left"] as const)(
    "bounds a %s drawer to the viewport so its body, not the page, scrolls",
    async (side) => {
      const user = userEvent.setup()
      render(
        <Drawer trigger="Open filters" title="Filters" side={side} footer="Apply">
          <p>filter body</p>
        </Drawer>,
      )
      await user.click(screen.getByRole("button", { name: "Open filters" }))
      expect(screen.getByRole("dialog", { name: "Filters" }).className).toContain("max-h-dvh")
    },
  )

  it("renders no body region when it has no content", async () => {
    const user = userEvent.setup()
    render(<Drawer trigger="Open notes" title="Notes" />)
    await user.click(screen.getByRole("button", { name: "Open notes" }))
    expect(
      screen.getByRole("dialog", { name: "Notes" }).querySelector("[data-slot='drawer-body']"),
    ).toBeNull()
  })
})
