// @vitest-environment jsdom

import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import type { ThemePreference } from "@plainworks/theme"
import { COLOR_SCHEMES } from "@plainworks/theme"
import { ThemeProvider } from "@plainworks/theme/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AccentPicker } from "./accent-picker"

beforeEach(() => installMatchMedia(false))
afterEach(cleanup)

function renderPicker(initial: ThemePreference): {
  readonly source: ReturnType<typeof fakeStateSource<ThemePreference>>
  readonly container: HTMLElement
} {
  const source = fakeStateSource<ThemePreference>({ initial })
  const { container } = render(
    <ThemeProvider source={source} initialTheme={initial}>
      <AccentPicker />
    </ThemeProvider>,
  )
  return { source, container }
}

describe("accent picker", () => {
  it("offers every accent scheme by name, never by color alone", () => {
    renderPicker({ mode: "light", colorScheme: "indigo" })

    for (const scheme of COLOR_SCHEMES) {
      const label = scheme.charAt(0).toUpperCase() + scheme.slice(1)
      expect(screen.getByRole("button", { name: label })).toBeDefined()
    }
  })

  it("reflects the current accent as pressed", () => {
    renderPicker({ mode: "light", colorScheme: "emerald" })

    expect(screen.getByRole("button", { name: "Emerald" }).getAttribute("aria-pressed")).toBe(
      "true",
    )
  })

  it("persists a chosen accent and applies it to the document", async () => {
    const user = userEvent.setup()
    const { source } = renderPicker({ mode: "light", colorScheme: "indigo" })

    await user.click(screen.getByRole("button", { name: "Rose" }))

    expect(source.current).toEqual({ mode: "light", colorScheme: "rose" })
    expect(document.documentElement.classList.contains("theme-rose")).toBe(true)
  })

  it("paints dark and neutral swatches from their theme selectors", () => {
    renderPicker({ mode: "dark", colorScheme: "indigo" })

    const roseSwatch = screen.getByRole("button", { name: "Rose" }).querySelector("[aria-hidden]")
    expect(roseSwatch?.classList.contains("theme-rose")).toBe(true)
    expect(roseSwatch?.classList.contains("dark")).toBe(true)
    expect(roseSwatch?.classList.contains("bg-primary")).toBe(true)

    const neutralSwatch = screen
      .getByRole("button", { name: "Neutral" })
      .querySelector("[aria-hidden]")
    expect(neutralSwatch?.classList.contains("bg-foreground")).toBe(true)
    expect(neutralSwatch?.classList.contains("theme-neutral")).toBe(false)
  })

  it("has no detectable accessibility violations", async () => {
    const { container } = renderPicker({ mode: "light", colorScheme: "indigo" })
    await expectNoAxeViolations(container)
  })
})
