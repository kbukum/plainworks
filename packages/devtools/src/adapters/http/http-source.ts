import { type HttpInterceptor, isHttpError } from "@plainworks/http"
import { redact, type WebAbortSignal, type WebHeaders } from "@plainworks/std"
import type { Json } from "../../privacy"
import { assertPositiveCapacity } from "../../retention/capacity"
import type { Source, SourceHandle } from "../../source"
import {
  type Correlator,
  createCorrelator,
  describeExchangeCounts,
  type ExchangeCounts,
  type ExchangeOutcome,
  isDeadlineAbort,
  outcomeSeverity,
} from "../correlation"
import { describeErrorSafely } from "../error-summary"
import { createObserverRelay, type ObserverRelay, observeSafely } from "../observer-relay"
import { sanitizeHttpUrl } from "./sanitize-url"

/** Options for {@link createHttpSource}. */
export interface HttpSourceOptions {
  /**
   * Stable identity for this client instance. Required whenever an app composes more than one HTTP
   * client — the adapter never guesses identity from runtime state.
   */
  readonly instance: string
  /** Display label; defaults to `HTTP <instance>`. */
  readonly label?: string
  /** Clock for event and indicator timestamps. Defaults to `Date.now`. */
  readonly now?: () => number
  /**
   * Header names (case-insensitive) captured — from the request and the response — into on-demand
   * detail. **Metadata is the default**: with no allowlist, no header ever leaves the boundary and
   * events carry no detail. A captured value is masked at capture time, so a sensitively-named or
   * token-shaped header (an allowlisted `authorization`) is stored already redacted — never held as
   * a live credential ahead of the session's read-time redaction.
   */
  readonly captureHeaders?: readonly string[]
  /** Exchanges retained for on-demand detail before the oldest is evicted. Defaults to 50. */
  readonly detailCapacity?: number
}

/** The interceptor/source pair returned by {@link createHttpSource}. */
export interface HttpInstrumentation {
  /** Register this with a {@link @plainworks/devtools!DevtoolsSession}. */
  readonly source: Source
  /**
   * Pass this to `createHttpClient({ interceptors: [interceptor] })` **before** the client is
   * built. It times each attempt and reports it without altering request or error behavior.
   */
  readonly interceptor: HttpInterceptor
}

const DEFAULT_DETAIL_CAPACITY = 50

/**
 * Observe an `@plainworks/http` client as a devtools source. The returned
 * {@link HttpInstrumentation.interceptor} wraps every request attempt and correlates its start with
 * its outcome — completion, non-2xx status, network failure, or caller cancellation — reporting
 * method, sanitized URL, duration, and status while re-throwing the original error untouched, so
 * instrumentation never changes what the caller sees. Because the interceptor runs inside the
 * client's retry loop, a retried request surfaces as one start/settle pair per attempt to the same
 * target.
 *
 * Only metadata crosses the boundary: no request/response body, and no header unless its name is in
 * {@link HttpSourceOptions.captureHeaders}. Nothing is observed until the source is registered; the
 * interceptor is a safe no-op until then.
 */
export function createHttpSource(options: HttpSourceOptions): HttpInstrumentation {
  const now = options.now ?? Date.now
  const relay = createObserverRelay()
  const correlator = createCorrelator("http")
  const allow = options.captureHeaders?.map((name) => name.toLowerCase())
  const detailCapacity = options.detailCapacity ?? DEFAULT_DETAIL_CAPACITY
  assertPositiveCapacity("HTTP detail capacity", detailCapacity)
  const details = new Map<string, Json>()

  const counts = { total: 0, failing: 0, inFlight: 0 }

  function indicate(): void {
    relay.indicate({
      id: "http",
      label: options.label ?? `HTTP ${options.instance}`,
      value: describeExchangeCounts(counts, "request"),
      severity: counts.failing > 0 ? "error" : counts.inFlight > 0 ? "info" : "ok",
      updatedAt: now(),
      target: "http",
    })
  }

  function rememberDetail(id: string, record: Json): void {
    // Retention is gated on an active registration: an event published before the source connects
    // or after it is disposed is dropped by the relay, so retaining its detail would keep captured
    // metadata alive with no session able to request it. An in-flight request that settles after
    // disposal therefore never repopulates the cleared map.
    if (allow === undefined || !relay.active) return
    details.set(id, record)
    if (details.size > detailCapacity) {
      const oldest = details.keys().next().value
      if (oldest !== undefined) details.delete(oldest)
    }
  }

  const interceptor = createHttpInterceptor({
    now,
    relay,
    correlator,
    allow,
    counts,
    indicate,
    rememberDetail,
  })

  const source: Source = {
    id: { kind: "http", instance: options.instance },
    label: options.label ?? `HTTP ${options.instance}`,
    connect(observer) {
      relay.bind(observer)
      observeSafely(relay, indicate)
      const handle: SourceHandle = {
        resolveDetail(ref) {
          const record = details.get(ref)
          if (record === undefined) throw new Error(`No retained exchange for ${ref}.`)
          return Promise.resolve(record)
        },
        dispose() {
          relay.unbind()
          details.clear()
        },
      }
      return handle
    },
  }

  return { source, interceptor }
}

interface InterceptorDeps {
  readonly now: () => number
  readonly relay: ObserverRelay
  readonly correlator: Correlator
  readonly allow: readonly string[] | undefined
  readonly counts: ExchangeCounts
  readonly indicate: () => void
  readonly rememberDetail: (id: string, record: Json) => void
}

