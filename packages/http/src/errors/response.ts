import { decodeProblem, FailureDecodeError, type ProblemDecoder } from "@plainworks/std/failure"
import { cancelReadable, type WebAbortSignal, type WebResponse } from "@plainworks/std/web"
import { jsonCodec } from "../codec"
import { HttpError } from "./http-error"
import { parseRetryAfterMs } from "./retry-after"

/**
 * Decode an HTTP rejection once for unary and streaming transports. Owns its bounded body read.
 * An `application/problem+json` body goes through `failures` (RFC 9457 by default); any other
 * body is released and the status alone decides the failure.
 */
export async function decodeResponseFailure(
  response: WebResponse,
  signal: WebAbortSignal,
  now: number,
  failures: ProblemDecoder = decodeProblem,
): Promise<HttpError> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"), now)
  const problem =
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ===
    "application/problem+json"
  if (problem) {
    const body = await jsonCodec.decode(response, signal)
    try {
      return HttpError.problem(
        response.status,
        failures({ status: response.status, body, retryAfterMs }),
      )
    } catch (cause) {
      if (!(cause instanceof FailureDecodeError)) throw cause
      return HttpError.decode({ cause })
    }
  }
  // The HTTP status is the terminal outcome; release the unread body best-effort without blocking
  // it on the source's optional async cleanup, which could otherwise outrun the request deadline
  // and turn a known rejection into a timeout.
  if (response.body !== null) cancelReadable(response.body)
  return HttpError.status(response.status, {
    cause: response,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  })
}
