"use client"

import type { DevtoolsClientPort, Json, SourceId } from "@plainworks/devtools"
import type { SourcePanelProps } from "@plainworks/devtools/client"
import { isRecord, type WebAbortSignal } from "@plainworks/std"
import { type ReactElement, useEffect, useRef, useState } from "react"
import { MockControls } from "./mock-controls"
import { MOCK_STATE_REF, type MockState } from "./mock-source"
import { RequestLog } from "./request-log"
import { RequestTester } from "./request-tester"

const COMMAND_ERROR = "The demo backend control plane could not be reached."

/**
 * The showcase's **app-owned** custom renderer for its {@link createMockSource} source, injected at
 * the client call site through the shell's `renderers` map. It presents the demo backend's error
 * gate, latency, request log, and a fixed-target request tester over the neutral source protocol:
 * every control dispatches a risk-tagged command through the port, and the request log and probe
 * outcomes are read from the same session state the timeline uses. No React value or fixture
 * knowledge crosses the protocol — this component lives entirely in the app.
 *
 * The controls are seeded from the source's structured state detail rather than from the rail
 * indicators beside them, which are formatted for a glance and are not data.
 */
export function MockPanel({
  source,
  events,
  indicators,
  failure,
  port,
}: SourcePanelProps): ReactElement {
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const [state, setState] = useState<MockState>()
  const lifecycle = useRef<AbortController | undefined>(undefined)

  // The source stamps every indicator each time it re-reads the backend, so the newest stamp is a
  // cheap signal that its structured state may have moved — including the first read, which lands
  // after this panel mounts. Re-reading is an in-memory resolve, not a backend round trip.
  const publishedAt = indicators.reduce((latest, entry) => {
    return Math.max(latest, entry.indicator.updatedAt)
  }, 0)

  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    // Nothing to read until the source has published its first backend read.
    if (publishedAt === 0) return
    const controller = new AbortController()
    void readState(port, source.id, controller.signal).then((next) => {
      if (!controller.signal.aborted && next !== undefined) setState(next)
    })
    return () => controller.abort()
  }, [port, source, publishedAt])

  async function run(commandId: string, input: Json, success: string): Promise<Json | undefined> {
    setPending(true)
    setNotice(undefined)
    setError(undefined)
    const controller = lifecycle.current ?? new AbortController()
    const result = await port.runCommand(source.id, commandId, input, controller.signal)
    if (controller.signal.aborted) return undefined
    setPending(false)
    if (!result.ok) {
      if (result.error.kind !== "devtools/request-cancelled") setError(COMMAND_ERROR)
      return undefined
    }
    setNotice(success)
    // The source re-reads the backend before the command settles, so its state detail is current.
    const next = await readState(port, source.id, controller.signal)
    if (!controller.signal.aborted && next !== undefined) setState(next)
    return result.value
  }

  return (
    <div className="grid gap-6">
      {failure === undefined ? null : (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-2 text-destructive text-xs"
        >
          {`${source.label} failed: ${failure.message}`}
        </p>
      )}
      {error === undefined ? null : (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {notice === undefined ? null : (
        <p role="status" className="text-muted-foreground text-sm">
          {notice}
        </p>
      )}
      <MockControls
        errorEnabled={state?.errorEnabled ?? false}
        latencyMs={state?.latencyMs ?? 0}
        pending={pending}
        onErrorChange={(enabled) =>
          void run(
            "toggle-error",
            { enabled },
            enabled ? "Error simulation enabled" : "Error simulation disabled",
          )
        }
        onLatencyChange={(next) =>
          void run("set-latency", { latencyMs: next }, `Latency set to ${next} ms`)
        }
        onClearLog={() => void run("clear-log", null, "Request log cleared")}
        onReset={() => void run("reset-data", null, "Mock data reset")}
      />
      <RequestTester
        pending={pending}
        onProbe={(method, path) =>
          run(method === "GET" ? "probe-read" : "probe-write", { path }, `Sent ${method} ${path}`)
        }
      />
      <RequestLog events={events} />
    </div>
  )
}

/**
 * Read the backend's control state through the port. The value crosses the neutral protocol as
 * `Json`, so it is narrowed here rather than asserted; an unreachable or malformed reply leaves the
 * controls on their defaults instead of rendering a guess.
 */
async function readState(
  port: DevtoolsClientPort,
  id: SourceId,
  signal: WebAbortSignal,
): Promise<MockState | undefined> {
  const result = await port.requestDetail(id, MOCK_STATE_REF, signal)
  if (!result.ok) return undefined
  const value = result.value.value
  if (!isRecord(value)) return undefined
  const { errorEnabled, latencyMs } = value
  if (typeof errorEnabled !== "boolean" || typeof latencyMs !== "number") return undefined
  return { errorEnabled, latencyMs }
}
