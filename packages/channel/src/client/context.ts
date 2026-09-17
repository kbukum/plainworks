"use client"

import type { StreamFrame } from "@plainworks/std"
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
import { type Channel, type ChannelOptions, type ChannelStatus, createChannel } from "../lifecycle"

/** Props for the {@link ChannelContext.ChannelProvider}. */
export interface ChannelProviderProps {
  /**
   * Channel configuration, read **once** when the Provider mounts (like a per-request store).
   * Change the transport or auth by remounting under a new `key`, not by mutating this between
   * renders.
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
   * Subscribe to frames of one `type` for the component's lifetime. The latest `listener` is always
   * called (no stale closure) and the subscription is torn down on unmount — explicit ownership, no
   * leak. Pass `"*"` semantics via {@link useAnyChannelEvent} for every frame.
   */
  readonly useChannelEvent: (type: string, listener: (frame: StreamFrame) => void) => void
  /** Subscribe to **every** frame for the component's lifetime, torn down on unmount. */
  readonly useAnyChannelEvent: (listener: (frame: StreamFrame) => void) => void
}

interface ChannelHandle {
  readonly channel: Channel
  getStatus(): ChannelStatus
  subscribeStatus(onChange: () => void): () => void
  /** (Optionally) connect the channel on mount; returns its teardown (close on unmount). */
  activate(autoConnect: boolean): () => void
}

/**
 * Create a React binding for a {@link Channel}: a `ChannelProvider` plus hooks. The Provider owns a
 * stable per-mount handle (via `useRef`) — never a module-level singleton — so two concurrent SSR
 * requests each get an isolated stream. The channel is re-connectable, so a StrictMode / remount
 * cycle just closes and reconnects the same channel. Status is exposed through
 * `useSyncExternalStore`, so a consumer re-renders exactly on a lifecycle transition. DOM-free:
 * works in the browser, in a Next client tree, and under React Native.
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

    // The handle is stable (built once via the ref); each mount connects the channel and closes it
    // on unmount. The channel is re-connectable, so a StrictMode / remount cycle reconnects the
    // same channel rather than leaking or reusing a permanently closed one.
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

  function useChannelEvent(type: string, listener: (frame: StreamFrame) => void): void {
    const channel = useChannel()
    const listenerRef = useLatest(listener)
    useEffect(() => {
      const subscription = channel.on(type, (frame) => listenerRef.current(frame))
      return () => subscription.unsubscribe()
    }, [channel, type, listenerRef])
  }

  function useAnyChannelEvent(listener: (frame: StreamFrame) => void): void {
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
 * Build the stable handle a Provider mounts: a status store plus the {@link Channel} itself.
 * Because the channel is re-connectable, the handle holds one channel for the Provider's lifetime —
 * consumers subscribe to it directly (subscriptions and the resume cursor outlive any session), and
 * a StrictMode / remount cycle simply closes and reconnects it. No rebuilding, no listener
 * rebinding: the core owns reconnect.
 */
function buildHandle(options: ChannelOptions): ChannelHandle {
  const statusListeners = new Set<() => void>()
  let status: ChannelStatus = "idle"

  const notifyStatus = (): void => {
    for (const listener of [...statusListeners]) {
      listener()
    }
  }

  const channel = createChannel({
    ...options,
    onStatusChange: (next) => {
      status = next
      notifyStatus()
      options.onStatusChange?.(next)
    },
  })

  return {
    channel,
    getStatus: () => status,
    subscribeStatus: (onChange) => {
      statusListeners.add(onChange)
      return () => statusListeners.delete(onChange)
    },
    activate: (autoConnect) => {
      if (autoConnect) {
        channel.connect()
      }
      return () => channel.close()
    },
  }
}

/** Keep a ref to the latest value each render, so an effect reads it without re-subscribing. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}
