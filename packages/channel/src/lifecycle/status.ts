/**
 * Observable lifecycle of a channel session. A channel starts `idle`, moves to `connecting` on the
 * first attempt, `open` once a connection is established, `reconnecting` while re-establishing
 * after a dropped stream, `closing` briefly during a caller-initiated teardown, and `closed` once
 * the session ends (a clean caller close or reconnection exhausted / a fatal failure).
 *
 * `closed` ends the current **session**, not the channel: a channel is re-connectable, so a later
 * `connect()` starts a fresh session and moves back to `connecting`.
 *
 * `closing` is a **push-only transient**: a caller `close()` emits `closing` then `closed`
 * synchronously in the same tick, so a subscriber to status *changes* observes it (and can tell a
 * clean caller teardown apart from an error-driven close, which goes straight to `closed`), but a
 * snapshot reader of the current status never catches it — it is already `closed` by the next read.
 */
export type ChannelStatus = "idle" | "connecting" | "open" | "reconnecting" | "closing" | "closed"

/**
 * Whether `status` is terminal for the current session — no further transition until a
 * re-`connect()`.
 */
export function isTerminalStatus(status: ChannelStatus): boolean {
  return status === "closed"
}
