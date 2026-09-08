// @vitest-environment jsdom
// Client tests opt into jsdom per file; the package default stays `node`.

import type { StateSource } from "@plainworks/std"
import { asyncStateSource, fakeStateSource } from "@plainworks/testkit"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { StateSourceError } from "../../errors"
import type { Scope, SourceSpec } from "../../scope/scope"
import { createScopedObject } from "./scoped-object"

interface Prefs {
  theme: string
  sidebar: { collapsed: boolean }
  draft: string
}

/** Wrap a prepared source as a one-slot scope that always returns it, so a test can inspect it. */
function fixedScope(
  source: StateSource<unknown>,
  name: string,
  capabilities = source.capabilities,
): Scope {
  return {
    name,
    capabilities,
    createSource: <Value,>(_spec: SourceSpec<Value>) => source as unknown as StateSource<Value>,
  }
}

afterEach(cleanup)

describe("createScopedObject — one object, a scope per field", () => {
  test("holds fields across memory + persistent + cookie behind one callable hook", async () => {
    const user = userEvent.setup()
    const themeSource = fakeStateSource<unknown>({
      capabilities: { sentToServer: true, durable: true },
    })
    const sidebarSource = fakeStateSource<unknown>({
      capabilities: { durable: true, sharedAcrossTabs: true },
    })
    const draftSource = fakeStateSource<unknown>()
    const usePrefs = createScopedObject<Prefs>({
      fields: {
        theme: { scope: fixedScope(themeSource, "cookie"), initial: "system" },
        sidebar: { scope: fixedScope(sidebarSource, "persistent"), initial: { collapsed: false } },
        draft: { scope: fixedScope(draftSource, "memory"), initial: "" },
      },
    })
    function View(): ReactNode {
      const theme = usePrefs((s) => s.theme)
      const collapsed = usePrefs((s) => s.sidebar.collapsed)
      const api = usePrefs.useApi()
      return (
        <button type="button" onClick={() => api.set({ theme: "dark" })}>
          {theme}/{String(collapsed)}
        </button>
      )
    }
    render(
      <usePrefs.Provider>
        <View />
      </usePrefs.Provider>,
    )
    expect(screen.getByRole("button", { name: "system/false" })).toBeDefined()
    await user.click(screen.getByRole("button"))
    expect(screen.getByRole("button", { name: "dark/false" })).toBeDefined()
    // A patch writes only the named field to its own scope; the others are untouched.
    expect(themeSource.current).toBe("dark")
    expect(sidebarSource.current).toBeUndefined()
    expect(draftSource.current).toBeUndefined()
  })

  test("relocating a field is a one-line scope change with unchanged call sites", async () => {
    // The same consumer drives two composites that differ only in `draft`'s scope.
    const renderConsumer = (draftScope: Scope) => {
      const usePrefs = createScopedObject<Pick<Prefs, "draft">>({
        fields: { draft: { scope: draftScope, initial: "hi" } },
      })
      function View(): ReactNode {
        const draft = usePrefs((s) => s.draft)
        return <output>{draft}</output>
      }
      return { usePrefs, View }
    }
    const memoryLike = fixedScope(fakeStateSource<unknown>(), "memory")
    const persistentLike = fixedScope(
      fakeStateSource<unknown>({
        initial: "stored",
        capabilities: { durable: true, sharedAcrossTabs: true },
      }),
      "persistent",
    )

    const inMemory = renderConsumer(memoryLike)
    const memView = render(
      <inMemory.usePrefs.Provider>
        <inMemory.View />
      </inMemory.usePrefs.Provider>,
    )
    expect(screen.getByText("hi")).toBeDefined()
    memView.unmount()

    const persisted = renderConsumer(persistentLike)
    render(
      <persisted.usePrefs.Provider>
        <persisted.View />
      </persisted.usePrefs.Provider>,
    )
    // Same call sites; only the field's scope changed — now it reconciles to the stored value.
    await waitFor(() => expect(screen.getByText("stored")).toBeDefined())
  })

  test("a functional patch computes the next slice from the previous whole", () => {
    const usePrefs = createScopedObject({
      fields: {
        sidebar: {
          scope: fixedScope(fakeStateSource<unknown>(), "memory"),
          initial: { collapsed: false },
        },
      },
      actions: ({ set }) => ({
        toggle: () => set((s) => ({ sidebar: { collapsed: !s.sidebar.collapsed } })),
      }),
    })
    function View(): ReactNode {
      const collapsed = usePrefs((s) => s.sidebar.collapsed)
      const { toggle } = usePrefs.useApi()
      return (
        <button type="button" onClick={toggle}>
          {String(collapsed)}
        </button>
      )
    }
    render(
      <usePrefs.Provider>
        <View />
      </usePrefs.Provider>,
    )
    expect(screen.getByRole("button", { name: "false" })).toBeDefined()
    act(() => screen.getByRole("button").click())
    expect(screen.getByRole("button", { name: "true" })).toBeDefined()
  })
})

