import { isRecord } from "@plainworks/std"
import {
  decodeFailure,
  FailureDecodeError,
  failureCodes,
  isFailureCode,
} from "@plainworks/std/failure"
import { HttpError } from "./http-error"

/** Decode a namespaced RFC 9457 response; the HTTP status is never replaced by its body. */
export function decodeProblem(value: unknown, status: number, retryAfterMs?: number): HttpError {
  try {
    if (!isRecord(value) || (value.status !== undefined && value.status !== status)) {
      throw new FailureDecodeError()
    }
    const type = value.type === undefined ? "about:blank" : value.type
    if (typeof type !== "string") throw new FailureDecodeError()
    if (!type.startsWith("https://gokit.dev/errors/") || !isFailureCode(value.code)) {
      return HttpError.status(status, retryAfterMs === undefined ? {} : { retryAfterMs })
    }
    if (type !== `https://gokit.dev/errors/${value.code.toLowerCase().replaceAll("_", "-")}`) {
      throw new FailureDecodeError()
    }
    const failure = decodeFailure({ ...value, message: value.detail })
    if (failureCodes[failure.code].http !== status) throw new FailureDecodeError()
    const delays = [failure.retryAfterMs, retryAfterMs].filter(
      (delay): delay is number => delay !== undefined,
    )
    return HttpError.problem(status, {
      ...failure,
      retryAfterMs: failure.retryable && delays.length > 0 ? Math.max(...delays) : undefined,
    })
  } catch (cause) {
    if (!(cause instanceof FailureDecodeError)) throw cause
    return HttpError.decode({ cause })
  }
}
