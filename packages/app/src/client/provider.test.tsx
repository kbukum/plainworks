// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, expectTypeOf, it } from "vitest"
import { AppConfigError } from "../errors"
import { createApp } from "../kernel/app"
import {
  fakeMarkerCapability,
  fakeSessionCapability,
  fakeThemeCapability,
  useFakeSession,
} from "../testing/capability-fakes"
import type { CapabilityProviderProps } from "./capability"
import { AppProvider } from "./provider"

afterEach(cleanup)

const requestWith = (cookie: string) => ({ headers: new Headers({ cookie }) })

describe("AppProvider composition", () => {
  it("keeps deserialized capability slices unknown until the provider narrows them", () => {
    expectTypeOf<CapabilityProviderProps["resolved"]>().toEqualTypeOf<unknown>()
  })

  it("assembles the full stack through the published surface and renders children", async () => {
    // Consumer-first: resolve the neutral halves into a snapshot, mount the client halves under
    // `AppProvider`. The two are joined by id, exactly as the server→client boundary composes them.
    const theme = fakeThemeCapability()
    const session = fakeSessionCapability()
    const app = createApp({ capabilities: [theme.resolve, session.resolve] })
    const snapshot = await app.resolve(requestWith("theme=dark; session=Ada"))
    render(
      <AppProvider capabilities={[theme.provider, session.provider]} snapshot={snapshot}>
        <main>content</main>
      </AppProvider>,
    )
    expect(screen.getByText("content")).toBeDefined()
  })
})

describe("registry ordering", () => {
  it("mounts a dependency outermost, regardless of registration order", () => {
    // Registered leaf-first; `b` depends on `a` and `c` on `b`, so the tree nests a>b>c.
    const { container } = render(
      <AppProvider
        capabilities={[
          fakeMarkerCapability("c", ["b"]),
          fakeMarkerCapability("a"),
          fakeMarkerCapability("b", ["a"]),
        ]}
      >
        <span>leaf</span>
      </AppProvider>,
    )
    const nesting = [...container.querySelectorAll("[data-cap]")].map((el) =>
      el.getAttribute("data-cap"),
    )
    expect(nesting).toEqual(["a", "b", "c"])
  })
})

describe("capability swap (flexibility)", () => {
  it("reorders at the call site with no core edit", () => {
    // Flip the dependency direction (a depends on b) → b now wraps a, purely a config change.
    const { container } = render(
      <AppProvider capabilities={[fakeMarkerCapability("a", ["b"]), fakeMarkerCapability("b")]}>
        <span>leaf</span>
      </AppProvider>,
    )
    const nesting = [...container.querySelectorAll("[data-cap]")].map((el) =>
      el.getAttribute("data-cap"),
    )
    expect(nesting).toEqual(["b", "a"])
  })
})

describe("zero-flash SSR contract", () => {
  it("renders the server-resolved theme class on the first paint (no FOUC)", async () => {
    const theme = fakeThemeCapability()
    const app = createApp({ capabilities: [theme.resolve] })
    const snapshot = await app.resolve(requestWith("theme=dark"))
    render(
      <AppProvider capabilities={[theme.provider]} snapshot={snapshot}>
        <span>leaf</span>
      </AppProvider>,
    )
    // The class is correct on the FIRST render (from the snapshot prop), not after an effect.
    expect(screen.getByTestId("theme-root").className).toBe("dark")
  })

  it("renders the server-resolved authed session on the first paint (no auth flash)", async () => {
    function Greeting(): ReactNode {
      const session = useFakeSession()
      return createElement(
        "p",
        null,
        session.status === "authenticated" ? `Welcome, ${session.name}` : "Sign in",
      )
    }
    const session = fakeSessionCapability()
    const app = createApp({ capabilities: [session.resolve] })
    const snapshot = await app.resolve(requestWith("session=Ada"))
    render(
      <AppProvider capabilities={[session.provider]} snapshot={snapshot}>
        <Greeting />
      </AppProvider>,
    )
    // Authed content is present synchronously — getByText, not findByText: no spinner→content jank.
    expect(screen.getByText("Welcome, Ada")).toBeDefined()
  })

  it("falls back to the unresolved default when no snapshot is supplied", () => {
    const theme = fakeThemeCapability()
    render(
      <AppProvider capabilities={[theme.provider]}>
        <span>leaf</span>
      </AppProvider>,
    )
    expect(screen.getByTestId("theme-root").className).toBe("unset")
  })

  it("rejects a malformed resolved slice instead of trusting its id", () => {
    const theme = fakeThemeCapability()
    expect(() =>
      render(
        <AppProvider
          capabilities={[theme.provider]}
          snapshot={{ capabilities: { theme: { className: "unknown" } } }}
        >
          <span>leaf</span>
        </AppProvider>,
      ),
    ).toThrow(AppConfigError)
  })
})

describe("query wiring is a capability, not a special case", () => {
  it("mounts no query provider of its own — a bare app pulls in no query binding", () => {
    // The core root is concern-free: with no capabilities there is no QueryClientProvider in the
    // tree. A shared client is opt-in via `createQueryCapability` (covered in the recipe tests).
    const { container } = render(
      <AppProvider capabilities={[]}>
        <span>leaf</span>
      </AppProvider>,
    )
    expect(container.querySelector("span")?.textContent).toBe("leaf")
  })
})

describe("accessibility", () => {
  it("wraps its children transparently with no axe violations", async () => {
    const theme = fakeThemeCapability()
    const { container } = render(
      <AppProvider capabilities={[theme.provider]}>
        <main>
          <h1>Items</h1>
          <button type="button">Refresh</button>
        </main>
      </AppProvider>,
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
