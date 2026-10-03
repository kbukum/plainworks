import { isRecord } from "@plainworks/std"
import { decodeFailure } from "@plainworks/std/failure"
import type { StreamFrame } from "@plainworks/std/seam"
import { ChannelError } from "../errors"
import { parseEventCursor } from "./cursor"

/** Controls never acknowledge application delivery, including inherited parser IDs. */
export function validateControl(frame: StreamFrame): void {
  let data: unknown
  try {
    data = JSON.parse(frame.data)
  } catch (cause) {
    throw ChannelError.protocol("Invalid event control.", { cause })
  }
  if (frame.type === "failure") {
    throw ChannelError.failure(decodeFailure(data))
  }
  if (!isRecord(data) || typeof data.cursor !== "string") {
    throw ChannelError.protocol("Invalid event control.")
  }
  const cursor = parseEventCursor(data.cursor)
  if (frame.type === "connected" && data.epoch === cursor.epoch) return
  if (
    frame.type === "reset" &&
    (data.reason === "epochChanged" ||
      data.reason === "replayExpired" ||
      data.reason === "overflow")
  )
    return
  throw ChannelError.protocol("Invalid event control.")
}
