// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { AppContextError } from "../errors"
import { createApp } from "../kernel/app"
import { fakeThemeCapability } from "../testing/capability-fakes"
import { useAppSnapshot } from "./context"
import { AppProvider } from "./provider"

afterEach(cleanup)

describe("app context hooks", () => {
  it("expose the composed snapshot inside the provider", async () => {
    const theme = fakeThemeCapability()
    const app = createApp({ capabilities: [theme.resolve] })
    const snapshot = await app.resolve({ headers: new Headers({ cookie: "theme=dark" }) })
    let seen: { hasTheme: boolean } | null = null
    function Probe(): ReactNode {
      seen = { hasTheme: "theme" in useAppSnapshot().capabilities }
      return createElement("span", null, "ok")
    }
    render(
      <AppProvider capabilities={[theme.provider]} snapshot={snapshot}>
        <Probe />
      </AppProvider>,
    )
    expect(seen).toEqual({ hasTheme: true })
  })

  it("throw a typed error when read outside <AppProvider>", () => {
    function Orphan(): ReactNode {
      useAppSnapshot()
      return null
    }
    // React surfaces the throw from render; assert the typed error reaches the caller.
    expect(() => render(<Orphan />)).toThrow(AppContextError)
    expect(screen.queryByText("never")).toBeNull()
  })
})
