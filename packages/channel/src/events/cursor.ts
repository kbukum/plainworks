import { ChannelError } from "../errors"

/** An instance epoch and lossless uint64 sequence. Gaps may represent authorized filtering. */
export interface EventCursor {
  readonly epoch: string
  readonly sequence: bigint
}

export function parseEventCursor(value: string): EventCursor {
  const match = /^([0-9a-f]{32}):(0|[1-9][0-9]{0,19})$/.exec(value)
  const epoch = match?.[1]
  const digits = match?.[2]
  if (epoch === undefined || digits === undefined) {
    throw ChannelError.protocol("Invalid event cursor.")
  }
  const sequence = BigInt(digits)
  if (sequence > 18446744073709551615n) throw ChannelError.protocol("Invalid event sequence.")
  return { epoch, sequence }
}
