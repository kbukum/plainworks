// @vitest-environment jsdom

import { deferredStateSource, fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import type { ThemePreference } from "../../theme"
import { ThemeProvider, useTheme } from "./theme-provider"

afterEach(cleanup)

/** A minimal consumer that exercises the provider without depending on any atom package. */
function ThemeConsumer(): ReactElement {
  const { error, theme, setTheme } = useTheme()
  const nextMode = theme.mode === "dark" ? "light" : "dark"
  const toggle = (): void => {
    void setTheme({ ...theme, mode: nextMode }).catch(() => {})
  }
  return (
    <>
      <button type="button" onClick={toggle}>
        Use {nextMode} theme
      </button>
      {error === undefined ? null : <p role="alert">{error.message}</p>}
    </>
  )
}

describe("ThemeProvider", () => {
  it("hydrates from a caller-owned source and persists changes", async () => {
    installMatchMedia(false)
    const source = fakeStateSource({
      initial: { mode: "dark" as const, colorScheme: "indigo" as const },
    })
    const { container, unmount } = render(
      <ThemeProvider source={source}>
        <ThemeConsumer />
      </ThemeProvider>,
    )

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true))
    await userEvent.setup().click(screen.getByRole("button", { name: "Use light theme" }))
    await waitFor(() => expect(source.current).toEqual({ mode: "light", colorScheme: "indigo" }))
    await expectNoAxeViolations(container)
    unmount()
    expect(source.subscriberCount).toBe(0)
  })

  it("announces source read failures", async () => {
    installMatchMedia(false)
    const source = fakeStateSource({
      initial: { mode: "system" as const, colorScheme: "indigo" as const },
      getError: new Error("Could not load theme"),
    })
    const { container } = render(
      <ThemeProvider source={source}>
        <ThemeConsumer />
      </ThemeProvider>,
    )

    expect((await screen.findByRole("alert")).textContent).toContain("Could not load theme")
    await expectNoAxeViolations(container)
  })

  it("announces source write failures without changing the theme", async () => {
    installMatchMedia(false)
    const source = fakeStateSource({
      initial: { mode: "light" as const, colorScheme: "indigo" as const },
      setError: new Error("Could not save theme"),
    })
    const { container } = render(
      <ThemeProvider source={source}>
        <ThemeConsumer />
      </ThemeProvider>,
    )

    await userEvent.setup().click(screen.getByRole("button", { name: "Use dark theme" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Could not save theme")
    expect(source.current?.mode).toBe("light")
    await expectNoAxeViolations(container)
  })

  it("rejects use outside its provider", () => {
    expect(() => renderHook(() => useTheme())).toThrow("useTheme must be used inside ThemeProvider")
  })

  it("lets only the newest read commit when overlapping refreshes resolve out of order", async () => {
    installMatchMedia(false)
    const source = deferredStateSource<ThemePreference>({
      initial: { mode: "light", colorScheme: "indigo" },
    })
    render(
      <ThemeProvider source={source}>
        <ThemeConsumer />
      </ThemeProvider>,
    )
    await waitFor(() => expect(source.reads.length).toBe(1))

    // An external-style write notifies and parks a second read while the mount read is parked.
    await source.set({ mode: "dark", colorScheme: "indigo" })
    await waitFor(() => expect(source.reads.length).toBe(2))

    // The newer read (dark) completes first; the older read (light) completes after it — the
    // stale completion must not overwrite the newer theme.
    source.reads[1]?.resolve({ mode: "dark", colorScheme: "indigo" })
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true))
    source.reads[0]?.resolve({ mode: "light", colorScheme: "indigo" })
    await waitFor(() => expect(source.reads[0]?.settled).toBe(true))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("exposes the resolved mode — system resolved against the OS preference", async () => {
    installMatchMedia(true)
    const source = fakeStateSource({
      initial: { mode: "system" as const, colorScheme: "indigo" as const },
    })
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }: { readonly children?: ReactNode }) => (
        <ThemeProvider source={source}>{children}</ThemeProvider>
      ),
    })
    await waitFor(() => expect(result.current.resolvedMode).toBe("dark"))
  })
})
