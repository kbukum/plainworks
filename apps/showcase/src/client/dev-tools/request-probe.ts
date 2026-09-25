import { type HttpClient, isHttpError } from "@plainworks/http"
import type { WebAbortSignal } from "@plainworks/std"

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

/** Send a fixed probe through the app client and report its status and duration, never its body. */
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
      error: undefined,
    }
  } catch (cause) {
    return {
      status: isHttpError(cause) ? cause.status : undefined,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
      error: cause instanceof Error ? cause.message : "The request failed.",
    }
  }
}