function createHttpInterceptor(deps: InterceptorDeps): HttpInterceptor {
  const { now, relay, correlator, allow, counts, indicate, rememberDetail } = deps
  return (next) => async (request) => {
    const id = correlator.next()
    const method = request.method
    const url = sanitizeHttpUrl(request.url)
    const requestHeaders = pickHeaders(request.headers, allow)
    let startedAt: number | undefined
    let settled = false
    // Every observation runs through `observeSafely`, so a fault in the timeline can never replace
    // the response or error the caller is owed — the request outcome is produced entirely by
    // `next(request)`, never by the instrumentation around it.
    observeSafely(relay, () => {
      startedAt = now()
      counts.total += 1
      counts.inFlight += 1
      relay.emit({
        kind: "http.request",
        label: `${method} ${url}`,
        severity: "info",
        at: startedAt,
        summary: { id, method, url },
      })
      indicate()
    })

    const settleThrow = (error: unknown): void => {
      if (settled || startedAt === undefined) return
      settled = true
      const observedStartedAt = startedAt
      const outcome = classifyThrow(error, request.signal)
      counts.inFlight -= 1
      if (outcome === "error") counts.failing += 1
      observeSafely(relay, () => {
        const endedAt = now()
        const durationMs = endedAt - observedStartedAt
        const summary: Json = {
          id,
          method,
          url,
          durationMs,
          outcome,
          error: describeErrorSafely(error),
        }
        emitSettle(relay, {
          kind: settleKind(outcome),
          label: `${method} ${url} ${outcome} (${durationMs}ms)`,
          outcome,
          at: endedAt,
          summary,
          detail: allow !== undefined ? id : undefined,
        })
        rememberDetail(id, { ...summary, request: { headers: requestHeaders } })
        indicate()
      })
    }

    const settleResponse = (response: Awaited<ReturnType<typeof next>>): void => {
      if (settled || startedAt === undefined) return
      settled = true
      const observedStartedAt = startedAt
      const outcome: ExchangeOutcome = response.ok ? "ok" : "error"
      counts.inFlight -= 1
      if (outcome === "error") counts.failing += 1
      observeSafely(relay, () => {
        const endedAt = now()
        const durationMs = endedAt - observedStartedAt
        const bytes = contentLength(response.headers)
        const summary: Json = {
          id,
          method,
          url,
          status: response.status,
          durationMs,
          outcome,
          ...(bytes !== undefined ? { bytes } : {}),
        }
        emitSettle(relay, {
          kind: outcome === "ok" ? "http.response" : "http.error",
          label: `${method} ${url} → ${response.status} (${durationMs}ms)`,
          outcome,
          at: endedAt,
          summary,
          detail: allow !== undefined ? id : undefined,
        })
        rememberDetail(id, {
          ...summary,
          request: { headers: requestHeaders },
          response: { headers: pickHeaders(response.headers, allow) },
        })
        if (outcome === "ok") relay.recover()
        indicate()
      })
    }

    const signal = request.signal
    const onAbort = (): void => settleThrow(signal?.reason)
    if (startedAt !== undefined) {
      if (signal?.aborted) onAbort()
      else signal?.addEventListener("abort", onAbort, { once: true })
    }

    let response: Awaited<ReturnType<typeof next>>
    try {
      response = await next(request)
    } catch (error) {
      signal?.removeEventListener("abort", onAbort)
      settleThrow(error)
      // Re-throw untouched: instrumentation never changes the caller's error contract.
      throw error
    }

    signal?.removeEventListener("abort", onAbort)
    settleResponse(response)
    return response
  }
}

interface SettleInput {
  readonly kind: string
  readonly label: string
  readonly outcome: ExchangeOutcome
  readonly at: number
  readonly summary: Json
  readonly detail: string | undefined
}

function emitSettle(relay: ObserverRelay, input: SettleInput): void {
  relay.emit({
    kind: input.kind,
    label: input.label,
    severity: outcomeSeverity(input.outcome),
    at: input.at,
    summary: input.summary,
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  })
}

/**
 * Classify a thrown request outcome from inside the interceptor. A per-attempt deadline is
 * detected from the attempt signal's abort reason, because the client only remaps it to a typed
 * `http/timeout` further out (outside this interceptor); an `http/timeout` that does reach here is
 * likewise a timeout. A caller cancellation surfaces as an `AbortError` whose signal did **not**
 * abort on a timeout; everything else is an error.
 */
function classifyThrow(error: unknown, signal: WebAbortSignal | undefined): ExchangeOutcome {
  if (isHttpError(error) && error.kind === "http/timeout") return "timeout"
  if (isDeadlineAbort(signal)) return "timeout"
  if (error instanceof Error && error.name === "AbortError") return "canceled"
  return "error"
}

/** The timeline kind for a thrown settle: a dedicated kind per non-ok outcome so filters read cleanly. */
function settleKind(outcome: ExchangeOutcome): string {
  if (outcome === "timeout") return "http.timeout"
  if (outcome === "canceled") return "http.canceled"
  return "http.error"
}

function pickHeaders(
  headers: WebHeaders,
  allow: readonly string[] | undefined,
): { readonly [key: string]: string } {
  if (allow === undefined) return {}
  const picked: Record<string, string> = {}
  for (const name of allow) {
    const value = headers.get(name)
    if (value !== null) picked[name] = value
  }
  // Mask a sensitively-named or token-shaped header value at capture time, so a live credential is
  // never held in the retained detail map ahead of the session's read-time redaction — even an
  // explicitly allowlisted `authorization` is stored already masked.
  return redactHeaders(picked)
}

function redactHeaders(headers: Record<string, string>): { readonly [key: string]: string } {
  const redacted: Record<string, string> = {}
  for (const [key, value] of Object.entries(redact(headers) as Record<string, unknown>)) {
    redacted[key] = typeof value === "string" ? value : String(value)
  }
  return redacted
}

function contentLength(headers: WebHeaders): number | undefined {
  const raw = headers.get("content-length")
  if (raw === null) return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}
