import { PlainError } from "@plainworks/std"

/**
 * Why a channel operation failed, as a stable discriminant for typed handling instead of matching on
 * a message string.
 *
 * - `config` — the channel was constructed with an invalid option (a caller/programmer fault).
 * - `connect` — a connection attempt failed to establish (transport/DNS/handshake).
 * - `protocol` — the server responded in a way the transport cannot use (bad status, wrong
 *   content-type, malformed frame, a missing body).
 * - `closed` — reconnection was exhausted; the terminal state carries the last failure as `cause`.
 *   (Also used internally as the caller-close abort reason — caller `close()` is a quiet no-op path,
 *   never reported via `onError`.)
 */
export type ChannelErrorKind = "config" | "connect" | "protocol" | "closed"

/**
 * Typed error for `@plainworks/channel`, preserving its underlying `cause` so a transport/protocol
 * failure is never flattened to an opaque string. `status` is set when the failure carries an
 * HTTP-style status the shared classifier can read (so a `401`/`403` stops reconnection instead of
 * looping — see the fatal-vs-retryable classification in `std`).
 */
export class ChannelError extends PlainError<`channel/${ChannelErrorKind}`> {
  /** HTTP-style status when the failure came from a status response; otherwise `undefined`. */
  readonly status: number | undefined

  constructor(
    kind: ChannelErrorKind,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(`channel/${kind}`, message, options)
    this.status = options?.status
  }

  /** A configuration/usage fault detected at construction. */
  static config(message: string, options?: { cause?: unknown }): ChannelError {
    return new ChannelError("config", message, options)
  }

  /** A connection attempt that failed to establish. */
  static connect(message: string, options?: { cause?: unknown; status?: number }): ChannelError {
    return new ChannelError("connect", message, options)
  }

  /** A server response the transport cannot use. */
  static protocol(message: string, options?: { cause?: unknown; status?: number }): ChannelError {
    return new ChannelError("protocol", message, options)
  }

  /** The terminal closed state, carrying the last failure (if any) as `cause`. */
  static closed(message: string, options?: { cause?: unknown }): ChannelError {
    return new ChannelError("closed", message, options)
  }
}