describe("createScopedObject — patch fan-out and the typed aggregate error", () => {
  test("a partial failure raises a typed aggregate naming the failed field, others still persist", async () => {
    const themeSource = fakeStateSource<unknown>()
    const badSidebar: StateSource<unknown> = {
      ...fakeStateSource<unknown>(),
      capabilities: fakeStateSource<unknown>().capabilities,
      set: async () => {
        throw new Error("sidebar backend down")
      },
    }
    const onError = vi.fn()
    const usePrefs = createScopedObject<Pick<Prefs, "theme" | "sidebar">>({
      fields: {
        theme: { scope: fixedScope(themeSource, "memory"), initial: "system" },
        sidebar: { scope: fixedScope(badSidebar, "memory"), initial: { collapsed: false } },
      },
      onError,
    })
    let api: ReturnType<typeof usePrefs.useApi> | undefined
    function Grab(): ReactNode {
      api = usePrefs.useApi()
      return null
    }
    render(
      <usePrefs.Provider>
        <Grab />
      </usePrefs.Provider>,
    )
    act(() => api?.set({ theme: "dark", sidebar: { collapsed: true } }))
    await waitFor(() => expect(onError).toHaveBeenCalledOnce())
    const error = onError.mock.calls[0]?.[0]
    expect(error).toBeInstanceOf(StateSourceError)
    expect(error.failures).toHaveLength(1)
    expect(error.failures[0].key).toBe("sidebar")
    expect(error.failures[0].cause).toBeInstanceOf(Error)
    // The healthy field still persisted — no all-or-nothing rollback of a partial write.
    expect(themeSource.current).toBe("dark")
  })

  test("an empty patch is a no-op — no write, no error", () => {
    const themeSource = fakeStateSource<unknown>({ initial: "system" })
    const onError = vi.fn()
    const usePrefs = createScopedObject({
      fields: { theme: { scope: fixedScope(themeSource, "memory"), initial: "system" } },
      onError,
    })
    let api: ReturnType<typeof usePrefs.useApi> | undefined
    function Grab(): ReactNode {
      api = usePrefs.useApi()
      return null
    }
    render(
      <usePrefs.Provider>
        <Grab />
      </usePrefs.Provider>,
    )
    act(() => api?.set({}))
    expect(api?.get()).toEqual({ theme: "system" })
    expect(onError).not.toHaveBeenCalled()
  })

  test("an unknown patch key is a typed error, not a success-shaped non-persisted write", () => {
    const themeSource = fakeStateSource<unknown>({ initial: "system" })
    const onError = vi.fn()
    const usePrefs = createScopedObject<{ theme: string }>({
      fields: { theme: { scope: fixedScope(themeSource, "memory"), initial: "system" } },
      onError,
    })
    let api: ReturnType<typeof usePrefs.useApi> | undefined
    function Grab(): ReactNode {
      api = usePrefs.useApi()
      return null
    }
    render(
      <usePrefs.Provider>
        <Grab />
      </usePrefs.Provider>,
    )
    // Cast through a loose shape: a JS caller (or an unchecked functional patch) can supply a key
    // that is not a configured field — it must be rejected, not silently merged as a success.
    act(() => (api as { set(patch: Record<string, unknown>): void } | undefined)?.set({ nope: 1 }))
    expect(onError).toHaveBeenCalledOnce()
    const error = onError.mock.calls[0]?.[0]
    expect(error).toBeInstanceOf(StateSourceError)
    expect(error.failures[0].key).toBe("nope")
    // The mirror was not mutated with the unknown key.
    expect(api?.get()).toEqual({ theme: "system" })
    expect("nope" in (api?.get() ?? {})).toBe(false)
  })

  test("a prototype-chain key (toString, constructor) is treated as unknown, not a spurious hit", () => {
    const themeSource = fakeStateSource<unknown>({ initial: "system" })
    const onError = vi.fn()
    const usePrefs = createScopedObject<{ theme: string }>({
      fields: { theme: { scope: fixedScope(themeSource, "memory"), initial: "system" } },
      onError,
    })
    let api: ReturnType<typeof usePrefs.useApi> | undefined
    function Grab(): ReactNode {
      api = usePrefs.useApi()
      return null
    }
    render(
      <usePrefs.Provider>
        <Grab />
      </usePrefs.Provider>,
    )
    // `toString` lives on `Object.prototype`; a plain-object registry would report it "configured"
    // and then invoke the inherited member — a `TypeError`. The `Map` registry rejects it as
    // unknown.
    act(() =>
      (api as { set(patch: Record<string, unknown>): void } | undefined)?.set({ toString: 1 }),
    )
    expect(onError).toHaveBeenCalledOnce()
    const error = onError.mock.calls[0]?.[0]
    expect(error).toBeInstanceOf(StateSourceError)
    expect(error.failures[0].key).toBe("toString")
    expect(api?.get()).toEqual({ theme: "system" })
  })

  test("remove resets every field to its initial and clears each backend", () => {
    const themeSource = fakeStateSource<unknown>({ initial: "dark" })
    const draftSource = fakeStateSource<unknown>({ initial: "wip" })
    const usePrefs = createScopedObject<Pick<Prefs, "theme" | "draft">>({
      fields: {
        theme: { scope: fixedScope(themeSource, "memory"), initial: "system" },
        draft: { scope: fixedScope(draftSource, "memory"), initial: "" },
      },
    })
    let api: ReturnType<typeof usePrefs.useApi> | undefined
    function Grab(): ReactNode {
      api = usePrefs.useApi()
      return null
    }
    render(
      <usePrefs.Provider>
        <Grab />
      </usePrefs.Provider>,
    )
    act(() => api?.remove())
    expect(api?.get()).toEqual({ theme: "system", draft: "" })
    expect(themeSource.current).toBeUndefined()
    expect(draftSource.current).toBeUndefined()
  })
})

