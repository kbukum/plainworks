import { isRecord } from "@plainworks/std"
import { decodeProblem, type Failure, FailureDecodeError } from "@plainworks/std/failure"

/**
 * Reads the parsed JSON of an in-stream `failure` frame. The default is
 * {@link decodeFailureFrame}; an application passes its own for a server with a different frame.
 *
 * @throws {FailureDecodeError} When the frame breaks the contract the decoder reads.
 */
export type FailureFrameDecoder = (data: unknown) => Failure

/**
 * Decode a `failure` frame as an RFC 9457 problem. A stream has no response status for the
 * failure, so the frame's `status` member is required and sets the code.
 */
export const decodeFailureFrame: FailureFrameDecoder = (data) => {
  const status = isRecord(data) ? data.status : undefined
  if (typeof status !== "number" || !Number.isInteger(status) || status < 400 || status > 599) {
    throw new FailureDecodeError()
  }
  return decodeProblem({ status, body: data })
}
