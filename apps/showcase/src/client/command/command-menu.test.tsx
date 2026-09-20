// @vitest-environment jsdom

import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import type { ThemePreference } from "@plainworks/theme"
import { ThemeProvider } from "@plainworks/theme/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ToastProvider } from "../feedback"
import { RouterProvider } from "../router"
import { CommandMenu } from "./command-menu"

// cmdk measures and scrolls its list; jsdom implements neither, so both are stubbed the way the
// `command` atom's own tests do.
class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = TestResizeObserver
Element.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  installMatchMedia(false)
  window.history.pushState(null, "", "/")
})
afterEach(cleanup)

function renderMenu(
  theme: ThemePreference = { mode: "light", colorScheme: "indigo" },
  setError?: unknown,
) {
  const source = fakeStateSource<ThemePreference>({ initial: theme, setError })
  render(
    <ThemeProvider source={source} initialTheme={theme}>
      <ToastProvider>
        <RouterProvider initialPath="/">
          <CommandMenu />
        </RouterProvider>
      </ToastProvider>
    </ThemeProvider>,
  )
  return { source }
}

async function openWithHotkey(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.keyboard("{Meta>}k{/Meta}")
  return screen.findByRole("combobox", { name: "Command menu" })
}

describe("command palette", () => {
  it("opens on the header affordance and lists navigation for every section", async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole("button", { name: /Search sections and actions/ }))

    expect(await screen.findByRole("combobox", { name: "Command menu" })).toBeDefined()
    expect(screen.getByRole("option", { name: /Overview/ })).toBeDefined()
    expect(screen.getByRole("option", { name: /Settings/ })).toBeDefined()
  })

  it("opens on ⌘K and toggles closed on a second press", async () => {
    const user = userEvent.setup()
    renderMenu()

    await openWithHotkey(user)
    await user.keyboard("{Meta>}k{/Meta}")

    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Command menu" })).toBeNull())
  })

  it("navigates to a section on select and closes", async () => {
    const user = userEvent.setup()
    renderMenu()

    await openWithHotkey(user)
    await user.click(screen.getByRole("option", { name: /Tasks/ }))

    expect(window.location.pathname).toBe("/tasks")
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Command menu" })).toBeNull())
  })

  it("filters options by query", async () => {
    const user = userEvent.setup()
    renderMenu()

    const input = await openWithHotkey(user)
    await user.type(input, "settings")

    expect(screen.getByRole("option", { name: /Settings/ })).toBeDefined()
    expect(screen.queryByRole("option", { name: /Overview/ })).toBeNull()
  })

  it("runs the theme action, flipping mode and confirming with a toast", async () => {
    const user = userEvent.setup()
    const { source } = renderMenu({ mode: "light", colorScheme: "indigo" })

    await openWithHotkey(user)
    await user.click(screen.getByRole("option", { name: /Switch to dark mode/ }))

    await waitFor(() => expect(source.current?.mode).toBe("dark"))
    expect(await screen.findByText("Switched to dark mode")).toBeDefined()
  })

  it("reports a theme persistence failure without showing success", async () => {
    const user = userEvent.setup()
    const { source } = renderMenu(
      { mode: "light", colorScheme: "indigo" },
      new Error("storage unavailable"),
    )

    await openWithHotkey(user)
    await user.click(screen.getByRole("option", { name: /Switch to dark mode/ }))

    expect(await screen.findByText("Could not switch to dark mode")).toBeDefined()
    expect(screen.queryByText("Switched to dark mode")).toBeNull()
    expect(source.current?.mode).toBe("light")
  })

  it("has no accessibility violations while open", async () => {
    const user = userEvent.setup()
    renderMenu()
    await openWithHotkey(user)
    await expectNoAxeViolations(document.body)
  })
})
