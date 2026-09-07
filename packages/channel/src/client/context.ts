"use client"

import type { Listener, Subscription } from "@plainworks/std"
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react"
import { ChannelError } from "../error"
import { type Channel, type ChannelOptions, createChannel } from "../lifecycle/channel"
import type { ChannelStatus } from "../lifecycle/status"
import type { ChannelFrame } from "../transport"

/** Props for the {@link ChannelContext.ChannelProvider}. */
export interface ChannelProviderProps {
  /**
   * Channel configuration, read **once** when the Provider mounts (like a per-request store). Change the transport or auth by remounting under a new `key`, not by mutating this between renders.
   */
  readonly options: ChannelOptions
  /** Connect on mount and close on unmount. Default `true`. */
  readonly autoConnect?: boolean
  readonly children: ReactNode
}

/** The Provider plus channel hooks returned by {@link createChannelContext}. */
export interface ChannelContext {
  /** Owns a stable per-mount handle, activating a fresh {@link Channel} on mount and tearing it down on unmount. */
  readonly ChannelProvider: (props: ChannelProviderProps) => ReactNode
  /** The current channel; throws when used outside its Provider. */
  readonly useChannel: () => Channel
  /** The live {@link ChannelStatus}, re-rendering the caller on every transition. */
  readonly useChannelStatus: () => ChannelStatus
  /**
   * Subscribe to frames of one `type` for the component's lifetime. The latest `listener` is always called (no stale closure) and the subscription is torn down on unmount — explicit ownership, no leak. Pass `"*"` semantics via {@link useAnyChannelEvent} for every frame.
   */
  readonly useChannelEvent: (type: string, listener: (frame: ChannelFrame) => void) => void
  /** Subscribe to **every** frame for the component's lifetime, torn down on unmount. */
  readonly useAnyChannelEvent: (listener: (frame: ChannelFrame) => void) => void
}

interface ChannelHandle {
  readonly channel: Channel
  getStatus(): ChannelStatus
  subscribeStatus(onChange: () => void): () => void
  /** Build and (optionally) connect a fresh underlying channel; returns its teardown. */
  activate(autoConnect: boolean): () => void
}

/**
 * Create a React binding for a {@link Channel}: a `ChannelProvider` plus hooks. The Provider owns a stable per-mount handle (via `useRef`) — never a module-level singleton — so two concurrent SSR requests each get an isolated stream; the underlying channel is (re)built on each activation, so a StrictMode / remount cycle reconnects cleanly instead of reusing a terminally closed channel. Status is exposed through `useSyncExternalStore`, so a consumer re-renders exactly on a lifecycle transition. DOM-free: works in the browser, in a Next client tree, and under React Native.
 */
export function createChannelContext(): ChannelContext {
  const Context = createContext<ChannelHandle | null>(null)

  function useHandle(hook: string): ChannelHandle {
    const handle = useContext(Context)
    if (handle === null) {
      throw ChannelError.config(`${hook} must be used within its ChannelProvider`)
    }
    return handle
  }

  function ChannelProvider({
    options,
    autoConnect = true,
    children,
  }: ChannelProviderProps): ReactNode {
    const handleRef = useRef<ChannelHandle | null>(null)
    if (handleRef.current === null) {
      handleRef.current = buildHandle(options)
    }
    const handle = handleRef.current

    // The handle is stable (built once via the ref); each mount activates a fresh underlying channel and tears it down on unmount. Because the channel's `close()` is terminal, activation rebuilds it — so a StrictMode / remount cycle reconnects rather than reusing a permanently closed channel.
    useEffect(() => handle.activate(autoConnect), [handle, autoConnect])

    return createElement(Context.Provider, { value: handle }, children)
  }

  function useChannel(): Channel {
    return useHandle("useChannel").channel
  }

  function useChannelStatus(): ChannelStatus {
    const handle = useHandle("useChannelStatus")
    return useSyncExternalStore(handle.subscribeStatus, handle.getStatus, handle.getStatus)
  }

  function useChannelEvent(type: string, listener: (frame: ChannelFrame) => void): void {
    const channel = useChannel()
    const listenerRef = useLatest(listener)
    useEffect(() => {
      const subscription = channel.on(type, (frame) => listenerRef.current(frame))
      return () => subscription.unsubscribe()
    }, [channel, type, listenerRef])
  }

  function useAnyChannelEvent(listener: (frame: ChannelFrame) => void): void {
    const channel = useChannel()
    const listenerRef = useLatest(listener)
    useEffect(() => {
      const subscription = channel.onAny((frame) => listenerRef.current(frame))
      return () => subscription.unsubscribe()
    }, [channel, listenerRef])
  }

  return { ChannelProvider, useChannel, useChannelStatus, useChannelEvent, useAnyChannelEvent }
}

