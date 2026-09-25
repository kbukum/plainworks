import type { CommandDescriptor, Source, SourceHandle, SourceObserver } from "@plainworks/devtools"
import { sanitizeHttpUrl } from "@plainworks/devtools/http"
import type { HttpClient } from "@plainworks/http"
import type { MockControlClient, RequestLogEntry } from "@plainworks/mocks"
import { assertTimerMs, combineSignals, isRecord, type WebAbortSignal } from "@plainworks/std"
import { REQUEST_TARGETS, type RequestTarget, runRequestProbe } from "./request-probe"

/** Stable identity of the app-owned demo-backend source. */
export const MOCK_SOURCE_ID = { kind: "mock", instance: "demo" } as const

/**
 * Detail ref for the backend's current control state. The rail indicators next to it are formatted
 * for a glance (`"120 ms"`); a panel that seeds an input needs the number, so it asks for this
 * structured record on demand instead of parsing a label back into data.
 */
export const MOCK_STATE_REF = "state"

/** The demo backend's control state, as {@link MOCK_STATE_REF} resolves it. */
export interface MockState {
  readonly errorEnabled: boolean
  readonly latencyMs: number
}

/** Options for {@link createMockSource}. */
export interface MockSourceOptions {
  /**
   * Reads and drives the demo backend's `/mock/*` control plane. Build it over a client the
   * inspector does **not** observe, so the poll loop never floods the HTTP timeline it sits beside.
   */
  readonly control: MockControlClient
  /** The app's observed HTTP client; probes go through it so they appear in the HTTP timeline. */
  readonly client: HttpClient
  /** Display label; defaults to `Demo backend`. */
  readonly label?: string
  /** Clock for indicator and event timestamps. Defaults to `Date.now`. */
  readonly now?: () => number
  /** Poll cadence for the control plane in milliseconds; `0` reads once on connect (tests). */
  readonly pollIntervalMs?: number
  /** Recorded requests retained for on-demand detail before the oldest is evicted. Defaults to 100. */
  readonly detailCapacity?: number
}

const DEFAULT_POLL_INTERVAL_MS = 1_000
const DEFAULT_DETAIL_CAPACITY = 100

/**
 * The commands this source advertises. Every mutation is an explicit, risk-tagged entry — the
 * inspector separates read probes from state changes and gates the destructive reset behind
 * confirmation. There is no arbitrary-request primitive: probes are constrained to
 * {@link REQUEST_TARGETS}.
 */
const COMMANDS: readonly CommandDescriptor[] = [
  { id: "toggle-error", label: "Simulate API errors", risk: "mutating", available: true },
  { id: "set-latency", label: "Set request latency", risk: "mutating", available: true },
  { id: "clear-log", label: "Clear request log", risk: "mutating", available: true },
  { id: "reset-data", label: "Reset mock data", risk: "destructive", available: true },
  { id: "probe-read", label: "Send read probe", risk: "safe", available: true },
  { id: "probe-write", label: "Send write probe", risk: "mutating", available: true },
]

/**
 * An **app-owned** custom devtools source over the showcase's demo-backend control plane, proving
 * the package's extension path without a global registry or any devtools dependency on
 * `@plainworks/mocks`. It reads the backend's error/latency state and bounded request log through
 * the typed control client, publishing compact indicators and one event per recorded request; the
 * full request record loads on demand. Its risk-tagged commands drive the same control endpoints
 * the section UI uses, so the inspector controls the demo backend without becoming an arbitrary
 * request console. Nothing is observed until the source is registered, and disposal stops the poll
 * loop and clears retained detail.
 */
