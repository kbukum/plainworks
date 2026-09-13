// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@/atoms/menubar"

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

function Example({ onNewFile = () => undefined }: { onNewFile?: () => void }) {
  return (
    <main>
      <Menubar aria-label="Application menu">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent aria-label="File menu">
            <MenubarItem onClick={onNewFile}>New file</MenubarItem>
            <MenubarItem>Open file</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent aria-label="Edit menu">
            <MenubarItem>Undo</MenubarItem>
            <MenubarItem>Redo</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </main>
  )
}

describe("Menubar", () => {
  it("renders a named menubar with named menu triggers", () => {
    render(<Example />)
    expect(screen.getByRole("menubar", { name: "Application menu" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "File" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy()
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("opens a menu from the keyboard with named menu items and no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const file = screen.getByRole("menuitem", { name: "File" })

    await user.tab()
    expect(file).toBe(document.activeElement)
    await user.keyboard("{Enter}")

    expect(await screen.findByRole("menu")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "New file" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Open file" })).toBeTruthy()
    const restorePortal = labelPortalLandmark("File menu layer")
    try {
      await expectNoAxeViolations(document.body)
    } finally {
      restorePortal()
    }
  })

  it("moves between top-level triggers with arrow keys", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const edit = screen.getByRole("menuitem", { name: "Edit" })

    await user.tab()
    await user.keyboard("{ArrowRight}")

    expect(edit).toBe(document.activeElement)
  })

  it("moves through menu items and closes after selecting an item", async () => {
    const user = userEvent.setup()
    const onNewFile = vi.fn()
    render(<Example onNewFile={onNewFile} />)

    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(await screen.findByRole("menu")).toBeTruthy()
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{ArrowUp}")
    await user.keyboard("{Enter}")

    expect(onNewFile).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(await screen.findByRole("menu")).toBeTruthy()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
