// @vitest-environment jsdom
// Client tests opt into jsdom per file; the package default stays `node` so the server-safe `.`
// entry can never lean on DOM globals unnoticed.

import type { StateSource } from "@plainworks/std"
import { asyncStateSource } from "@plainworks/testkit"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { StateError } from "../../errors"
import { memoryScope } from "../../scope/memory"
import type { Scope, SourceSpec } from "../../scope/scope"
import { cookieScope } from "../scope/cookie"
import { persistentScope, sessionScope } from "../scope/web-storage"
import { createScopedState } from "./scoped-state"

interface Prefs {
  theme: string
}

/** Wrap a single prepared {@link StateSource} as a one-slot {@link Scope} for a test. */
function scopeOf(source: StateSource<Prefs>, name = "test"): Scope {
  return {
    name,
    capabilities: source.capabilities,
    createSource: <Value,>(_spec: SourceSpec<Value>) => source as unknown as StateSource<Value>,
  }
}

/** A consumer written once, reused across every scope — the surface's whole promise. */
function makeConsumer(scope: Scope) {
  const useTheme = createScopedState<Prefs>({
    scope,
    key: "prefs",
    initial: { theme: "light" },
  })
  function Label(): ReactNode {
    const theme = useTheme((prefs) => prefs.theme)
    return <output>theme: {theme}</output>
  }
  function Toggle(): ReactNode {
    const api = useTheme.useApi()
    return (
      <button type="button" onClick={() => api.set({ theme: "dark" })}>
        go dark
      </button>
    )
  }
  return { useTheme, Label, Toggle }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  for (const part of document.cookie.split("; ")) {
    const key = part.split("=")[0]
    // biome-ignore lint/suspicious/noDocumentCookie: clearing each cookie between tests is the point.
    if (key) document.cookie = `${key}=; Max-Age=0; Path=/`
  }
})

describe("createScopedState — one callable hook across scopes", () => {
  // The same consumer code drives every host-backed scope; only the `scope:` field differs.
  const scopes: Array<[string, Scope]> = [
    ["memory", memoryScope],
    ["persistent", persistentScope],
    ["session", sessionScope],
    ["cookie", cookieScope],
  ]

  describe.each(scopes)("the %s scope", (_name, scope) => {
    test("renders the initial value, then an optimistic write everyone sees", async () => {
      const user = userEvent.setup()
      const { useTheme, Label, Toggle } = makeConsumer(scope)
      render(
        <useTheme.Provider>
          <Label />
          <Toggle />
        </useTheme.Provider>,
      )
      expect(screen.getByText("theme: light")).toBeDefined()
      await user.click(screen.getByRole("button", { name: "go dark" }))
      expect(screen.getByText("theme: dark")).toBeDefined()
    })
  })

  test("the callable hook returns the whole value with no selector", () => {
    const useTheme = createScopedState<Prefs>({
      scope: memoryScope,
      key: "prefs",
      initial: { theme: "light" },
    })
    function Whole(): ReactNode {
      const prefs = useTheme()
      return <output>whole: {prefs.theme}</output>
    }
    render(
      <useTheme.Provider>
        <Whole />
      </useTheme.Provider>,
    )
    expect(screen.getByText("whole: light")).toBeDefined()
  })

  test("a durable scope reflects a value written before the Provider mounts", async () => {
    localStorage.setItem("prefs", JSON.stringify({ theme: "dark" }))
    const { useTheme, Label } = makeConsumer(persistentScope)
    render(
      <useTheme.Provider>
        <Label />
      </useTheme.Provider>,
    )
    // First paint shows the seed (matches SSR), then the effect reconciles to the stored value.
    await waitFor(() => expect(screen.getByText("theme: dark")).toBeDefined())
  })
})

