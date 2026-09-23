import { createStore } from "@plainworks/state"
import { describe, expect, it, vi } from "vitest"
import { createDevtoolsSession } from "../../session"
import { fakeSource } from "../../testing/fake-source"
import { createStateSource, type StateSourceOptions } from "./state-source"

interface CartState {
  readonly items: readonly string[]
  readonly coupon: string | null
  readonly compute?: () => number
}

function cartStore(initial: CartState) {
  return createStore<CartState>(() => initial)
}

function setup<State>(options: StateSourceOptions<State>) {
  const session = createDevtoolsSession()
  const source = createStateSource(options)
  session.registerSource(source)
  return { session, source, port: session.connect() }
}

describe("createStateSource", () => {
  it("requires an explicit instance identity", () => {
    const session = createDevtoolsSession()
    session.registerSource(
      createStateSource({
        store: cartStore({ items: [], coupon: null }),
        instance: "cart",
        snapshot: (state) => state,
      }),
    )
    session.registerSource(
      createStateSource({
        store: cartStore({ items: [], coupon: null }),
        instance: "wishlist",
        snapshot: (state) => state,
      }),
    )
    expect(
      session
        .connect()
        .snapshot()
        .sources.map((source) => source.id),
    ).toEqual([
      { kind: "state", instance: "cart" },
      { kind: "state", instance: "wishlist" },
    ])
  })

  it("emits a bounded change summary with the changed top-level keys", () => {
    const store = cartStore({ items: [], coupon: null })
    const { port } = setup({
      store,
      instance: "cart",
      now: () => 1_000,
      intervalMs: 0,
      snapshot: (state) => state,
    })
    store.setState({ items: ["book"] })
    const events = port.snapshot().events
    expect(events).toHaveLength(1)
    expect(events[0]?.event.kind).toBe("state.change")
    expect(events[0]?.event.summary).toEqual({ changed: ["items"] })
  })

  it("coalesces a rapid burst into one event per interval", () => {
    vi.useFakeTimers()
    try {
      let current = 1_000
      const store = cartStore({ items: [], coupon: null })
      const { port } = setup({
        store,
        instance: "cart",
        now: () => current,
        intervalMs: 250,
        snapshot: (state) => state,
      })
      store.setState({ items: ["a"] })
      store.setState({ items: ["a", "b"] })
      store.setState({ items: ["a", "b", "c"] })
      expect(port.snapshot().events).toHaveLength(1)
      current += 250
      vi.advanceTimersByTime(250)
      const events = port.snapshot().events
      expect(events).toHaveLength(2)
      expect(events[1]?.event.summary).toEqual({ changed: ["items"] })
    } finally {
      vi.useRealTimers()
    }
  })

  it("derives change summaries from projected state so excluded keys never leak", () => {
    const store = cartStore({ items: ["book"], coupon: "SECRET" })
    const { port } = setup({
      store,
      instance: "cart",
      now: () => 1_000,
      intervalMs: 0,
      snapshot: (state) => ({ items: state.items }),
    })
    store.setState({ items: ["book", "pen"], coupon: "NEW_SECRET" })
    const event = port.snapshot().events[0]
    expect(event?.event.summary).toEqual({ changed: ["items"] })
  })

  it("publishes a health indicator with the change count", () => {
    const store = cartStore({ items: [], coupon: null })
    const { port } = setup({
      store,
      instance: "cart",
      now: () => 1_000,
      intervalMs: 0,
      snapshot: (state) => state,
    })
    store.setState({ items: ["a"] })
    store.setState({ coupon: "SAVE" })
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "state")
    expect(indicator?.indicator.value).toBe("2 changes")
    expect(indicator?.indicator.target).toBe("state")
    expect(indicator?.indicator.severity).toBe("ok")
  })

  it("loads the full snapshot on demand, sanitized by the session", async () => {
    const store = cartStore({
      items: ["book"],
      coupon: "SAVE",
      compute: () => 42,
    })
    const { port } = setup({
      store,
      instance: "cart",
      now: () => 1_000,
      intervalMs: 0,
      snapshot: (state) => state,
    })
    store.setState({ items: ["book", "pen"] })
    const event = port.snapshot().events[0]
    const result = await port.requestDetail(
      { kind: "state", instance: "cart" },
      event?.event.detail ?? "",
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.value).toEqual({
        items: ["book", "pen"],
        coupon: "SAVE",
        compute: "[Function]",
      })
    }
  })

  it("applies the consumer snapshot projection before anything is retained", async () => {
    const store = cartStore({ items: ["book"], coupon: "SECRET" })
    const { port } = setup({
      store,
      instance: "cart",
      now: () => 1_000,
      intervalMs: 0,
      snapshot: (state) => ({ items: state.items }),
    })
    store.setState({ items: ["book", "pen"] })
    const event = port.snapshot().events[0]
    const result = await port.requestDetail(
      { kind: "state", instance: "cart" },
      event?.event.detail ?? "",
    )
    if (result.ok) expect(result.value.value).toEqual({ items: ["book", "pen"] })
  })

  it("is read-only: it advertises no commands", () => {
    const { port } = setup({
      store: cartStore({ items: [], coupon: null }),
      instance: "cart",
      snapshot: (state) => state,
    })
    expect(port.snapshot().sources[0]?.commands).toEqual([])
  })

  it("stops observing after teardown", () => {
    const store = cartStore({ items: [], coupon: null })
    const session = createDevtoolsSession()
    const registration = session.registerSource(
      createStateSource({
        store,
        instance: "cart",
        now: () => 1_000,
        intervalMs: 0,
        snapshot: (state) => state,
      }),
    )
    const port = session.connect()
    registration.unsubscribe()
    store.setState({ items: ["late"] })
    expect(port.snapshot().events).toHaveLength(0)
  })

  it("isolates a snapshot failure without taking down other sources", async () => {
    const store = cartStore({ items: [], coupon: null })
    const session = createDevtoolsSession()
    const healthy = fakeSource({ kind: "query", instance: "main" }, { label: "Query" })
    session.registerSource(healthy)
    session.registerSource(
      createStateSource({
        store,
        instance: "cart",
        now: () => 1_000,
        intervalMs: 0,
        snapshot: () => {
          throw new Error("schema exploded")
        },
      }),
    )
    const port = session.connect()
    store.setState({ items: ["a"] })
    const event = port.snapshot().events[0]
    const result = await port.requestDetail(
      { kind: "state", instance: "cart" },
      event?.event.detail ?? "",
    )
    expect(result.ok).toBe(false)
    expect(port.snapshot().failures).toHaveLength(1)
    healthy.emit({ kind: "fetch", label: "still fine", severity: "ok", at: 1 })
    expect(port.snapshot().events.some((entry) => entry.event.label === "still fine")).toBe(true)
  })

  it("clears a source failure after the next healthy projection", () => {
    const store = cartStore({ items: [], coupon: null })
    let broken = true
    const { port } = setup({
      store,
      instance: "cart",
      now: () => 1_000,
      intervalMs: 0,
      snapshot: (state) => {
        if (broken) throw new Error("schema exploded")
        return state
      },
    })
    store.setState({ items: ["a"] })
    expect(port.snapshot().failures).toHaveLength(1)
    broken = false
    store.setState({ items: ["a", "b"] })
    expect(port.snapshot().failures).toHaveLength(0)
  })
})
