// @vitest-environment jsdom
// Client tests opt into jsdom per file; the package default stays `node` so the server-safe `.`
// entry can never lean on DOM globals unnoticed.
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import type { ReactNode } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup, renderToString } from "react-dom/server"
import { afterEach, describe, expect, test, vi } from "vitest"
import { StateConfigError, StateError } from "../errors"
import type { Store } from "../store"
import { createSuppliedStoreContext, type SuppliedStoreProviderProps } from "./binding"
import { createStoreContext } from "./context"

interface Counter {
  count: number
  inc: () => void
}

const { Provider, useStore, useStoreApi } = createStoreContext<Counter>((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 })),
}))

function CountLabel(): ReactNode {
  const count = useStore((state) => state.count)
  return <output>count: {count}</output>
}

function IncButton(): ReactNode {
  const inc = useStore((state) => state.inc)
  return (
    <button type="button" onClick={inc}>
      inc
    </button>
  )
}

afterEach(cleanup)

describe("createStoreContext", () => {
  test("selector hook renders and re-renders when its slice changes", async () => {
    const user = userEvent.setup()
    render(
      <Provider>
        <CountLabel />
        <IncButton />
      </Provider>,
    )
    expect(screen.getByRole("status").textContent).toBe("count: 0")

    await user.click(screen.getByRole("button", { name: "inc" }))
    expect(screen.getByRole("status").textContent).toBe("count: 1")
  })

  test("no-argument useStore returns the whole state", () => {
    function Whole(): ReactNode {
      const state = useStore()
      return <output>whole: {state.count}</output>
    }
    render(
      <Provider initialState={{ count: 2 }}>
        <Whole />
      </Provider>,
    )
    expect(screen.getByRole("status").textContent).toBe("whole: 2")
  })

  test("useStoreApi exposes the per-request store for imperative reads", () => {
    const captured: { store: Store<Counter> | null } = { store: null }
    function Capture(): ReactNode {
      captured.store = useStoreApi()
      return null
    }
    render(
      <Provider initialState={{ count: 7 }}>
        <Capture />
      </Provider>,
    )
    expect(captured.store?.getState().count).toBe(7)
  })

  test("selector hook throws a StateError outside its Provider", () => {
    expect(() => renderToStaticMarkup(<CountLabel />)).toThrow(StateError)
  })

  test("keeps the same per-mount store across Provider re-renders", () => {
    const seen: Store<Counter>[] = []
    function Capture(): ReactNode {
      seen.push(useStoreApi())
      return null
    }
    const { rerender } = render(
      <Provider>
        <Capture />
      </Provider>,
    )
    rerender(
      <Provider>
        <Capture />
      </Provider>,
    )
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[0]).toBe(seen[seen.length - 1])
  })

  test("rendered provider tree has no axe accessibility violations", async () => {
    const { container } = render(
      <Provider>
        <CountLabel />
        <IncButton />
      </Provider>,
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })

  test("custom mergeInitialState preserves a non-record state shape during hydration", () => {
    class Meter {
      constructor(readonly count: number) {}
    }
    const meter = createStoreContext<Meter>(() => new Meter(0), {
      mergeInitialState: (initial, serverState) => new Meter(serverState.count ?? initial.count),
    })
    const captured: { state: Meter | null } = { state: null }
    function Capture(): ReactNode {
      captured.state = meter.useStoreApi().getState()
      return null
    }
    render(
      <meter.Provider initialState={{ count: 4 }}>
        <Capture />
      </meter.Provider>,
    )
    // A shallow spread would have flattened the instance into a plain object.
    expect(captured.state).toBeInstanceOf(Meter)
    expect(captured.state?.count).toBe(4)
  })

  test("two mounted Providers hold isolated stores", async () => {
    const user = userEvent.setup()
    const first = render(
      <Provider>
        <CountLabel />
        <IncButton />
      </Provider>,
    )
    const second = render(
      <Provider>
        <CountLabel />
      </Provider>,
    )

    await user.click(within(first.container).getByRole("button", { name: "inc" }))
    expect(within(first.container).getByRole("status").textContent).toBe("count: 1")
    expect(within(second.container).getByRole("status").textContent).toBe("count: 0")
  })

  test("SSR: server markup hydrates the server-provided state without a mismatch", async () => {
    const ui = (
      <Provider initialState={{ count: 5 }}>
        <CountLabel />
        <IncButton />
      </Provider>
    )
    const container = document.createElement("div")
    container.innerHTML = renderToString(ui)
    document.body.appendChild(container)

    const recoverableErrors: unknown[] = []
    let root: Root | undefined
    await act(async () => {
      root = hydrateRoot(container, ui, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
    })

    // The hydrated tree matches the server markup and is live: interaction updates the store.
    expect(within(container).getByRole("status").textContent).toBe("count: 5")
    const user = userEvent.setup()
    await user.click(within(container).getByRole("button", { name: "inc" }))
    expect(within(container).getByRole("status").textContent).toBe("count: 6")
    expect(recoverableErrors).toEqual([])

    act(() => root?.unmount())
    container.remove()
  })

  test("SSR: two requests render isolated stores from their own initial state", () => {
    // `renderToString` interleaves `<!-- -->` text-node separators, so assert the parsed DOM.
    const renderRequest = (count: number): string => {
      const markup = renderToString(
        <Provider initialState={{ count }}>
          <CountLabel />
        </Provider>,
      )
      const doc = new DOMParser().parseFromString(markup, "text/html")
      return doc.querySelector("output")?.textContent ?? ""
    }
    expect(renderRequest(5)).toBe("count: 5")
    expect(renderRequest(9)).toBe("count: 9")
  })

  test("SSR: an allocating selector caches the server snapshot (no useSyncExternalStore warning)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    function AllocSlice(): ReactNode {
      // A fresh object every call: only a cached server snapshot keeps `useSyncExternalStore` from
      // seeing a new reference on each SSR/hydration read.
      const slice = useStore((state) => ({ count: state.count }))
      return <output>alloc: {slice.count}</output>
    }
    const ui = (
      <Provider initialState={{ count: 3 }}>
        <AllocSlice />
      </Provider>
    )
    const container = document.createElement("div")
    container.innerHTML = renderToString(ui)
    document.body.appendChild(container)

    const recoverableErrors: unknown[] = []
    let root: Root | undefined
    await act(async () => {
      root = hydrateRoot(container, ui, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
    })

    expect(within(container).getByRole("status").textContent).toBe("alloc: 3")
    expect(recoverableErrors).toEqual([])
    const snapshotWarnings = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("getServerSnapshot"),
    )
    expect(snapshotWarnings).toEqual([])

    act(() => root?.unmount())
    container.remove()
    consoleError.mockRestore()
  })
})

