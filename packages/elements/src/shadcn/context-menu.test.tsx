// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shadcn/context-menu"

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

function Example({ onRename = () => undefined }: { onRename?: () => void }) {
  return (
    <main>
      <ContextMenu>
        <ContextMenuTrigger role="button" tabIndex={0}>
          Project card
        </ContextMenuTrigger>
        <ContextMenuContent aria-label="Project card actions">
          <ContextMenuItem onClick={onRename}>Rename project</ContextMenuItem>
          <ContextMenuItem>Delete project</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </main>
  )
}

describe("ContextMenu", () => {
  it("exposes a named trigger and keeps the menu closed by default", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "Project card" })).toBeTruthy()
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("opens from a right-click with named menu items and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Project card" })

    await user.pointer({ target: trigger, keys: "[MouseRight]" })

    expect(await screen.findByRole("menu")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Rename project" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Delete project" })).toBeTruthy()
    const restorePortal = labelPortalLandmark("Project card menu layer")
    try {
      await expectNoAxeViolations(document.body)
    } finally {
      restorePortal()
    }
  })

  it("closes on Escape after opening from the pointer", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.pointer({
      target: screen.getByRole("button", { name: "Project card" }),
      keys: "[MouseRight]",
    })
    expect(await screen.findByRole("menu")).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("focuses the trigger from the keyboard before opening by pointer", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Project card" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)
  })

  it("moves through items with arrow keys and closes after selecting an item", async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(<Example onRename={onRename} />)
    const trigger = screen.getByRole("button", { name: "Project card" })

    await user.tab()
    expect(trigger).toBe(document.activeElement)

    await user.pointer({
      target: trigger,
      keys: "[MouseRight]",
    })
    expect(await screen.findByRole("menu")).toBeTruthy()
    expect(await screen.findByRole("menuitem", { name: "Rename project" })).toBeTruthy()
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{ArrowUp}")
    await user.keyboard("{Enter}")

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
