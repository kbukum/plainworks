import { isRecord } from "@plainworks/std"
import { FailureDecodeError } from "@plainworks/std/failure"
import type { StreamFrame } from "@plainworks/std/seam"
import { ChannelError } from "../errors"
import { parseEventCursor } from "./cursor"
import type { FailureFrameDecoder } from "./failure"

/** Controls never acknowledge application delivery, including inherited parser IDs. */
export function validateControl(frame: StreamFrame, failures: FailureFrameDecoder): void {
  let data: unknown
  try {
    data = JSON.parse(frame.data)
  } catch (cause) {
    throw ChannelError.protocol("Invalid event control.", { cause })
  }
  if (frame.type === "failure") {
    let failure: ReturnType<FailureFrameDecoder>
    try {
      failure = failures(data)
    } catch (cause) {
      if (!(cause instanceof FailureDecodeError)) throw cause
      throw ChannelError.protocol("Invalid event control.", { cause })
    }
    throw ChannelError.failure(failure)
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