/**
 * A hand-rolled {@link Store} with zero dependency on the default engine — proof the seam is
 * genuinely open. This file imports no engine (`zustand`) at all, yet drives the Provider and both
 * hooks end to end, so a consumer who already runs their own store can plug it straight in.
 */
function makeManualStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<(state: T, previous: T) => void>()
  const setState = (patch: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean) => {
    const previous = state
    const next =
      typeof patch === "function" ? (patch as (state: T) => T | Partial<T>)(state) : patch
    state = replace === true ? (next as T) : { ...state, ...(next as Partial<T>) }
    for (const listener of listeners) {
      listener(state, previous)
    }
  }
  return {
    getState: () => state,
    getInitialState: () => initial,
    setState: setState as Store<T>["setState"],
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

describe("createStoreContext with a bring-your-own store", () => {
  interface Session {
    user: string
  }
  const {
    Provider: SessionProvider,
    useStore: useSession,
    useStoreApi: useSessionApi,
  } = createSuppliedStoreContext<Session>()

  function UserLabel(): ReactNode {
    const user = useSession((state) => state.user)
    return <output>user: {user}</output>
  }

  function SignInButton(): ReactNode {
    const api = useSessionApi()
    return (
      <button type="button" onClick={() => api.setState({ user: "ada" })}>
        sign in
      </button>
    )
  }

  test("drives the Provider and hooks, re-rendering on the manual store's updates", async () => {
    const user = userEvent.setup()
    const store = makeManualStore<Session>({ user: "anon" })
    render(
      <SessionProvider store={store}>
        <UserLabel />
        <SignInButton />
      </SessionProvider>,
    )
    expect(screen.getByRole("status").textContent).toBe("user: anon")

    await user.click(screen.getByRole("button", { name: "sign in" }))
    expect(screen.getByRole("status").textContent).toBe("user: ada")
    expect(store.getState().user).toBe("ada")
  })

  test("a supplied-store context rendered without a store throws a StateConfigError", () => {
    // The `store` prop is type-required; a JavaScript caller that omits it still fails loudly with
    // the config discriminant (no Provider lookup happened, so it is not a missing-provider error).
    const props = { children: <UserLabel /> } as unknown as SuppliedStoreProviderProps<Session>
    expect(() => renderToStaticMarkup(<SessionProvider {...props} />)).toThrow(StateConfigError)
  })

  test("createStoreContext without an initializer throws a StateConfigError", () => {
    const factory = createStoreContext as unknown as () => unknown
    expect(() => factory()).toThrow(StateConfigError)
  })

  test("Provider prop types enforce the store contract", () => {
    const supplied = createSuppliedStoreContext<Session>()
    const store = makeManualStore<Session>({ user: "x" })
    type SuppliedProps = Parameters<typeof supplied.Provider>[0]
    const ok: SuppliedProps = { store, children: null }
    expect(ok.store).toBe(store)

    const counter = createStoreContext<Counter>((set) => ({
      count: 0,
      inc: () => set((s) => ({ count: s.count + 1 })),
    }))
    type DefaultProps = Parameters<typeof counter.Provider>[0]

    // @ts-expect-error the supplied Provider requires a `store` (no default engine to fall back to)
    const missingStore: SuppliedProps = { children: null }
    // @ts-expect-error the default-engine Provider has no `store` prop
    const extraStore: DefaultProps = { store, children: null }
    expect(missingStore).toBeDefined()
    expect(extraStore).toBeDefined()
  })

  test("the manual store's initial state is the server snapshot", () => {
    const store = makeManualStore<Session>({ user: "ssr-user" })
    const markup = renderToString(
      <SessionProvider store={store}>
        <UserLabel />
      </SessionProvider>,
    )
    const doc = new DOMParser().parseFromString(markup, "text/html")
    expect(doc.querySelector("output")?.textContent).toBe("user: ssr-user")
  })
})
