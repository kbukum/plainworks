/**
 * Observable lifecycle of a channel. A channel starts `idle`, moves to `connecting` on the first
 * attempt, `open` once a connection is established, `reconnecting` while re-establishing after a
 * dropped stream, `closing` briefly during a caller-initiated teardown, and `closed` terminally
 * (either a clean caller close or reconnection exhausted / a fatal failure).
 *
 * `closing` is a **push-only transient**: a caller `close()` emits `closing` then `closed`
 * synchronously in the same tick, so a subscriber to status *changes* observes it (and can tell a
 * clean caller teardown apart from an error-driven close, which goes straight to `closed`), but a
 * snapshot reader of the current status never catches it — it is already `closed` by the next read.
 */
export type ChannelStatus = "idle" | "connecting" | "open" | "reconnecting" | "closing" | "closed"

/** Whether `status` is terminal — no further transition is possible once `closed`. */
export function isTerminalStatus(status: ChannelStatus): boolean {
  return status === "closed"
}