/**
 * Build the stable handle a Provider mounts: a status store plus a {@link Channel} **façade** over a swappable underlying channel. Consumers hold the façade (via `useChannel`) and subscribe through it, so the Provider can rebuild the underlying channel on each activation — the channel's `close()` is terminal, so surviving a StrictMode / remount means a fresh channel each mount — while durable subscriptions are rebound to the new channel and the status store stays put. The latest event id is carried across rebuilds so a reconnect resumes where the previous channel left off.
 */
function buildHandle(options: ChannelOptions): ChannelHandle {
  interface Binding {
    sub: Subscription | undefined
  }
  const typeBindings = new Map<string, Map<Listener<ChannelFrame>, Binding>>()
  const anyBindings = new Map<Listener<ChannelFrame>, Binding>()
  const statusListeners = new Set<() => void>()

  let inner: Channel | undefined
  let status: ChannelStatus = "idle"
  let lastEventId = options.lastEventId

  const notifyStatus = (): void => {
    for (const listener of [...statusListeners]) {
      listener()
    }
  }

  const build = (): Channel => {
    const channel = createChannel({
      ...options,
      // Pass the live cursor unconditionally — a conditional spread would let an empty-id reset
      // (`undefined`) fall back to the original options seed on rebuild, resuming from stale state.
      lastEventId,
      onStatusChange: (next) => {
        status = next
        notifyStatus()
        options.onStatusChange?.(next)
      },
    })
    inner = channel
    // A rebuilt channel starts idle — never inherit the predecessor's terminal `closed` status (e.g. an autoConnect true→false transition would otherwise leave useChannelStatus stale).
    status = channel.status
    notifyStatus()
    // Rebind every durable listener onto the fresh channel.
    for (const [type, bindings] of typeBindings) {
      for (const [listener, binding] of bindings) {
        binding.sub = channel.on(type, listener)
      }
    }
    for (const [listener, binding] of anyBindings) {
      binding.sub = channel.onAny(listener)
    }
    return channel
  }

  const teardown = (): void => {
    for (const bindings of typeBindings.values()) {
      for (const binding of bindings.values()) {
        binding.sub?.unsubscribe()
        binding.sub = undefined
      }
    }
    for (const binding of anyBindings.values()) {
      binding.sub?.unsubscribe()
      binding.sub = undefined
    }
    const current = inner
    inner = undefined
    if (current !== undefined) {
      // Preserve the inner channel's cursor exactly — including a reset to `undefined` (an SSE empty-id reset), which a `??` fallback would wrongly replace with the stale previous id.
      lastEventId = current.lastEventId
      current.close()
    }
  }

  const channel: Channel = {
    connect: () => (inner ?? build()).connect(),
    close: () => teardown(),
    on(type, listener): Subscription {
      let bindings = typeBindings.get(type)
      if (bindings === undefined) {
        bindings = new Map()
        typeBindings.set(type, bindings)
      }
      const binding: Binding = { sub: inner?.on(type, listener) }
      bindings.set(listener, binding)
      return {
        unsubscribe: () => {
          binding.sub?.unsubscribe()
          binding.sub = undefined
          bindings?.delete(listener)
        },
      }
    },
    onAny(listener): Subscription {
      const binding: Binding = { sub: inner?.onAny(listener) }
      anyBindings.set(listener, binding)
      return {
        unsubscribe: () => {
          binding.sub?.unsubscribe()
          binding.sub = undefined
          anyBindings.delete(listener)
        },
      }
    },
    get status(): ChannelStatus {
      return status
    },
    get lastEventId(): string | undefined {
      return inner !== undefined ? inner.lastEventId : lastEventId
    },
  }

  return {
    channel,
    getStatus: () => status,
    subscribeStatus: (onChange) => {
      statusListeners.add(onChange)
      return () => statusListeners.delete(onChange)
    },
    activate: (autoConnect) => {
      // A prior activation left no live channel in normal flow; guard against a stray one anyway.
      if (inner !== undefined) {
        teardown()
      }
      const built = build()
      if (autoConnect) {
        built.connect()
      }
      return () => teardown()
    },
  }
}

/** Keep a ref to the latest value each render, so an effect reads it without re-subscribing. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}
