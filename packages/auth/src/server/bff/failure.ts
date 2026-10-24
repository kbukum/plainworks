import type { WebResponse } from "@plainworks/std/web"
import { isAuthErrorKind } from "../../errors"
import { sessionFailureReasons } from "../../session/failures"

/**
 * Normalize session failures into RFC 9457 problems without exposing causes, cookies or provider
 * credentials. The `reason` extension member names the cause; `sessionFailures` reads it.
 */
export function authFailureResponse(cause: unknown): WebResponse {
  const terminal =
    isAuthErrorKind(cause, "auth/unauthenticated") ||
    isAuthErrorKind(cause, "auth/session-invalid") ||
    isAuthErrorKind(cause, "auth/session-expired") ||
    isAuthErrorKind(cause, "auth/session-revoked")
  const csrf = isAuthErrorKind(cause, "auth/csrf")
  const status = terminal ? 401 : csrf ? 403 : 503
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: terminal ? "Unauthorized" : csrf ? "Forbidden" : "Service Unavailable",
      status,
      detail: terminal
        ? "Sign in to continue."
        : csrf
          ? "The session proof was rejected."
          : "The session service is unavailable.",
      reason: terminal
        ? sessionFailureReasons.invalid
        : csrf
          ? sessionFailureReasons.csrf
          : sessionFailureReasons.storeUnavailable,
    }),
    {
      status,
      headers: { "content-type": "application/problem+json", "cache-control": "no-store" },
    },
  )
}
