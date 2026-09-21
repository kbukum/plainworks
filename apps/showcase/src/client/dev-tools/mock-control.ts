import { type HttpClient, isHttpError } from "@plainworks/http"
import { MAX_LATENCY_MS } from "@plainworks/mocks"
import { isRecord, PlainError, type WebAbortSignal } from "@plainworks/std"

/** One request recorded by the demo mock control plane. */
export interface MockRequestEntry {
  readonly id: string
  readonly url: string
  readonly method: string
  readonly timestamp: string
}

/** The current mock behavior and bounded request log. */
export interface MockSnapshot {
  readonly errorEnabled: boolean
  readonly latencyMs: number
  readonly requests: readonly MockRequestEntry[]
}

/** A request target deliberately exposed by the inspector. */
export interface RequestTarget {
  readonly method: "GET" | "POST"
  readonly path: string
  readonly label: string
}

/** The result of sending a request through the app's real HTTP client. */
export interface RequestProbeResult {
  readonly status: number | undefined
  readonly durationMs: number
  readonly body: unknown
  readonly error: string | undefined
}

/** Fixed targets keep the developer tool from becoming an arbitrary request primitive. */
export const REQUEST_TARGETS: readonly RequestTarget[] = [
  { method: "GET", path: "/api/tasks", label: "Tasks list" },
  { method: "GET", path: "/api/orders", label: "Orders list" },
  { method: "GET", path: "/api/users", label: "Users list" },
  { method: "GET", path: "/api/dashboard/overview", label: "Dashboard overview" },
  {
    method: "POST",
    path: "/api/notifications/read-all",
    label: "Mark notifications read",
  },
]

type MockControlErrorKind = "mock-control/invalid-response"

/** A malformed response from the developer-only mock control plane. */
export class MockControlError extends PlainError<MockControlErrorKind> {
  constructor(endpoint: string, options?: { cause?: unknown }) {
    super(
      "mock-control/invalid-response",
      `The mock control returned an invalid response for ${endpoint}.`,
      options,
    )
  }
}

function requestEntryOf(value: unknown): MockRequestEntry | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.url !== "string" ||
    typeof value.method !== "string" ||
    typeof value.timestamp !== "string"
  ) {
    return undefined
  }
  return {
    id: value.id,
    url: value.url,
    method: value.method,
    timestamp: value.timestamp,
  }
}

function requestLogOf(value: unknown): readonly MockRequestEntry[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new MockControlError("/mock/requests", { cause: value })
  }
  const requests = value.data.map(requestEntryOf)
  if (requests.some((request) => request === undefined)) {
    throw new MockControlError("/mock/requests", { cause: value })
  }
  return requests.filter((request): request is MockRequestEntry => request !== undefined)
}

function stateOf(value: unknown): Pick<MockSnapshot, "errorEnabled" | "latencyMs"> {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    typeof value.data.globalError !== "boolean" ||
    typeof value.data.globalDelay !== "number" ||
    !Number.isFinite(value.data.globalDelay) ||
    value.data.globalDelay < 0 ||
    value.data.globalDelay > MAX_LATENCY_MS
  ) {
    throw new MockControlError("/mock/state", { cause: value })
  }
  return { errorEnabled: value.data.globalError, latencyMs: value.data.globalDelay }
}

function assertSuccess(value: unknown, endpoint: string): void {
  if (!isRecord(value) || value.success !== true) {
    throw new MockControlError(endpoint, { cause: value })
  }
}

/** Read the mock state and request log through its HTTP control surface. */
export async function readMockSnapshot(
  client: HttpClient,
  signal?: WebAbortSignal,
): Promise<MockSnapshot> {
  const [stateBody, requestsBody] = await Promise.all([
    client.get("/mock/state", signal === undefined ? undefined : { signal }),
    client.get("/mock/requests", signal === undefined ? undefined : { signal }),
  ])
  return { ...stateOf(stateBody), requests: requestLogOf(requestsBody) }
}

/** Set the fixed delay applied to subsequent mock API requests. */
export async function setMockLatency(
  client: HttpClient,
  latencyMs: number,
  signal?: WebAbortSignal,
): Promise<void> {
  if (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > MAX_LATENCY_MS) {
    throw new RangeError(`latency must be between 0 and ${MAX_LATENCY_MS}`)
  }
  const body = await client.post("/mock/latency", {
    body: { latency: latencyMs },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!isRecord(body) || !isRecord(body.data) || body.data.globalLatency !== latencyMs) {
    throw new MockControlError("/mock/latency", { cause: body })
  }
}

/** Enable or disable the mock API's global error response. */
export async function setMockError(
  client: HttpClient,
  enabled: boolean,
  signal?: WebAbortSignal,
): Promise<void> {
  const body = await client.post("/mock/error", {
    body: { enabled },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!isRecord(body) || !isRecord(body.data) || body.data.globalError !== enabled) {
    throw new MockControlError("/mock/error", { cause: body })
  }
}

/** Reset the demo stores and all mock control state. */
export async function resetMockData(client: HttpClient, signal?: WebAbortSignal): Promise<void> {
  const body = await client.post("/mock/reset", signal === undefined ? undefined : { signal })
  assertSuccess(body, "/mock/reset")
}

/** Clear the bounded request log without resetting fixture data. */
export async function clearMockRequests(
  client: HttpClient,
  signal?: WebAbortSignal,
): Promise<void> {
  const body = await client.delete("/mock/requests", signal === undefined ? undefined : { signal })
  assertSuccess(body, "/mock/requests")
}

/** Send a fixed probe through the app client and retain status, decoded body, and duration. */
export async function runRequestProbe(
  client: HttpClient,
  target: RequestTarget,
  now: () => number,
  signal?: WebAbortSignal,
): Promise<RequestProbeResult> {
  const startedAt = now()
  try {
    const response = await client.request({
      method: target.method,
      path: target.path,
      ...(signal === undefined ? {} : { signal }),
    })
    return {
      status: response.status,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
      body: response.data,
      error: undefined,
    }
  } catch (cause) {
    return {
      status: isHttpError(cause) ? cause.status : undefined,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
      body: undefined,
      error: cause instanceof Error ? cause.message : "The request failed.",
    }
  }
}
