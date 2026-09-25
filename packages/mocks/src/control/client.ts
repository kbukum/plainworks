import { isRecord, PlainError, type WebAbortSignal } from "@plainworks/std"
import { MAX_LATENCY_MS } from "../latency"
import { MAX_REQUEST_LOG_SIZE } from "./limits"
import { MOCK_CONTROL_PATHS } from "./paths"
import type { InternalState, MockControl, RequestLogEntry } from "./plane"

type MockControlErrorKind = "mocks/invalid-control-response"

/** The control plane answered with a body that does not match its wire contract. */
export class MockControlError extends PlainError<MockControlErrorKind> {
  /** The control path whose response was rejected. */
  readonly path: string

  constructor(path: string, options?: { cause?: unknown }) {
    super(
      "mocks/invalid-control-response",
      `The mock control plane returned an invalid response for ${path}.`,
      options,
    )
    this.path = path
  }
}

/**
 * The requests {@link createMockControlClient} sends, each resolving to the decoded JSON body. An
 * `@plainworks/http` `HttpClient` satisfies it as-is; the seam is structural so this package never
 * compiles the client's source graph.
 */
export interface MockControlTransport {
  get(path: string, options?: { readonly signal?: WebAbortSignal }): Promise<unknown>
  post(
    path: string,
    options?: { readonly body?: unknown; readonly signal?: WebAbortSignal },
  ): Promise<unknown>
  delete(path: string, options?: { readonly signal?: WebAbortSignal }): Promise<unknown>
}

/** Options for {@link createMockControlClient}. */
export interface MockControlClientOptions {
  /** The transport that reaches the mock server's `/mock/*` endpoints. */
  readonly client: MockControlTransport
}

/**
 * Typed remote access to a mock server's control plane — the HTTP counterpart of the in-process
 * {@link MockControl}. Every response is validated before it is returned, so a caller never
 * handles the raw wire shape. Each call takes an optional signal to cancel it.
 */
export interface MockControlClient {
  /** Snapshot of the current control state. */
  state(signal?: WebAbortSignal): Promise<InternalState>
  /** Copy of the bounded request log, oldest first. */
  requestLog(signal?: WebAbortSignal): Promise<readonly RequestLogEntry[]>
  /** Empty the request log. */
  clearRequestLog(signal?: WebAbortSignal): Promise<void>
  /** Toggle global error simulation. */
  setError(enabled: boolean, signal?: WebAbortSignal): Promise<void>
  /** Set the fixed delay applied to later API requests, between 0 and {@link MAX_LATENCY_MS}. */
  setLatency(latencyMs: number, signal?: WebAbortSignal): Promise<void>
  /** Reset the server's data stores and clear the request log. */
  reset(signal?: WebAbortSignal): Promise<void>
}

/**
 * Build a {@link MockControlClient} over `client`. Give it a client that is not itself observed
 * (for example by a devtools interceptor) so control traffic stays out of the runtime you inspect.
 */
export function createMockControlClient({ client }: MockControlClientOptions): MockControlClient {
  const withSignal = (signal: WebAbortSignal | undefined) =>
    signal === undefined ? undefined : { signal }

  return {
    async state(signal) {
      const path = MOCK_CONTROL_PATHS.state
      return stateOf(await client.get(path, withSignal(signal)), path)
    },
    async requestLog(signal) {
      const path = MOCK_CONTROL_PATHS.requests
      return requestLogOf(await client.get(path, withSignal(signal)), path)
    },
    async clearRequestLog(signal) {
      const path = MOCK_CONTROL_PATHS.requests
      assertSuccess(await client.delete(path, withSignal(signal)), path)
    },
    async setError(enabled, signal) {
      const path = MOCK_CONTROL_PATHS.error
      const body = await client.post(path, { body: { enabled }, ...withSignal(signal) })
      if (!isRecord(body) || !isRecord(body.data) || body.data.globalError !== enabled) {
        throw new MockControlError(path, { cause: body })
      }
    },
    async setLatency(latencyMs, signal) {
      if (!isLatency(latencyMs)) {
        throw new RangeError(`latency must be between 0 and ${MAX_LATENCY_MS}`)
      }
      const path = MOCK_CONTROL_PATHS.latency
      const body = await client.post(path, { body: { latency: latencyMs }, ...withSignal(signal) })
      if (!isRecord(body) || !isRecord(body.data) || body.data.globalLatency !== latencyMs) {
        throw new MockControlError(path, { cause: body })
      }
    },
    async reset(signal) {
      const path = MOCK_CONTROL_PATHS.reset
      assertSuccess(await client.post(path, withSignal(signal)), path)
    },
  }
}

function isLatency(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_LATENCY_MS
  )
}

function stateOf(body: unknown, path: string): InternalState {
  const data = isRecord(body) ? body.data : undefined
  if (
    !isRecord(data) ||
    typeof data.globalError !== "boolean" ||
    !isLatency(data.globalDelay) ||
    typeof data.requestCount !== "number" ||
    !Number.isSafeInteger(data.requestCount) ||
    data.requestCount < 0
  ) {
    throw new MockControlError(path, { cause: body })
  }
  return {
    globalError: data.globalError,
    globalDelay: data.globalDelay,
    requestCount: data.requestCount,
  }
}

function requestLogOf(body: unknown, path: string): readonly RequestLogEntry[] {
  if (!isRecord(body) || !Array.isArray(body.data) || body.data.length > MAX_REQUEST_LOG_SIZE) {
    throw new MockControlError(path, { cause: body })
  }
  return body.data.map((entry: unknown) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.url !== "string" ||
      typeof entry.method !== "string" ||
      typeof entry.timestamp !== "string"
    ) {
      throw new MockControlError(path, { cause: body })
    }
    return { id: entry.id, url: entry.url, method: entry.method, timestamp: entry.timestamp }
  })
}

function assertSuccess(body: unknown, path: string): void {
  if (!isRecord(body) || body.success !== true) {
    throw new MockControlError(path, { cause: body })
  }
}
