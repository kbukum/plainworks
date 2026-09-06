// @vitest-environment jsdom
// Client tests opt into jsdom per file; the package default stays `node` so the server-safe `.`
// entry can never lean on DOM globals unnoticed.
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import type { ReactNode } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup, renderToString } from "react-dom/server"
import { afterEach, describe, expect, test } from "vitest"
import { StateError } from "../errors"
import type { Store } from "../store"
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
})
