import { cancelReadable, type WebAbortSignal, type WebResponse } from "@plainworks/std/web"
import { jsonCodec } from "../codec"
import { HttpError } from "./http-error"
import { decodeProblem } from "./problem"
import { parseRetryAfterMs } from "./retry-after"

/** Decode an HTTP rejection once for unary and streaming transports. Owns its bounded body read. */
export async function decodeResponseFailure(
  response: WebResponse,
  signal: WebAbortSignal,
  now: number,
): Promise<HttpError> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"), now)
  const problem =
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ===
    "application/problem+json"
  if (problem)
    return decodeProblem(await jsonCodec.decode(response, signal), response.status, retryAfterMs)
  // The HTTP status is the terminal outcome; release the unread body best-effort without blocking
  // it on the source's optional async cleanup, which could otherwise outrun the request deadline
  // and turn a known rejection into a timeout.
  if (response.body !== null) cancelReadable(response.body)
  return HttpError.status(response.status, {
    cause: response,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  })
}
