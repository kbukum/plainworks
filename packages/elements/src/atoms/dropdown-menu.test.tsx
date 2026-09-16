// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/atoms/dropdown-menu"

afterEach(cleanup)

function labelPortalLandmark(name: string) {
  const portal = document.querySelector("[data-base-ui-portal]")
  expect(portal).toBeTruthy()

  portal?.setAttribute("role", "region")
  portal?.setAttribute("aria-label", name)

  return () => {
    portal?.removeAttribute("role")
    portal?.removeAttribute("aria-label")
  }
}

function Example({ onArchive = () => undefined }: { onArchive?: () => void }) {
  return (
    <main>
      <DropdownMenu>
        <DropdownMenuTrigger>Project actions</DropdownMenuTrigger>
        <DropdownMenuContent aria-label="Project actions">
          <DropdownMenuItem onClick={onArchive}>Archive project</DropdownMenuItem>
          <DropdownMenuItem>Share project</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </main>
  )
}

describe("DropdownMenu", () => {
  it("exposes the trigger as a named button and keeps the menu closed by default", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "Project actions" })).toBeTruthy()
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("opens on trigger click with named menu items and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Project actions" }))

    expect(await screen.findByRole("menu")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Archive project" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Share project" })).toBeTruthy()
    const restorePortal = labelPortalLandmark("Project actions layer")
    try {
      await expectNoAxeViolations(document.body)
    } finally {
      restorePortal()
    }
  })

  it("opens from the keyboard and closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Project actions" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("menu")).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("moves through items with arrow keys and closes after selecting an item", async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn()
    render(<Example onArchive={onArchive} />)

    await user.click(screen.getByRole("button", { name: "Project actions" }))
    expect(await screen.findByRole("menu")).toBeTruthy()
    const archive = screen.getByRole("menuitem", { name: "Archive project" })
    const share = screen.getByRole("menuitem", { name: "Share project" })

    await user.keyboard("{ArrowDown}")
    await waitFor(() => expect(archive).toBe(document.activeElement))
    await user.keyboard("{ArrowDown}")
    await waitFor(() => expect(share).toBe(document.activeElement))
    await user.keyboard("{ArrowUp}")
    await waitFor(() => expect(archive).toBe(document.activeElement))
    await user.keyboard("{Enter}")

    expect(onArchive).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
