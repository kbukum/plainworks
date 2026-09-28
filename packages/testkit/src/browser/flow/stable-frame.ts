import { raceAbort } from "@plainworks/std"
import { FlowError } from "./errors"

/** Options for {@link captureStableFrame}. */
export interface StableFrameOptions {
  /** The most frames to take before giving up. Defaults to 8. */
  readonly maxShots?: number
  readonly signal?: AbortSignal
}

const DEFAULT_MAX_SHOTS = 8

/**
 * Take frames until two in a row are byte-identical, and return that frame. A page still moving
 * (a late image, a live feed, a running transition) never yields a half-painted capture: it fails
 * with a `flow/unstable-frame` {@link FlowError} once `maxShots` frames all differ. Only the last
 * two frames are held, so memory stays bounded however long the page takes.
 *
 * Each shot is handed a signal that aborts with `options.signal`, and a cancel rejects at once
 * with a `flow/aborted` error, even while a shot is still in flight.
 */
export async function captureStableFrame(
  shoot: (signal: AbortSignal) => Promise<Uint8Array>,
  options: StableFrameOptions = {},
): Promise<Uint8Array> {
  const maxShots = options.maxShots ?? DEFAULT_MAX_SHOTS
  if (!Number.isInteger(maxShots) || maxShots < 2) {
    throw new RangeError("captureStableFrame needs at least two shots to compare")
  }
  // Owned here and aborted when the capture ends, so a shot never outlives it.
  const controller = new AbortController()
  const onAbort = (): void => controller.abort(options.signal?.reason)
  options.signal?.addEventListener("abort", onAbort, { once: true })
  try {
    let previous: Uint8Array | undefined
    for (let shot = 0; shot < maxShots; shot++) {
      if (options.signal?.aborted === true) throw cancelled(options.signal)
      const current = await raceAbort(shoot(controller.signal), options.signal).catch(
        (error: unknown) => {
          throw options.signal?.aborted === true ? cancelled(options.signal) : error
        },
      )
      if (previous !== undefined && sameBytes(previous, current)) return current
      previous = current
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort)
    controller.abort()
  }
  throw new FlowError(
    "unstable-frame",
    `The page never painted the same frame twice in ${maxShots} shots`,
  )
}

const cancelled = (signal: AbortSignal): FlowError =>
  new FlowError("aborted", "The capture was cancelled", { cause: signal.reason })

function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  return Buffer.from(first.buffer, first.byteOffset, first.byteLength).equals(second)
}
