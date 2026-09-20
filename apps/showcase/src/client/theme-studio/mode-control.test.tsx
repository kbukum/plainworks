// @vitest-environment jsdom

import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import type { ThemePreference } from "@plainworks/theme"
import { ThemeProvider } from "@plainworks/theme/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { ModeControl } from "./mode-control"

afterEach(cleanup)

// The control drives a real `ThemeProvider` over a testkit fake source, so the assertions cover the
// same context path the app uses — never a stubbed hook.
function renderControl(
  options: {
    readonly initial?: ThemePreference
    readonly systemPrefersDark?: boolean
    readonly compact?: boolean
  } = {},
): ReturnType<typeof render> & {
  readonly source: ReturnType<typeof fakeStateSource<ThemePreference>>
} {
  const {
    initial = { mode: "light", colorScheme: "indigo" },
    systemPrefersDark = false,
    compact = false,
  } = options
  installMatchMedia(systemPrefersDark)
  const source = fakeStateSource<ThemePreference>({ initial })
  const view = render(
    <ThemeProvider source={source} initialTheme={initial}>
      <ModeControl compact={compact} />
    </ThemeProvider>,
  )
  return Object.assign(view, { source })
}

function mode(name: string): HTMLElement {
  return screen.getByRole("button", { name })
}

describe("mode control", () => {
  it("exposes all three modes and reflects the current selection", () => {
    renderControl({ initial: { mode: "light", colorScheme: "indigo" } })

    expect(mode("Light").getAttribute("aria-pressed")).toBe("true")
    expect(mode("Dark").getAttribute("aria-pressed")).toBe("false")
    expect(mode("System").getAttribute("aria-pressed")).toBe("false")
  })

  it("persists a chosen mode through the theme source", async () => {
    const user = userEvent.setup()
    const { source } = renderControl({ initial: { mode: "light", colorScheme: "indigo" } })

    await user.click(mode("Dark"))

    expect(source.current).toEqual({ mode: "dark", colorScheme: "indigo" })
    expect(mode("Dark").getAttribute("aria-pressed")).toBe("true")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("selects a mode from the keyboard", async () => {
    const user = userEvent.setup()
    const { source } = renderControl({ initial: { mode: "light", colorScheme: "indigo" } })

    await user.tab()
    expect(mode("Light")).toBe(document.activeElement)
    await user.keyboard("{ArrowRight} ")

    expect(source.current?.mode).toBe("dark")
  })

  it("resolves system against the OS preference", () => {
    renderControl({ initial: { mode: "system", colorScheme: "indigo" }, systemPrefersDark: true })

    expect(mode("System").getAttribute("aria-pressed")).toBe("true")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("keeps a mode selected when the active item is pressed again", async () => {
    const user = userEvent.setup()
    const { source } = renderControl({ initial: { mode: "dark", colorScheme: "indigo" } })

    await user.click(mode("Dark"))

    expect(source.current?.mode).toBe("dark")
    expect(mode("Dark").getAttribute("aria-pressed")).toBe("true")
  })

  it("names each mode for assistive tech in the compact variant", () => {
    renderControl({ initial: { mode: "light", colorScheme: "indigo" }, compact: true })

    expect(mode("System")).toBeDefined()
  })

  it("has no detectable accessibility violations", async () => {
    const { container } = renderControl({ initial: { mode: "system", colorScheme: "indigo" } })
    await expectNoAxeViolations(container)
  })
})