describe("createScopedObject — namespace and async fields", () => {
  test("namespace prefixes each field key so two composites can share a scope", () => {
    const keys: string[] = []
    const spyScope: Scope = {
      name: "memory",
      capabilities: fakeStateSource<unknown>().capabilities,
      createSource: <Value,>(spec: SourceSpec<Value>) => {
        keys.push(spec.key)
        return fakeStateSource<Value>()
      },
    }
    const usePrefs = createScopedObject<Pick<Prefs, "theme">>({
      namespace: "prefs",
      fields: { theme: { scope: spyScope, initial: "system" } },
    })
    render(<usePrefs.Provider>{null}</usePrefs.Provider>)
    expect(keys).toContain("prefs:theme")
  })

  test("a field's explicit key overrides the field name", () => {
    const keys: string[] = []
    const spyScope: Scope = {
      name: "memory",
      capabilities: fakeStateSource<unknown>().capabilities,
      createSource: <Value,>(spec: SourceSpec<Value>) => {
        keys.push(spec.key)
        return fakeStateSource<Value>()
      },
    }
    const usePrefs = createScopedObject<Pick<Prefs, "theme">>({
      fields: { theme: { scope: spyScope, key: "color-theme", initial: "system" } },
    })
    render(<usePrefs.Provider>{null}</usePrefs.Provider>)
    expect(keys).toEqual(["color-theme"])
  })

  test("an async field drives the composite unchanged — seed first, then reconcile", async () => {
    const draftSource = asyncStateSource<unknown>({ initial: "recovered" })
    const usePrefs = createScopedObject<Pick<Prefs, "theme" | "draft">>({
      fields: {
        theme: { scope: fixedScope(fakeStateSource<unknown>(), "memory"), initial: "system" },
        draft: { scope: fixedScope(draftSource, "remote", draftSource.capabilities), initial: "" },
      },
    })
    function View(): ReactNode {
      const draft = usePrefs((s) => s.draft)
      return <output>draft: {draft || "empty"}</output>
    }
    render(
      <usePrefs.Provider>
        <View />
      </usePrefs.Provider>,
    )
    // The async field has not resolved, so its seed stands (no hydration flash).
    expect(screen.getByText("draft: empty")).toBeDefined()
    await act(async () => {
      await draftSource.releaseReads()
    })
    expect(screen.getByText("draft: recovered")).toBeDefined()
  })

  test("unmounting tears down every field subscription", async () => {
    const themeSource = fakeStateSource<unknown>()
    const draftSource = asyncStateSource<unknown>()
    const usePrefs = createScopedObject<Pick<Prefs, "theme" | "draft">>({
      fields: {
        theme: { scope: fixedScope(themeSource, "memory"), initial: "system" },
        draft: { scope: fixedScope(draftSource, "remote", draftSource.capabilities), initial: "" },
      },
    })
    const view = render(<usePrefs.Provider>{null}</usePrefs.Provider>)
    await act(async () => {
      await draftSource.releaseReads()
    })
    expect(themeSource.subscriberCount).toBe(1)
    expect(draftSource.subscriberCount).toBe(1)
    view.unmount()
    expect(themeSource.subscriberCount).toBe(0)
    expect(draftSource.subscriberCount).toBe(0)
  })
})
