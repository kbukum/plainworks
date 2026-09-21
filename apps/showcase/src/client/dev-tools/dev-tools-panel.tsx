"use client"

import { Button } from "@plainworks/elements/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@plainworks/elements/sheet"
import type { HttpClient } from "@plainworks/http"
import { Bug } from "lucide-react"
import { type ReactElement, useCallback, useEffect, useState } from "react"
import {
  clearMockRequests,
  type MockSnapshot,
  readMockSnapshot,
  resetMockData,
  setMockError,
  setMockLatency,
} from "./mock-control"
import { MockControls } from "./mock-controls"
import { RequestLog } from "./request-log"
import { RequestTester } from "./request-tester"

const CONTROL_ERROR_MESSAGE = "The mock inspector could not reach its control plane."

/** Props for the developer-only mock inspector. */
export interface DevToolsPanelProps {
  readonly client: HttpClient
  /** Poll cadence for the live request log; `0` disables polling for deterministic tests. */
  readonly refreshIntervalMs?: number
  /** Monotonic clock used to measure request probes. */
  readonly now?: () => number
}

/**
 * A development-only inspector over the demo mock's HTTP control plane. The containing entry point
 * loads it with a dead-code-eliminated dynamic import, so this component has no production bundle
 * path.
 */
export function DevToolsPanel({
  client,
  refreshIntervalMs = 1_000,
  now = () => performance.now(),
}: DevToolsPanelProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<MockSnapshot>({
    errorEnabled: false,
    latencyMs: 0,
    requests: [],
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [lifecycle] = useState(() => new AbortController())

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await readMockSnapshot(client, lifecycle.signal)
      if (!lifecycle.signal.aborted) {
        setSnapshot(next)
        setError(undefined)
      }
    } catch {
      if (!lifecycle.signal.aborted) {
        setError(CONTROL_ERROR_MESSAGE)
      }
    }
  }, [client, lifecycle])

  useEffect(() => () => lifecycle.abort(), [lifecycle])

  useEffect(() => {
    if (!open) return
    let refreshPending = false
    const load = async (): Promise<void> => {
      if (refreshPending) return
      refreshPending = true
      try {
        await refresh()
      } finally {
        refreshPending = false
      }
    }
    void load()
    if (refreshIntervalMs <= 0) return
    const timer = window.setInterval(() => void load(), refreshIntervalMs)
    return () => window.clearInterval(timer)
  }, [open, refresh, refreshIntervalMs])

  async function runControl(action: () => Promise<void>, success: string): Promise<void> {
    setPending(true)
    setError(undefined)
    setNotice(undefined)
    try {
      await action()
      await refresh()
      if (!lifecycle.signal.aborted) {
        setNotice(success)
      }
    } catch {
      if (!lifecycle.signal.aborted) {
        setError(CONTROL_ERROR_MESSAGE)
      }
    } finally {
      if (!lifecycle.signal.aborted) {
        setPending(false)
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button type="button" className="fixed right-4 bottom-4 z-40 min-h-11 shadow-lg" />}
      >
        <Bug aria-hidden className="size-4" />
        Mock inspector
      </SheetTrigger>
      <SheetContent
        side="right"
        className="@container/dev-tools w-[min(100%,42rem)] max-w-none overflow-y-auto p-4 sm:p-6"
      >
        <SheetHeader className="p-0">
          <SheetTitle>Mock inspector</SheetTitle>
          <SheetDescription>
            Observe and control the in-process demo backend used by this browser.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 grid gap-6">
          {error === undefined ? null : (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice === undefined ? null : (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
          <RequestLog
            requests={snapshot.requests}
            pending={pending}
            onClear={() =>
              void runControl(
                () => clearMockRequests(client, lifecycle.signal),
                "Request log cleared",
              )
            }
          />
          <MockControls
            errorEnabled={snapshot.errorEnabled}
            latencyMs={snapshot.latencyMs}
            pending={pending}
            onErrorChange={(enabled) =>
              void runControl(
                () => setMockError(client, enabled, lifecycle.signal),
                enabled ? "Error simulation enabled" : "Error simulation disabled",
              )
            }
            onLatencyChange={(latencyMs) =>
              void runControl(
                () => setMockLatency(client, latencyMs, lifecycle.signal),
                `Latency set to ${latencyMs} ms`,
              )
            }
            onReset={() =>
              void runControl(() => resetMockData(client, lifecycle.signal), "Mock data reset")
            }
          />
          <RequestTester client={client} now={now} onComplete={() => void refresh()} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
