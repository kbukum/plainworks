import { PlainError } from "../errors"
import { isPositiveInteger } from "../guard"
import { NetworkError } from "../resilience/classify"
import { AbortError } from "../resilience/timeout"
import type { WebAbortSignal, WebReadableStream, WebReadableStreamDefaultReader } from "./types"

/** Options for {@link readBoundedBytes} and {@link readBoundedText}. */
export interface BoundedReadOptions {
  /** The most bytes to buffer. A positive safe integer. */
  readonly maxBytes: number
  /** Cancels the read; the stream is cancelled and the read rejects with {@link AbortError}. */
  readonly signal?: WebAbortSignal
}

/** A body passed its byte cap. A server maps this to `413 Payload Too Large`. */
export class PayloadTooLargeError extends PlainError<"std/payload-too-large"> {
  /** The cap the body exceeded. */
  readonly maxBytes: number

  constructor(maxBytes: number) {
    super("std/payload-too-large", `Body exceeded the maximum size of ${maxBytes} bytes`)
    this.maxBytes = maxBytes
  }
}

/**
 * Read a body stream into bytes without buffering more than `maxBytes`. Any body that crossed a
 * trust boundary (a request to a server, a response from a remote) is read this way, so a large
 * or never-ending body can't exhaust memory. `null` reads as no bytes.
 *
 * @throws {RangeError} When `maxBytes` is not a positive safe integer.
 * @throws {PayloadTooLargeError} When the body passes `maxBytes`; the stream is cancelled.
 * @throws {AbortError} When `signal` aborts before or during the read; the stream is cancelled.
 * @throws {NetworkError} When the stream itself fails; the fault is kept as `cause`.
 */
export async function readBoundedBytes(
  body: WebReadableStream<Uint8Array> | null,
  options: BoundedReadOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = []
  const received = await drainBounded(body, options, (chunk) => {
    chunks.push(chunk)
  })
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * Read a body stream as UTF-8 text without buffering more than `maxBytes`. The cap counts bytes,
 * not characters, and text is decoded as it arrives. Same failure contract as
 * {@link readBoundedBytes}.
 */
export async function readBoundedText(
  body: WebReadableStream<Uint8Array> | null,
  options: BoundedReadOptions,
): Promise<string> {
  const decoder = new TextDecoder()
  let text = ""
  await drainBounded(body, options, (chunk) => {
    text += decoder.decode(chunk, { stream: true })
  })
  return text + decoder.decode()
}

/** Pull every chunk into `onChunk`, enforcing the cap and the signal. Returns the byte count. */
async function drainBounded(
  body: WebReadableStream<Uint8Array> | null,
  { maxBytes, signal }: BoundedReadOptions,
  onChunk: (chunk: Uint8Array) => void,
): Promise<number> {
  if (!isPositiveInteger(maxBytes)) {
    throw new RangeError("A bounded body read requires maxBytes to be a positive safe integer")
  }
  if (body === null) {
    return 0
  }
  // An already-aborted signal never fires `abort` again, so check it before taking the reader.
  if (signal?.aborted) {
    await cancelQuietly(body)
    throw new AbortError({ cause: signal.reason })
  }
  const reader = body.getReader()
  const onAbort = (): void => {
    void cancelQuietly(reader)
  }
  signal?.addEventListener("abort", onAbort, { once: true })
  let received = 0
  try {
    for (;;) {
      const chunk = await readChunk(reader, signal)
      // A read can settle with data after the abort fired; a partial body is never a success.
      if (signal?.aborted) {
        throw new AbortError({ cause: signal.reason })
      }
      if (chunk.done) {
        return received
      }
      received += chunk.value.byteLength
      if (received > maxBytes) {
        await cancelQuietly(reader)
        throw new PayloadTooLargeError(maxBytes)
      }
      onChunk(chunk.value)
    }
  } finally {
    signal?.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }
}

async function readChunk(
  reader: WebReadableStreamDefaultReader<Uint8Array>,
  signal: WebAbortSignal | undefined,
): ReturnType<WebReadableStreamDefaultReader<Uint8Array>["read"]> {
  try {
    return await reader.read()
  } catch (cause) {
    // A cancel from the abort listener surfaces as a read rejection; report the abort, not a fault.
    if (signal?.aborted) {
      throw new AbortError({ cause: signal.reason })
    }
    throw new NetworkError("Failed to read the body stream", { cause })
  }
}

/**
 * Cancel as best-effort teardown. A stream that refuses to cancel must not hide the abort,
 * overflow, or network error being raised, so a rejected cancel is ignored.
 */
async function cancelQuietly(cancellable: { cancel(): Promise<void> }): Promise<void> {
  try {
    await cancellable.cancel()
  } catch {
    // Ignored on purpose: teardown is best-effort.
  }
}