describe("createScopedState — imperative api, actions, and errors", () => {
  test("useApi outside a Provider throws a typed StateError", () => {
    const { useTheme } = makeConsumer(memoryScope)
    function Orphan(): ReactNode {
      useTheme.useApi()
      return null
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Orphan />)).toThrow(StateError)
    consoleError.mockRestore()
  })

  test("get/set/remove drive the mirror imperatively", async () => {
    const source = asyncStateSource<Prefs>()
    const { useTheme, Label } = makeConsumer(scopeOf(source))
    let api: ReturnType<typeof useTheme.useApi> | undefined
    function Grab(): ReactNode {
      api = useTheme.useApi()
      return null
    }
    render(
      <useTheme.Provider>
        <Label />
        <Grab />
      </useTheme.Provider>,
    )
    expect(api?.get()).toEqual({ theme: "light" })
    act(() => api?.set((prev) => ({ theme: `${prev.theme}!` })))
    expect(screen.getByText("theme: light!")).toBeDefined()
    act(() => api?.remove())
    expect(screen.getByText("theme: light")).toBeDefined()
  })

  test("optional actions are merged onto the useApi handle", () => {
    const useTheme = createScopedState<Prefs, { cycle: () => void }>({
      scope: memoryScope,
      key: "prefs",
      initial: { theme: "light" },
      actions: ({ set, get }) => ({
        cycle: () => set({ theme: get().theme === "light" ? "dark" : "light" }),
      }),
    })
    function View(): ReactNode {
      const theme = useTheme((prefs) => prefs.theme)
      const { cycle } = useTheme.useApi()
      return (
        <button type="button" onClick={cycle}>
          theme: {theme}
        </button>
      )
    }
    render(
      <useTheme.Provider>
        <View />
      </useTheme.Provider>,
    )
    expect(screen.getByRole("button", { name: "theme: light" })).toBeDefined()
    act(() => screen.getByRole("button").click())
    expect(screen.getByRole("button", { name: "theme: dark" })).toBeDefined()
  })

  test("a rejected persistence is routed to onError, never swallowed", async () => {
    const failing = failingSource(new Error("backend down"))
    const onError = vi.fn()
    const useTheme = createScopedState<Prefs>({
      scope: scopeOf(failing),
      key: "prefs",
      initial: { theme: "light" },
      onError,
    })
    let api: ReturnType<typeof useTheme.useApi> | undefined
    function Grab(): ReactNode {
      api = useTheme.useApi()
      return null
    }
    render(
      <useTheme.Provider>
        <Grab />
      </useTheme.Provider>,
    )
    act(() => api?.set({ theme: "dark" }))
    await waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  test("without onError, a rejected persist is surfaced out of band, never swallowed", async () => {
    const boom = new Error("backend down")
    const useTheme = createScopedState<Prefs>({
      scope: scopeOf(failingSource(boom)),
      key: "prefs",
      initial: { theme: "light" },
    })
    let api: ReturnType<typeof useTheme.useApi> | undefined
    function Grab(): ReactNode {
      api = useTheme.useApi()
      return null
    }
    render(
      <useTheme.Provider>
        <Grab />
      </useTheme.Provider>,
    )
    // The default report surfaces a rejected persist as an unhandled rejection (a universal Promise,
    // no host scheduler) — captured here to prove it is neither swallowed nor left to crash the host.
    // The rejection lands on the Node test runner's `unhandledRejection`, not jsdom's window event,
    // so reach the runner's process through a narrowly-typed accessor (the DOM typecheck config, by
    // design, declares no Node globals).
    interface RejectionEmitter {
      on(event: "unhandledRejection", listener: (reason: unknown) => void): void
      off(event: "unhandledRejection", listener: (reason: unknown) => void): void
    }
    const runner = (globalThis as unknown as { process: RejectionEmitter }).process
    const rejections: unknown[] = []
    const handler = (reason: unknown): void => {
      rejections.push(reason)
    }
    runner.on("unhandledRejection", handler)
    try {
      act(() => api?.set({ theme: "dark" }))
      await waitFor(() => expect(rejections).toContain(boom))
    } finally {
      runner.off("unhandledRejection", handler)
    }
  })
})

describe("createScopedState — async backend (the future remote scope)", () => {
  test("renders the seed before the backend resolves, then adopts the stored value", async () => {
    const source = asyncStateSource<Prefs>({ initial: { theme: "dark" } })
    const { useTheme, Label } = makeConsumer(scopeOf(source))
    render(
      <useTheme.Provider initialValue={{ theme: "light" }}>
        <Label />
      </useTheme.Provider>,
    )
    // The gated read has not resolved, so the seed stands — no hydration flash.
    expect(screen.getByText("theme: light")).toBeDefined()
    expect(source.pendingReads).toBeGreaterThan(0)
    await act(async () => {
      await source.releaseReads()
    })
    expect(screen.getByText("theme: dark")).toBeDefined()
  })

  test("unmounting tears down the backend subscription", async () => {
    const source = asyncStateSource<Prefs>()
    const { useTheme, Label } = makeConsumer(scopeOf(source))
    const view = render(
      <useTheme.Provider>
        <Label />
      </useTheme.Provider>,
    )
    await act(async () => {
      await source.releaseReads()
    })
    expect(source.subscriberCount).toBe(1)
    view.unmount()
    expect(source.subscriberCount).toBe(0)
  })
})

/** A source whose writes always reject — for the never-swallowed error paths. */
function failingSource(error: unknown): StateSource<Prefs> {
  return {
    capabilities: {
      access: "async",
      authority: "remote",
      durable: true,
      sharedAcrossTabs: false,
      sentToServer: false,
      availableAtImport: false,
    },
    get: async () => undefined,
    set: async () => {
      throw error
    },
    remove: async () => {},
    subscribe: () => ({ unsubscribe: () => {} }),
  }
}
