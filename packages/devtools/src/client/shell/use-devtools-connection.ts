"use client"

import { err } from "@plainworks/std"
import { useEffect, useState, useSyncExternalStore } from "react"
import { type DevtoolsClientPort, type DevtoolsSession, RequestError } from "../../session"
import { createDevtoolsStore, type DevtoolsStore, type DevtoolsStoreState } from "../../store"

/** The live connection a shell builds over a host-owned session. */
export interface DevtoolsConnection {
  readonly port: DevtoolsClientPort
  readonly store: DevtoolsStore
  readonly state: DevtoolsStoreState
}

const EMPTY_STORE_STATE: DevtoolsStoreState = {
  sources: [],
  failures: new Map(),
  events: [],
  indicators: [],
  droppedAggregate: 0,
  droppedBySource: new Map(),
  paused: false,
  disposed: false,
}

const EMPTY_PORT: DevtoolsClientPort = {
  subscribe: () => ({ unsubscribe: () => {} }),
  snapshot: () => ({
    sources: [],
    events: [],
    indicators: [],
    failures: [],
    droppedAggregate: 0,
    droppedBySource: [],
  }),
  requestDetail: () =>
    Promise.resolve(err(new RequestError("devtools/session-disposed", "Not connected."))),
  runCommand: () =>
    Promise.resolve(err(new RequestError("devtools/session-disposed", "Not connected."))),
  dispose: () => {},
}

const EMPTY_STORE: DevtoolsStore = {
  getSnapshot: () => EMPTY_STORE_STATE,
  subscribe: () => ({ unsubscribe: () => {} }),
  pause: () => {},
  resume: () => {},
  clear: () => {},
  dispose: () => {},
}

/**
 * Connect a client shell to a host-owned session: open a port, build the store over it, and
 * subscribe React to it via `useSyncExternalStore`.
 *
 * The connection is acquired only on a committed mount (inside an effect) and paired with
 * teardown, so React Strict Mode or concurrent aborts never leak connections. In SSR, a stable
 * server snapshot is returned.
 */
export function useDevtoolsConnection(session: DevtoolsSession): DevtoolsConnection {
  const [connection, setConnection] = useState<{
    readonly port: DevtoolsClientPort
    readonly store: DevtoolsStore
  } | null>(null)

  useEffect(() => {
    const port = session.connect()
    const store = createDevtoolsStore(port)
    setConnection({ port, store })
    return () => {
      store.dispose()
      port.dispose()
      setConnection(null)
    }
  }, [session])

  const state = useSyncExternalStore(
    (onChange) => {
      if (!connection) return () => {}
      const subscription = connection.store.subscribe(onChange)
      return () => subscription.unsubscribe()
    },
    () => connection?.store.getSnapshot() ?? EMPTY_STORE_STATE,
    () => EMPTY_STORE_STATE,
  )

  return {
    port: connection?.port ?? EMPTY_PORT,
    store: connection?.store ?? EMPTY_STORE,
    state,
  }
}
