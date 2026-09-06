/**
 * Internal debugging handlers
 *
 * Provides endpoints for controlling mock-server behavior during development:
 * - Request logging
 * - Global error simulation
 * - Global latency control
 * - Data reset
 *
 * All state lives in a per-server control object built by {@link createMockControl} — never in
 * module scope, so two mock servers cannot observe or reset each other.
 */

import { type Clock, isRecord } from "@plainworks/std"
import { type HttpHandler, HttpResponse, http } from "msw"
import type { LatencyController } from "../utils/delay"

/** A single logged request captured by the logging handler. */
export interface RequestLogEntry {
  id: string
  url: string
  method: string
  timestamp: string
}

/** A snapshot of the mock server's internal control state. */
export interface InternalState {
  globalError: boolean
  globalDelay: number
  requestCount: number
}

/** Programmatic access to a mock server's control state (same thing the `/mock/*` endpoints drive). */
export interface MockControl {
  /** Copy of the bounded request log, oldest first. */
  requestLog(): RequestLogEntry[]
  /** Empty the request log. */
  clearRequestLog(): void
  /** Whether every API request currently fails with a 500. */
  isErrorEnabled(): boolean
  /** Toggle global error simulation. */
  setError(enabled: boolean): void
  /** Snapshot of the current control state. */
  state(): InternalState
}

export interface MockControlGraph {
  control: MockControl
  /** Logging + error-gate handler; must be placed FIRST in the handlers array. */
  loggingHandler: HttpHandler
  /** The `/mock/*` control endpoints. */
  handlers: HttpHandler[]
}

const MAX_LOG_SIZE = 1000

/**
 * Build the control graph for one mock server. `onReset` resets that server's data stores;
 * `latency` is the same controller the data handlers wait on.
 */
export function createMockControl(
  latency: LatencyController,
  onReset: () => void,
  clock: Clock,
): MockControlGraph {
  const requestLog: RequestLogEntry[] = []
  let globalErrorEnabled = false

  const control: MockControl = {
    requestLog: () => [...requestLog],
    clearRequestLog: () => {
      requestLog.length = 0
    },
    isErrorEnabled: () => globalErrorEnabled,
    setError: (enabled: boolean) => {
      globalErrorEnabled = enabled
    },
    state: () => ({
      globalError: globalErrorEnabled,
      globalDelay: latency.get(),
      requestCount: requestLog.length,
    }),
  }

  // First handler in the chain: scoped to the mock API namespace so unrelated application
  // requests are never logged or gated. While error simulation is enabled it fails the request
  // before any data handler runs; otherwise it returns undefined to pass through.
  const loggingHandler: HttpHandler = http.all("*/api/*", async ({ request, requestId }) => {
    requestLog.push({
      id: requestId,
      url: request.url,
      method: request.method,
      timestamp: new Date(clock.now()).toISOString(),
    })

    // Keep log size bounded
    if (requestLog.length > MAX_LOG_SIZE) {
      requestLog.shift()
    }

    if (globalErrorEnabled) {
      return HttpResponse.json({ data: null, error: "Simulated server error" }, { status: 500 })
    }

    return undefined // Let request pass through to other handlers
  })

  const handlers: HttpHandler[] = [
    // Get request log
    http.get("*/mock/requests", async ({ request }) => {
      await latency.wait(request.signal)
      return HttpResponse.json({
        data: control.requestLog(),
        count: requestLog.length,
      })
    }),

    // Clear request log
    http.delete("*/mock/requests", async () => {
      control.clearRequestLog()
      return HttpResponse.json({ success: true })
    }),

    // Get current mock state
    http.get("*/mock/state", async () => {
      return HttpResponse.json({
        data: control.state(),
      })
    }),

    // Control global error simulation
    http.post("*/mock/error", async ({ request }) => {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return HttpResponse.json({ error: "invalid JSON body" }, { status: 400 })
      }
      if (!isRecord(body) || typeof body.enabled !== "boolean") {
        return HttpResponse.json({ error: "body must be { enabled: boolean }" }, { status: 400 })
      }
      control.setError(body.enabled)
      return HttpResponse.json({
        data: { globalError: control.isErrorEnabled() },
      })
    }),

    // Control global latency
    http.post("*/mock/latency", async ({ request }) => {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return HttpResponse.json({ error: "invalid JSON body" }, { status: 400 })
      }
      if (
        !isRecord(body) ||
        typeof body.latency !== "number" ||
        !Number.isFinite(body.latency) ||
        body.latency < 0
      ) {
        return HttpResponse.json(
          { error: "body must be { latency: number >= 0 }" },
          { status: 400 },
        )
      }
      latency.set(body.latency)
      return HttpResponse.json({
        data: { globalLatency: latency.get() },
      })
    }),

    // Reset all mock data
    http.post("*/mock/reset", async () => {
      onReset()
      control.clearRequestLog()
      return HttpResponse.json({ success: true })
    }),
  ]

  return { control, loggingHandler, handlers }
}
