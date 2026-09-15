import type { PlainEvent, StreamFrame } from "@plainworks/std"
import { ChannelError } from "../error"

/**
 * Decode a raw {@link StreamFrame} into a typed {@link PlainEvent}, or return `undefined` to drop
 * the frame (e.g. a heartbeat comment or an event type this router ignores). It runs at a **trust
 * boundary** over the frame's untrusted `data`: validate here, and throw on malformed input rather
 * than fabricate a value — the router routes the failure to `onError` and drops the frame.
 *
 * The decoder produces the shared {@link PlainEvent} shape — the one seam `channel`'s state sink
 * and `query`'s cache sink both consume — so one live stream drives both with no per-consumer
 * mapping. The frame's `id` is a reconnect-resume cursor tracked by the channel core, not event
 * data, so it is deliberately not carried onto the event.
 */
export type EventDecoder<TEvent extends PlainEvent> = (frame: StreamFrame) => TEvent | undefined

/**
 * Build an {@link EventDecoder} that `JSON.parse`s the frame `data` and validates the result into a
 * {@link PlainEvent}. Both a malformed-JSON parse failure and a `validate` failure **throw** — the
 * router surfaces them via `onError` and drops the frame — so a corrupt frame is reported, never
 * silently discarded, and an untrusted stream never yields an unvalidated payload. To intentionally
 * ignore a frame, write a decoder that returns `undefined`.
 */
export function jsonDecoder<TData>(
  validate: (value: unknown) => TData,
): EventDecoder<PlainEvent<string, TData>> {
  return (frame) => {
    let raw: unknown
    try {
      raw = JSON.parse(frame.data)
    } catch (cause) {
      throw ChannelError.protocol("event payload is not valid JSON", { cause })
    }
    return { type: frame.type, data: validate(raw) }
  }
}
