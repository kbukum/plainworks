import { AbortError, type WebAbortSignal, type WebResponse } from "@plainworks/std"
import { HttpError } from "../error"
import type { BodyCodec, EncodedBody } from "./body"

/**
 * Default cap on a decoded response body: 10 MiB. A body larger than this is refused with a fatal
 * decode error rather than buffered, so a chunked or dishonest server cannot exhaust process memory.
 * Raise or lower it per codec via {@link createJsonCodec} when a protocol legitimately needs a
 * different ceiling.
 */
export const DEFAULT_MAX_BODY_BYTES: number = 10 * 1024 * 1024

/** Options for {@link createJsonCodec}. */
export interface JsonCodecOptions {
  /** Maximum decoded body size in bytes before the read is refused. Defaults to {@link DEFAULT_MAX_BODY_BYTES}. */
  readonly maxBytes?: number
}

/**
 * Build a JSON {@link BodyCodec} with a configurable maximum decoded body size. Encoding maps a
 * non-serializable value (cyclic, `BigInt`, or a top-level `function`/`symbol` that `JSON.stringify`
 * renders as `undefined`) to a fatal {@link HttpError} `http/encode` instead of throwing a raw
 * `TypeError` or emitting an invalid body. Decoding reads the body through a bounded streaming reader
 * that cancels the stream once `maxBytes` is exceeded (rejecting with a fatal {@link HttpError}
 * `http/decode`) or the caller's signal aborts (rejecting with a typed abort error), treats an
 * empty body (including `204`/`205`) as `undefined`, and wraps a malformed body in a fatal
 * {@link HttpError} `http/decode` rather than leaking the raw `SyntaxError`. `maxBytes` must be a
 * positive integer.
 */
export function createJsonCodec(options: JsonCodecOptions = {}): BodyCodec {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    // A non-finite, fractional, or non-positive cap would let the bound silently degrade to "no
    // limit" (`Infinity`/`NaN` compare false against every size) or refuse every body, defeating the
    // memory guard. Fail loudly at construction rather than at the first oversized response.
    throw new RangeError("createJsonCodec requires maxBytes to be a positive integer")
  }
  return {
    encode(value: unknown): EncodedBody {
      let serialized: string | undefined
      try {
        serialized = JSON.stringify(value)
      } catch (cause) {
        throw HttpError.encode({ cause })
      }
      if (serialized === undefined) {
        throw HttpError.encode({
          message: "Request body is not JSON-serializable (function, symbol, or undefined).",
        })
      }
      return { body: serialized, contentType: "application/json" }
    },
    async decode(response: WebResponse, signal?: WebAbortSignal): Promise<unknown> {
      if (response.status === 204 || response.status === 205) {
        return undefined
      }
      const text = await readBoundedText(response, maxBytes, signal)
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
 * Read a response body as text without buffering more than `maxBytes`. Bytes are pulled from the
 * body stream and decoded incrementally; the reader is cancelled the moment the cap is exceeded or
 * `signal` aborts, so an oversized or stalled body never accumulates unbounded memory and its
 * connection is released. A `null` body (no content) decodes to the empty string. A cancellation —
 * whether the signal was already aborted or fired mid-read — rejects with a typed {@link AbortError}
 * rather than resolving a truncated body as if it were complete, and a genuine stream fault (the
 * underlying `read()` rejecting for a non-abort reason) maps to a retryable `http/network` error.
 */
async function readBoundedText(
  response: WebResponse,
  maxBytes: number,
  signal?: WebAbortSignal,
): Promise<string> {
  const body = response.body
  if (body === null) {
    return ""
  }
  // An already-aborted signal never emits a fresh `abort` event: release the connection and surface
  // the cancellation as a typed abort, never a silent empty body a caller would treat as success.
  if (signal?.aborted) {
    await safeCancel(body)
    throw new AbortError({ cause: signal.reason })
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const onAbort = (): void => {
    void safeCancel(reader)
  }
  signal?.addEventListener("abort", onAbort, { once: true })
  let received = 0
  let text = ""
  try {
    for (;;) {
      let chunk: Awaited<ReturnType<typeof reader.read>>
      try {
        chunk = await reader.read()
      } catch (cause) {
        // An abort that races the in-flight read surfaces here as a rejection; report it as the
        // cancellation it is, not a transport fault.
        if (signal?.aborted) {
          throw new AbortError({ cause: signal.reason })
        }
        throw HttpError.network({ message: "Failed to read the response body stream.", cause })
      }
      // The read may settle with a final chunk after the abort fired; honor the cancellation before
      // treating that partial body as a complete response.
      if (signal?.aborted) {
        throw new AbortError({ cause: signal.reason })
      }
      if (chunk.done) {
        break
      }
      received += chunk.value.byteLength
      if (received > maxBytes) {
        await safeCancel(reader)
        throw HttpError.decode({
          message: `Response body exceeded the maximum decode size of ${maxBytes} bytes.`,
        })
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    return text
  } finally {
    signal?.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }
}

/**
 * Cancel a reader or stream as best-effort teardown. A body that refuses to cancel must never mask
 * the abort/decode/network error being raised, so a rejected cancellation is swallowed.
 */
async function safeCancel(cancellable: { readonly cancel: () => Promise<void> }): Promise<void> {
  try {
    await cancellable.cancel()
  } catch {
    // Intentionally ignored — teardown is best-effort.
  }
}
