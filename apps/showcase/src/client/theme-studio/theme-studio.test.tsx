// @vitest-environment jsdom

import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import type { ThemePreference } from "@plainworks/theme"
import { ThemeProvider } from "@plainworks/theme/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ThemeStudio } from "./theme-studio"

beforeEach(() => installMatchMedia(false))
afterEach(cleanup)

// The studio embeds under a page section in Settings, so tests mount it under a landmark with an
// `h1` — the same context it ships in — and seed the provider with the persisted preference.
function Page({
  children,
  source,
  initial,
}: {
  readonly children: ReactNode
  readonly source: ReturnType<typeof fakeStateSource<ThemePreference>>
  readonly initial: ThemePreference
}): ReactElement {
  return (
    <ThemeProvider source={source} initialTheme={initial}>
      <main>
        <h1>Settings</h1>
        {children}
      </main>
    </ThemeProvider>
  )
}

function renderStudio(initial: ThemePreference): {
  readonly source: ReturnType<typeof fakeStateSource<ThemePreference>>
  readonly container: HTMLElement
} {
  const source = fakeStateSource<ThemePreference>({ initial })
  const { container } = render(
    <Page source={source} initial={initial}>
      <ThemeStudio />
    </Page>,
  )
  return { source, container }
}

describe("theme studio", () => {
  it("presents the mode control, the accent picker, and a live preview", () => {
    renderStudio({ mode: "system", colorScheme: "indigo" })

    expect(screen.getByRole("group", { name: "Color mode" })).toBeDefined()
    expect(screen.getByRole("group", { name: "Accent color" })).toBeDefined()
    expect(screen.getByRole("region", { name: "Theme preview" })).toBeDefined()
    expect(screen.getByRole("img", { name: /Sample trend/ })).toBeDefined()
  })

  it("seeds the persisted preference on first render with no default flash", () => {
    renderStudio({ mode: "dark", colorScheme: "emerald" })

    const modeGroup = screen.getByRole("group", { name: "Color mode" })
    const accentGroup = screen.getByRole("group", { name: "Accent color" })
    expect(
      within(modeGroup).getByRole("button", { name: "Dark" }).getAttribute("aria-pressed"),
    ).toBe("true")
    expect(
      within(accentGroup).getByRole("button", { name: "Emerald" }).getAttribute("aria-pressed"),
    ).toBe("true")
  })

  it("changes mode and accent from one shared source of truth", async () => {
    const user = userEvent.setup()
    const { source } = renderStudio({ mode: "light", colorScheme: "indigo" })

    const modeGroup = screen.getByRole("group", { name: "Color mode" })
    const accentGroup = screen.getByRole("group", { name: "Accent color" })
    await user.click(within(modeGroup).getByRole("button", { name: "Dark" }))
    await user.click(within(accentGroup).getByRole("button", { name: "Cyan" }))

    expect(source.current).toEqual({ mode: "dark", colorScheme: "cyan" })
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.classList.contains("theme-cyan")).toBe(true)
  })

  it("announces one accurate error when a theme change cannot be saved", async () => {
    const user = userEvent.setup()
    const initial = { mode: "light", colorScheme: "indigo" } as const
    const source = fakeStateSource<ThemePreference>({
      initial,
      setError: new Error("write failed"),
    })
    render(
      <Page source={source} initial={initial}>
        <ThemeStudio />
      </Page>,
    )

    await user.click(screen.getByRole("button", { name: "Dark" }))

    const alerts = await screen.findAllByRole("alert")
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.textContent).toBe(
      "Theme preferences could not be loaded or saved. Try again.",
    )
  })

  it("has no detectable accessibility violations", async () => {
    const { container } = renderStudio({ mode: "system", colorScheme: "indigo" })
    await expectNoAxeViolations(container)
  })
})
