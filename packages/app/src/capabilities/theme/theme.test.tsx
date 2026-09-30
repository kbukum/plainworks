// @vitest-environment jsdom
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { fakeStateSource } from "@plainworks/testkit/fakes"
import { useTheme } from "@plainworks/theme/client"
import type { MotionPreference, ThemePreference } from "@plainworks/theme/preference"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AppProvider } from "../../client/provider"
import { AppContextError } from "../../errors"
import { createApp } from "../../kernel/app"
import { createMotionCapability, createThemeCapability, useMotion } from "./provider"
import { createThemeResolver, THEME_CAPABILITY_ID } from "./resolver"

beforeEach(() => {
  installMatchMedia()
})

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute("data-motion")
  document.documentElement.className = ""
})

const dark: ThemePreference = { mode: "dark", colorScheme: "emerald" }

function ShowsTheme(): ReactNode {
  const { theme } = useTheme()
  return <p>{`${theme.mode}:${theme.colorScheme}`}</p>
}

describe("createThemeResolver", () => {
  it("reads the theme cookie and derives the no-flash root class", async () => {
    const app = createApp({ capabilities: [createThemeResolver({ cookie: "theme" })] })
    const cookie = `theme=${encodeURIComponent(JSON.stringify(dark))}`
    const snapshot = await app.resolve({ headers: new Headers({ cookie }) })
    expect(snapshot.capabilities[THEME_CAPABILITY_ID]).toEqual(dark)
    expect(app.htmlClass(snapshot)).toBe("dark theme-emerald")
  })

  it("falls back to the default theme when the cookie is absent or invalid", async () => {
    const app = createApp({ capabilities: [createThemeResolver({ cookie: "theme", id: "look" })] })
    const snapshot = await app.resolve({ headers: new Headers({ cookie: "theme=%7Bnope" }) })
    expect(snapshot.capabilities.look).toEqual({ mode: "system", colorScheme: "indigo" })
    expect(app.htmlClass(snapshot)).toBe("theme-indigo")
  })
})

describe("createThemeCapability", () => {
  it("renders the server-resolved theme on the first render", () => {
    const html = renderToString(
      <AppProvider
        capabilities={[createThemeCapability({ source: fakeStateSource<ThemePreference>() })]}
        snapshot={{ capabilities: { [THEME_CAPABILITY_ID]: dark } }}
      >
        <ShowsTheme />
      </AppProvider>,
    )
    expect(html).toContain("dark:emerald")
  })

  it("narrows a malformed slice to the default theme", async () => {
    const { container } = render(
      <AppProvider
        capabilities={[createThemeCapability({ source: fakeStateSource<ThemePreference>() })]}
        snapshot={{ capabilities: { [THEME_CAPABILITY_ID]: { mode: 42 } } }}
      >
        <ShowsTheme />
      </AppProvider>,
    )
    expect(screen.getByText("system:indigo")).toBeDefined()
    await expectNoAxeViolations(container)
  })
})

describe("createMotionCapability", () => {
  function MotionToggle(): ReactNode {
    const { motion, setMotion } = useMotion()
    return (
      <button
        type="button"
        onClick={() => void setMotion(motion === "reduce" ? "system" : "reduce")}
      >
        {`motion:${motion}`}
      </button>
    )
  }

  it("adopts the stored choice and writes it to the document root", async () => {
    const source = fakeStateSource<MotionPreference>({ initial: "reduce" })
    const capability = createMotionCapability({ source })
    const { container } = render(
      <AppProvider capabilities={[capability]}>
        <MotionToggle />
      </AppProvider>,
    )
    expect(await screen.findByRole("button", { name: "motion:reduce" })).toBeDefined()
    expect(document.documentElement.dataset.motion).toBe("reduce")
    await expectNoAxeViolations(container)
  })

  it("persists a new choice through the source", async () => {
    const source = fakeStateSource<MotionPreference>()
    const capability = createMotionCapability({ source })
    render(
      <AppProvider capabilities={[capability]}>
        <MotionToggle />
      </AppProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "motion:system" }))
    expect(await screen.findByRole("button", { name: "motion:reduce" })).toBeDefined()
    expect(source.current).toBe("reduce")
    expect(document.documentElement.dataset.motion).toBe("reduce")
  })

  it("reports a failed save and keeps the previous choice", async () => {
    const source = fakeStateSource<MotionPreference>({ setError: new Error("quota") })
    const capability = createMotionCapability({ source })
    function Probe(): ReactNode {
      const { motion, error, setMotion } = useMotion()
      return (
        <button type="button" onClick={() => void setMotion("reduce").catch(() => undefined)}>
          {`${motion}:${error?.message ?? "ok"}`}
        </button>
      )
    }
    render(
      <AppProvider capabilities={[capability]}>
        <Probe />
      </AppProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "system:ok" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "system:quota" })).toBeDefined())
  })

  it("clears a prior error when the choice is externally removed", async () => {
    const source = fakeStateSource<MotionPreference>({
      initial: "reduce",
      setError: new Error("quota"),
    })
    const capability = createMotionCapability({ source })
    function Probe(): ReactNode {
      const { motion, error, setMotion } = useMotion()
      return (
        <button type="button" onClick={() => void setMotion("system").catch(() => undefined)}>
          {`${motion}:${error?.message ?? "ok"}`}
        </button>
      )
    }
    render(
      <AppProvider capabilities={[capability]}>
        <Probe />
      </AppProvider>,
    )
    await screen.findByRole("button", { name: "reduce:ok" })
    await userEvent.click(screen.getByRole("button", { name: "reduce:ok" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "reduce:quota" })).toBeDefined())

    await act(async () => {
      await source.remove()
    })
    await waitFor(() => expect(screen.getByRole("button", { name: "system:ok" })).toBeDefined())
  })

  it("throws a typed error outside its capability", () => {
    function Outside(): ReactNode {
      useMotion()
      return null
    }
    expect(() => renderToString(<Outside />)).toThrow(AppContextError)
  })
})
