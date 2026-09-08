import { ChannelError } from "../error"
import type { ChannelFrame } from "../transport"

/**
 * A decoded, application-level event — the trusted result of decoding a raw {@link ChannelFrame} at
 * the router boundary. `payload` has been parsed and validated from the frame's untrusted `data`
 * string; downstream sinks consume it without re-parsing.
 */
export interface DecodedEvent<T = unknown> {
  /** Event discriminant, carried through from the frame's `type`. */
  readonly type: string
  /** Decoded, validated payload. */
  readonly payload: T
  /** Server event id, when the frame carried one. */
  readonly id?: string | undefined
}

/**
 * Decode a raw {@link ChannelFrame} into a {@link DecodedEvent}, or return `undefined` to drop the
 * frame (e.g. a heartbeat comment or an event type this router ignores). It runs at a **trust
 * boundary** over the frame's untrusted `data`: validate here, and throw on malformed input rather
 * than fabricate a value — the router routes the failure to `onError` and drops the frame.
 */
export type EventDecoder<T> = (frame: ChannelFrame) => DecodedEvent<T> | undefined

/**
 * Build an {@link EventDecoder} that `JSON.parse`s the frame `data` and validates the result.
 * Both a malformed-JSON parse failure and a `validate` failure **throw** — the router surfaces them
 * via `onError` and drops the frame — so a corrupt frame is reported, never silently discarded, and
 * an untrusted stream never yields an unvalidated payload. To intentionally ignore a frame, write a
 * decoder that returns `undefined`.
 */
export function jsonDecoder<T>(validate: (value: unknown) => T): EventDecoder<T> {
  return (frame) => {
    let raw: unknown
    try {
      raw = JSON.parse(frame.data)
    } catch (cause) {
      throw ChannelError.protocol("event payload is not valid JSON", { cause })
    }
    return { type: frame.type, payload: validate(raw), id: frame.id }
  }
}
