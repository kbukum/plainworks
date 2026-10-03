import { getErrorMessage, isPositiveInteger } from "@plainworks/std"
import { stringifyJson } from "@plainworks/std/encoding"
import { AbortError } from "@plainworks/std/resilience"
import {
  PayloadTooLargeError,
  readBoundedText,
  type WebAbortSignal,
  type WebResponse,
} from "@plainworks/std/web"
import { HttpError } from "../errors/http-error"
import type { BodyCodec, EncodedBody } from "./body"

/**
 * Default cap on a decoded response body: 10 MiB. A body larger than this is refused with a fatal
 * decode error rather than buffered, so a chunked or dishonest server cannot exhaust process
 * memory. Raise or lower it per codec via {@link createJsonCodec} when a protocol legitimately
 * needs a different ceiling.
 */
export const DEFAULT_MAX_BODY_BYTES: number = 10 * 1024 * 1024

/** Options for {@link createJsonCodec}. */
export interface JsonCodecOptions {
  /** Maximum decoded body size in bytes before the read is refused. Defaults to {@link DEFAULT_MAX_BODY_BYTES}. */
  readonly maxBytes?: number
}

/**
 * Build a JSON {@link BodyCodec} with a configurable maximum decoded body size.
 *
 * Encoding uses std's `stringifyJson`: a value JSON can't hold faithfully (a cycle, a function, a
 * symbol, a BigInt, a non-finite number) is a fatal {@link HttpError} `http/encode`, never a
 * silently dropped field. An `undefined` property is left out, as `JSON.stringify` does.
 *
 * Decoding reads the body with std's bounded `readBoundedText`: past `maxBytes` it is a fatal
 * `http/decode` error, a stream fault is a retryable `http/network` error, and an abort stays a
 * typed abort error. An empty body (including `204`/`205`) decodes to `undefined`, and a malformed
 * body is a fatal `http/decode` error. `maxBytes` must be a positive safe integer.
 */
export function createJsonCodec(options: JsonCodecOptions = {}): BodyCodec {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  if (!isPositiveInteger(maxBytes)) {
    // A non-finite, fractional, or non-positive cap would let the bound silently degrade to "no
    // limit" (`Infinity`/`NaN` compare false against every size) or refuse every body, defeating
    // the memory guard. Fail loudly at construction rather than at the first oversized response.
    throw new RangeError("createJsonCodec requires maxBytes to be a positive integer")
  }
  return {
    encode(value: unknown): EncodedBody {
      try {
        return {
          body: stringifyJson(value, { omitUndefined: true }),
          contentType: "application/json",
        }
      } catch (cause) {
        throw HttpError.encode({ message: getErrorMessage(cause), cause })
      }
    },
    async decode(response: WebResponse, signal?: WebAbortSignal): Promise<unknown> {
      if (response.status === 204 || response.status === 205) {
        return undefined
      }
      const text = await readBody(response, maxBytes, signal)
      if (text.length === 0) {
        return undefined
      }
      try {
        const parsed: unknown = JSON.parse(text)
        return parsed
      } catch (cause) {
        throw HttpError.decode({ cause })
      }
    },
  }
}

/** The default JSON {@link BodyCodec} — {@link createJsonCodec} with the default size cap. */
export const jsonCodec: BodyCodec = createJsonCodec()

/**
 * Read a response body under the codec's cap, mapping the std reader's failures onto the client's
 * error model: an oversized body is a fatal decode error, a stream fault a retryable network error,
 * and an abort stays a typed {@link AbortError}.
 */
async function readBody(
  response: WebResponse,
  maxBytes: number,
  signal: WebAbortSignal | undefined,
): Promise<string> {
  try {
    return await readBoundedText(
      response.body,
      signal === undefined ? { maxBytes } : { maxBytes, signal },
    )
  } catch (cause) {
    if (cause instanceof AbortError) {
      throw cause
    }
    if (cause instanceof PayloadTooLargeError) {
      throw HttpError.decode({
        message: `Response body exceeded the maximum decode size of ${maxBytes} bytes.`,
        cause,
      })
    }
    throw HttpError.network({ message: "Failed to read the response body stream.", cause })
  }
}
