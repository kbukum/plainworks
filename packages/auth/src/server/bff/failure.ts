import { failureCodeFor } from "@plainworks/std/failure"
import type { WebResponse } from "@plainworks/std/web"
import { isAuthErrorKind } from "../../errors"

/** Normalize session failures without exposing causes, cookies or provider credentials. */
export function authFailureResponse(cause: unknown): WebResponse {
  const terminal =
    isAuthErrorKind(cause, "auth/unauthenticated") ||
    isAuthErrorKind(cause, "auth/session-invalid") ||
    isAuthErrorKind(cause, "auth/session-expired") ||
    isAuthErrorKind(cause, "auth/session-revoked")
  const csrf = isAuthErrorKind(cause, "auth/csrf")
  const status = terminal ? 401 : csrf ? 403 : 503
  const code = failureCodeFor(status, "http")
  return new Response(
    JSON.stringify({
      type: `https://gokit.dev/errors/${code.toLowerCase().replaceAll("_", "-")}`,
      title: "Session request failed",
      status,
      detail: terminal
        ? "Sign in to continue."
        : csrf
          ? "The session proof was rejected."
          : "The session service is unavailable.",
      code,
      reason: terminal ? "SESSION_INVALID" : csrf ? "CSRF_INVALID" : "AUTH_STORE_UNAVAILABLE",
      retryable: false,
      violations: [],
    }),
    {
      status,
      headers: { "content-type": "application/problem+json", "cache-control": "no-store" },
    },
  )
}
