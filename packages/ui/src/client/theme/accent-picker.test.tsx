// @vitest-environment jsdom

import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { fakeStateSource } from "@plainworks/testkit/fakes"
import { ThemeProvider } from "@plainworks/theme/client"
import { COLOR_SCHEMES, type ThemePreference } from "@plainworks/theme/preference"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AccentPicker, type AccentPickerProps, defaultAccentPickerLabels } from "./accent-picker"

beforeEach(() => installMatchMedia(false))
afterEach(cleanup)

function renderPicker(
  initial: ThemePreference,
  props: AccentPickerProps = {},
  setError?: Error,
): { readonly source: ReturnType<typeof fakeStateSource<ThemePreference>> } {
  const source = fakeStateSource<ThemePreference>({
    initial,
    ...(setError === undefined ? {} : { setError }),
  })
  render(
    <ThemeProvider source={source} initialTheme={initial}>
      <AccentPicker {...props} />
    </ThemeProvider>,
  )
  return { source }
}

describe("AccentPicker", () => {
  it("offers every scheme by name and marks the current one pressed", async () => {
    renderPicker({ mode: "light", colorScheme: "emerald" })
    const group = screen.getByRole("group", { name: "Accent color" })
    for (const scheme of COLOR_SCHEMES) {
      expect(screen.getByRole("button", { name: defaultAccentPickerLabels.schemes[scheme] }))
    }
    expect(screen.getByRole("button", { name: "Emerald" }).getAttribute("aria-pressed")).toBe(
      "true",
    )
    await expectNoAxeViolations(group)
  })

  it("persists a chosen accent from the keyboard and repaints the document", async () => {
    const user = userEvent.setup()
    const { source } = renderPicker({ mode: "light", colorScheme: "neutral" })
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Neutral" }))
    await user.keyboard("{ArrowRight}{Enter}")

    expect(source.current).toEqual({ mode: "light", colorScheme: "indigo" })
    expect(document.documentElement.classList.contains("theme-indigo")).toBe(true)
  })

  it("paints dark and neutral swatches from their theme selectors", () => {
    renderPicker({ mode: "dark", colorScheme: "indigo" })
    const rose = screen.getByRole("button", { name: "Rose" }).querySelector("[aria-hidden]")
    expect(rose?.classList.contains("theme-rose")).toBe(true)
    expect(rose?.classList.contains("dark")).toBe(true)
    const neutral = screen.getByRole("button", { name: "Neutral" }).querySelector("[aria-hidden]")
    expect(neutral?.classList.contains("bg-foreground")).toBe(true)
  })

  it("takes injected labels, including single scheme names", () => {
    renderPicker(
      { mode: "light", colorScheme: "indigo" },
      { labels: { label: "Akzentfarbe", schemes: { rose: "Rosa" } } },
    )
    expect(screen.getByRole("group", { name: "Akzentfarbe" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Rosa" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Cyan" })).toBeDefined()
  })

  it("announces a failed save with its own copy", async () => {
    const user = userEvent.setup()
    renderPicker({ mode: "light", colorScheme: "indigo" }, {}, new Error("write failed"))
    await user.click(screen.getByRole("button", { name: "Rose" }))
    expect((await screen.findByRole("alert")).textContent).toBe(defaultAccentPickerLabels.error)
  })
})