export function createMockSource(options: MockSourceOptions): Source {
  const now = options.now ?? Date.now
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const detailCapacity = options.detailCapacity ?? DEFAULT_DETAIL_CAPACITY
  assertTimerMs(pollIntervalMs)
  if (!Number.isSafeInteger(detailCapacity) || detailCapacity <= 0) {
    throw new RangeError("Mock detail capacity must be a positive safe integer.")
  }

  return {
    id: MOCK_SOURCE_ID,
    label: options.label ?? "Demo backend",
    commands: COMMANDS,
    connect(observer: SourceObserver, signal: WebAbortSignal): SourceHandle {
      const records = new Map<string, RequestLogEntry>()
      let state: MockState | undefined
      let timer: ReturnType<typeof setInterval> | undefined
      let refreshing: AbortController | undefined

      function remember(entry: RequestLogEntry): void {
        records.set(entry.id, entry)
        if (records.size > detailCapacity) {
          const oldest = records.keys().next().value
          if (oldest !== undefined) records.delete(oldest)
        }
      }

      function publish(snapshot: MockSnapshot): void {
        state = { errorEnabled: snapshot.errorEnabled, latencyMs: snapshot.latencyMs }
        observer.indicate({
          id: "errors",
          label: "Mock errors",
          value: snapshot.errorEnabled ? "on" : "off",
          severity: snapshot.errorEnabled ? "warn" : "ok",
          updatedAt: now(),
          target: "mock",
        })
        observer.indicate({
          id: "latency",
          label: "Mock latency",
          value: `${snapshot.latencyMs} ms`,
          severity: snapshot.latencyMs > 0 ? "info" : "ok",
          updatedAt: now(),
          target: "mock",
        })
        observer.indicate({
          id: "requests",
          label: "Mock requests",
          value: String(snapshot.requests.length),
          severity: "info",
          updatedAt: now(),
          target: "mock",
        })
        for (const request of snapshot.requests.slice(-detailCapacity)) {
          if (records.has(request.id)) continue
          const path = sanitizeHttpUrl(request.url, "path")
          remember({ ...request, url: path })
          observer.emit({
            kind: "mock.request",
            label: `${request.method} ${path}`,
            severity: "ok",
            at: now(),
            summary: { method: request.method, path },
            detail: request.id,
          })
        }
      }

      async function refresh(replace = false): Promise<void> {
        if (signal.aborted || (refreshing !== undefined && !replace)) return
        refreshing?.abort()
        const controller = new AbortController()
        refreshing = controller
        const readSignal = combineSignals(signal, controller.signal)
        try {
          const snapshot = await readSnapshot(options.control, readSignal)
          if (readSignal.aborted) return
          publish(snapshot)
          observer.recover()
        } catch (error) {
          if (!readSignal.aborted) observer.fail(error)
        } finally {
          controller.abort()
          if (refreshing === controller) refreshing = undefined
        }
      }

      void refresh()
      if (pollIntervalMs > 0) {
        timer = setInterval(() => void refresh(), pollIntervalMs)
      }
      signal.addEventListener("abort", () => timer && clearInterval(timer), { once: true })

      return {
        resolveDetail(ref: string): Promise<unknown> {
          if (ref === MOCK_STATE_REF) {
            return state === undefined
              ? Promise.reject(new Error("The demo backend control state has not been read yet."))
              : Promise.resolve(state)
          }
          const record = records.get(ref)
          if (record === undefined) {
            return Promise.reject(new Error(`No recorded request for ${ref}.`))
          }
          return Promise.resolve(record)
        },
        async runCommand(commandId: string, input, commandSignal): Promise<unknown> {
          const value = await runMockCommand(options, commandId, input, commandSignal, now)
          if (signal.aborted) return value
          if (commandId === "clear-log" || commandId === "reset-data") {
            records.clear()
            observer.emit({
              kind: "mock.log-cleared",
              label: "Request log cleared",
              severity: "info",
              at: now(),
            })
          }
          await refresh(true)
          return value
        },
        dispose(): void {
          if (timer) clearInterval(timer)
          refreshing?.abort()
          records.clear()
          state = undefined
        },
      }
    },
  }
}

interface MockSnapshot extends MockState {
  readonly requests: readonly RequestLogEntry[]
}

async function readSnapshot(
  control: MockControlClient,
  signal: WebAbortSignal,
): Promise<MockSnapshot> {
  const [state, requests] = await Promise.all([control.state(signal), control.requestLog(signal)])
  return { errorEnabled: state.globalError, latencyMs: state.globalDelay, requests }
}

/** Run one advertised command against the control plane after validating its input. */
async function runMockCommand(
  { control, client }: MockSourceOptions,
  commandId: string,
  input: unknown,
  signal: WebAbortSignal,
  now: () => number,
): Promise<unknown> {
  switch (commandId) {
    case "toggle-error": {
      const enabled = booleanField(input, "enabled")
      await control.setError(enabled, signal)
      return { enabled }
    }
    case "set-latency": {
      const latencyMs = numberField(input, "latencyMs")
      await control.setLatency(latencyMs, signal)
      return { latencyMs }
    }
    case "clear-log":
      await control.clearRequestLog(signal)
      return { cleared: true }
    case "reset-data":
      await control.reset(signal)
      return { reset: true }
    case "probe-read":
      return probe(client, "GET", input, signal, now)
    case "probe-write":
      return probe(client, "POST", input, signal, now)
    default:
      throw new Error(`Unknown command ${commandId}.`)
  }
}

/** Run a probe against an allowlisted target of the requested method; refuse anything else. */
async function probe(
  client: HttpClient,
  method: RequestTarget["method"],
  input: unknown,
  signal: WebAbortSignal,
  now: () => number,
): Promise<unknown> {
  const path = stringField(input, "path")
  const target = REQUEST_TARGETS.find((entry) => entry.method === method && entry.path === path)
  if (target === undefined) {
    throw new Error(`${method} ${path} is not an allowlisted probe target.`)
  }
  const result = await runRequestProbe(client, target, now, signal)
  return {
    status: result.status ?? null,
    durationMs: result.durationMs,
    error: result.error ?? null,
  }
}

function booleanField(input: unknown, key: string): boolean {
  if (!isRecord(input) || typeof input[key] !== "boolean") {
    throw new TypeError(`Command input requires a boolean "${key}".`)
  }
  return input[key]
}

function numberField(input: unknown, key: string): number {
  if (!isRecord(input) || typeof input[key] !== "number" || !Number.isFinite(input[key])) {
    throw new TypeError(`Command input requires a finite number "${key}".`)
  }
  return input[key]
}

function stringField(input: unknown, key: string): string {
  if (!isRecord(input) || typeof input[key] !== "string") {
    throw new TypeError(`Command input requires a string "${key}".`)
  }
  return input[key]
}
