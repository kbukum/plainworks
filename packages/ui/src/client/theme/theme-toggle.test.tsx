// @vitest-environment jsdom

import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { ThemeProvider } from "@plainworks/theme/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeToggle } from "./theme-toggle"

afterEach(cleanup)

describe("ThemeToggle", () => {
  it("switches the theme through the provider's source", async () => {
    installMatchMedia(false)
    const source = fakeStateSource({
      initial: { mode: "light" as const, colorScheme: "indigo" as const },
    })
    const { container } = render(
      <ThemeProvider source={source}>
        <ThemeToggle />
      </ThemeProvider>,
    )

    const toggle = screen.getByRole("button", { name: "Use dark theme" })
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    await userEvent.setup().click(toggle)
    await waitFor(() => expect(source.current).toEqual({ mode: "dark", colorScheme: "indigo" }))
    await expectNoAxeViolations(container)
  })

  it("reads a dark OS preference under `system` as dark and switches to explicit light", async () => {
    installMatchMedia(true)
    const source = fakeStateSource({
      initial: { mode: "system" as const, colorScheme: "indigo" as const },
    })
    render(
      <ThemeProvider source={source}>
        <ThemeToggle />
      </ThemeProvider>,
    )

    // The page is already dark, so the control must offer light and report pressed.
    const toggle = screen.getByRole("button", { name: "Use light theme" })
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    await userEvent.setup().click(toggle)
    await waitFor(() => expect(source.current).toEqual({ mode: "light", colorScheme: "indigo" }))
  })

  it("announces a write failure generically — never the backend's raw message", async () => {
    installMatchMedia(false)
    const source = fakeStateSource({
      initial: { mode: "light" as const, colorScheme: "indigo" as const },
      setError: new Error("PUT https://internal.host/prefs 401"),
    })
    const { container } = render(
      <ThemeProvider source={source}>
        <ThemeToggle />
      </ThemeProvider>,
    )

    await userEvent.setup().click(screen.getByRole("button", { name: "Use dark theme" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("The theme could not be changed. Try again.")
    expect(alert.textContent).not.toContain("internal.host")
    expect(source.current?.mode).toBe("light")
    await expectNoAxeViolations(container)
  })
})
