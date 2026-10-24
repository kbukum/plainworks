import { isRecord } from "../guard"
import { failureCodeForStatus, isRetryableStatus } from "./codes"
import { type Failure, FailureDecodeError } from "./failure"

/** A rejected HTTP exchange: its status, decoded JSON body, and parsed `Retry-After` delay. */
export interface ProblemInput {
  readonly status: number
  readonly body: unknown
  readonly retryAfterMs?: number | undefined
}

/**
 * Turns a rejected HTTP exchange into a {@link Failure}. The default is {@link decodeProblem};
 * an application passes its own to read a server's documented extension members.
 *
 * @throws {FailureDecodeError} When the body breaks the contract the decoder reads.
 */
export type ProblemDecoder = (input: ProblemInput) => Failure

const members = new Set(["type", "title", "status", "detail", "instance"])

/**
 * Decode an RFC 9457 problem details object. The HTTP status sets the code and the default retry
 * verdict ({@link isRetryableStatus}); a non-`about:blank` `type` becomes the reason;
 * string extension members become metadata. The body never replaces the HTTP status.
 *
 * @throws {FailureDecodeError} When the body is not an object, a member has the wrong type, or the
 * `status` member disagrees with the response.
 */
export function decodeProblem({ status, body, retryAfterMs }: ProblemInput): Failure {
  if (!isRecord(body) || (body.status !== undefined && body.status !== status)) {
    throw new FailureDecodeError()
  }
  const { type = "about:blank", title, detail, instance } = body
  if (
    typeof type !== "string" ||
    (title !== undefined && typeof title !== "string") ||
    (detail !== undefined && typeof detail !== "string") ||
    (instance !== undefined && typeof instance !== "string")
  ) {
    throw new FailureDecodeError()
  }
  const metadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!members.has(key) && typeof value === "string") metadata[key] = value
  }
  const retryable = isRetryableStatus(status)
  return {
    code: failureCodeForStatus(status),
    message: detail ?? title ?? `Request failed with status ${status}`,
    reason: type === "about:blank" ? undefined : type,
    metadata,
    violations: [],
    retryable,
    retryAfterMs: retryable ? retryAfterMs : undefined,
  }
}
