// @vitest-environment jsdom

import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { fakeStateSource } from "@plainworks/testkit/fakes"
import { ThemeProvider } from "@plainworks/theme/client"
import type { ThemePreference } from "@plainworks/theme/preference"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { defaultThemeStudioLabels, ThemeStudio, type ThemeStudioProps } from "./theme-studio"

beforeEach(() => installMatchMedia(false))
afterEach(cleanup)

function renderStudio(
  initial: ThemePreference,
  props: ThemeStudioProps = {},
  setError?: Error,
): {
  readonly source: ReturnType<typeof fakeStateSource<ThemePreference>>
  readonly container: HTMLElement
} {
  const source = fakeStateSource<ThemePreference>({
    initial,
    ...(setError === undefined ? {} : { setError }),
  })
  const page = (): ReactElement => (
    <ThemeProvider source={source} initialTheme={initial}>
      <main>
        <h1>Settings</h1>
        <ThemeStudio {...props} />
      </main>
    </ThemeProvider>
  )
  const { container } = render(page())
  return { source, container }
}

describe("ThemeStudio", () => {
  it("presents the mode group, the accent picker, and a live preview", async () => {
    const { container } = renderStudio({ mode: "dark", colorScheme: "emerald" })
    expect(screen.getByRole("region", { name: "Appearance" })).toBeDefined()
    const mode = screen.getByRole("group", { name: "Color mode" })
    const accent = screen.getByRole("group", { name: "Accent color" })
    expect(within(mode).getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe(
      "true",
    )
    expect(
      within(accent).getByRole("button", { name: "Emerald" }).getAttribute("aria-pressed"),
    ).toBe("true")
    const preview = screen.getByRole("region", { name: "Theme preview" })
    // The samples only show the theme, so they are inert: no dead tab stops, nothing announced.
    const sample = within(preview).getByRole("button", { name: "Primary" })
    expect(sample.closest("[inert]")).not.toBeNull()
    expect(within(preview).queryByRole("img")).toBeNull()
    await expectNoAxeViolations(container)
  })

  it("changes mode and accent through one shared theme", async () => {
    const user = userEvent.setup()
    const { source } = renderStudio({ mode: "light", colorScheme: "indigo" })
    await user.click(screen.getByRole("button", { name: "Dark" }))
    await user.click(screen.getByRole("button", { name: "Cyan" }))
    expect(source.current).toEqual({ mode: "dark", colorScheme: "cyan" })
    expect(document.documentElement.classList.contains("theme-cyan")).toBe(true)
  })

  it("announces exactly one error when a change cannot be saved", async () => {
    const user = userEvent.setup()
    renderStudio({ mode: "light", colorScheme: "indigo" }, {}, new Error("write failed"))
    await user.click(screen.getByRole("button", { name: "Dark" }))
    const alerts = await screen.findAllByRole("alert")
    expect(alerts.map((alert) => alert.textContent)).toEqual([defaultThemeStudioLabels.error])
  })

  it("takes injected labels and a custom preview, and lays out by its container", () => {
    const { container } = renderStudio(
      { mode: "light", colorScheme: "indigo" },
      { labels: { heading: "Darstellung" }, preview: null },
    )
    expect(screen.getByRole("region", { name: "Darstellung" })).toBeDefined()
    expect(screen.queryByRole("region", { name: "Theme preview" })).toBeNull()
    expect(container.querySelector("section")?.className).toContain("@container/studio")
  })
})
