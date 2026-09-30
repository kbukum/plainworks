// @vitest-environment jsdom

import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { fakeStateSource } from "@plainworks/testkit/fakes"
import { ThemeProvider } from "@plainworks/theme/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeModeGroup } from "./theme-mode-group"
import { ThemeModeMenu } from "./theme-mode-menu"

afterEach(cleanup)

function themeSource(mode: "light" | "dark" | "system", setError?: Error) {
  return fakeStateSource({
    initial: { mode, colorScheme: "indigo" as const },
    ...(setError === undefined ? {} : { setError }),
  })
}

describe("ThemeModeMenu", () => {
  it("names the stored mode on its trigger and writes the chosen mode", async () => {
    installMatchMedia(false)
    const source = themeSource("system")
    const user = userEvent.setup()
    const { container } = render(
      <ThemeProvider source={source}>
        <ThemeModeMenu icons={{ light: <svg aria-hidden />, dark: <svg aria-hidden /> }} />
      </ThemeProvider>,
    )

    const trigger = await screen.findByRole("button", { name: "Color mode: System" })
    await expectNoAxeViolations(container)
    await user.click(trigger)
    const system = await screen.findByRole("menuitemradio", { name: "System" })
    expect(system.getAttribute("aria-checked")).toBe("true")
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }))
    await waitFor(() => expect(source.current).toEqual({ mode: "dark", colorScheme: "indigo" }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Color mode: Dark" })).toBeDefined(),
    )
  })

  it("is keyboard operable and takes injected labels", async () => {
    installMatchMedia(false)
    const source = themeSource("light")
    const user = userEvent.setup()
    render(
      <ThemeProvider source={source}>
        <ThemeModeMenu
          labels={{ label: "Farbmodus", light: "Hell", dark: "Dunkel", system: "System" }}
        />
      </ThemeProvider>,
    )

    ;(await screen.findByRole("button", { name: "Farbmodus: Hell" })).focus()
    await user.keyboard("{Enter}")
    const dark = await screen.findByRole("menuitemradio", { name: "Dunkel" })
    await user.keyboard("{ArrowDown}")
    await waitFor(() => expect(document.activeElement).toBe(dark))
    await user.keyboard("{Enter}")
    await waitFor(() => expect(source.current?.mode).toBe("dark"))
  })
})

describe("ThemeModeGroup", () => {
  it("selects the stored mode and writes the chosen one", async () => {
    installMatchMedia(true)
    const source = themeSource("system")
    const user = userEvent.setup()
    const { container } = render(
      <ThemeProvider source={source}>
        <ThemeModeGroup />
      </ThemeProvider>,
    )

    // `system` stays selected even though the OS resolves it to dark.
    expect(screen.getByRole("button", { name: "System" }).getAttribute("aria-pressed")).toBe("true")
    await user.click(screen.getByRole("button", { name: "Light" }))
    await waitFor(() => expect(source.current?.mode).toBe("light"))
    await expectNoAxeViolations(container)
  })

  it("keeps a mode selected when the active option is pressed again", async () => {
    installMatchMedia(false)
    const source = themeSource("dark")
    const user = userEvent.setup()
    render(
      <ThemeProvider source={source}>
        <ThemeModeGroup />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Dark" }))
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true")
    expect(source.current?.mode).toBe("dark")
  })

  it("announces a write failure generically, never the backend's message", async () => {
    installMatchMedia(false)
    const source = themeSource("light", new Error("PUT https://internal.host/prefs 401"))
    const user = userEvent.setup()
    render(
      <ThemeProvider source={source}>
        <ThemeModeGroup />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Dark" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("The color mode could not be changed. Try again.")
    expect(alert.textContent).not.toContain("internal.host")
  })
})
