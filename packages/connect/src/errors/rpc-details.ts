import {
  create,
  type DescMessage,
  fromBinary,
  type MessageShape,
  toBinary,
} from "@bufbuild/protobuf"
import type { ConnectError } from "@connectrpc/connect"
import {
  type Failure,
  type FailureCode,
  FailureDecodeError,
  isViolationReason,
  type Violation,
} from "@plainworks/std/failure"
import {
  type BadRequest,
  BadRequestSchema,
  type ErrorInfo,
  ErrorInfoSchema,
  type RetryInfo,
  RetryInfoSchema,
} from "./gen/google/rpc/error_details_pb"

type Detail = ConnectError["details"][number]

/** A Connect error as received: its status code, message, and `google.rpc` detail messages. */
export interface RpcFailureInput {
  readonly code: FailureCode
  readonly message: string
  readonly details: readonly Detail[]
}

/**
 * Turns a Connect error into a {@link Failure}. The default is {@link decodeRpcFailure}; an
 * application passes its own to read a server's `ErrorInfo` domain and metadata.
 *
 * @throws {FailureDecodeError} When the details break the contract the decoder reads.
 */
export type RpcFailureDecoder = (input: RpcFailureInput) => Failure

/**
 * Decode the standard `google.rpc` error model from detail bytes, not Connect's optional debug JSON
 * or lossy `findDetails()`. One `ErrorInfo` of any domain supplies reason, domain and metadata;
 * `BadRequest` supplies violations; `RetryInfo` supplies the delay. A failure is retryable when the
 * server sent `RetryInfo` or the code is `unavailable`, as Google's AIP-194 advises for RPC
 * clients. This is RPC's standard, not HTTP's (`isRetryableStatus` in `@plainworks/std/failure`):
 * an HTTP `500` or `429` is retryable by default, a Connect `internal` or `resource_exhausted`
 * without `RetryInfo` is not. A server that wants one verdict on both sends it explicitly.
 *
 * @throws {FailureDecodeError} When a known detail repeats, does not decode, or is out of range.
 */
export function decodeRpcFailure({ code, message, details }: RpcFailureInput): Failure {
  let identity: ErrorInfo | undefined
  let retry: RetryInfo | undefined
  let badRequest: BadRequest | undefined
  for (const detail of details) {
    const type = "desc" in detail ? detail.desc.typeName : detail.type
    switch (type) {
      case ErrorInfoSchema.typeName:
        if (identity !== undefined) throw new FailureDecodeError()
        identity = decodeDetail(ErrorInfoSchema, detail)
        break
      case RetryInfoSchema.typeName:
        if (retry !== undefined) throw new FailureDecodeError()
        retry = decodeDetail(RetryInfoSchema, detail)
        break
      case BadRequestSchema.typeName:
        if (badRequest !== undefined) throw new FailureDecodeError()
        badRequest = decodeDetail(BadRequestSchema, detail)
        break
    }
  }
  const retryable = retry !== undefined || code === "unavailable"
  let retryAfterMs: number | undefined
  if (retry?.retryDelay !== undefined) {
    const { seconds, nanos } = retry.retryDelay
    if (seconds < 0n || seconds > 315_576_000_000n || nanos < 0 || nanos > 999_999_999) {
      throw new FailureDecodeError()
    }
    const ms = seconds * 1000n + BigInt(Math.ceil(nanos / 1_000_000))
    if (ms > BigInt(Number.MAX_SAFE_INTEGER)) throw new FailureDecodeError()
    retryAfterMs = ms === 0n ? undefined : Number(ms)
  }
  const violations: Violation[] = (badRequest?.fieldViolations ?? []).map((violation) => {
    const reason = violation.reason || "INVALID_VALUE"
    if (!isViolationReason(reason)) throw new FailureDecodeError()
    return { field: violation.field, reason, message: violation.description }
  })
  return {
    code,
    message,
    reason: identity?.reason || undefined,
    domain: identity?.domain || undefined,
    metadata: { ...identity?.metadata },
    violations,
    retryable,
    retryAfterMs: retryable ? retryAfterMs : undefined,
  }
}

function decodeDetail<D extends DescMessage>(schema: D, detail: Detail): MessageShape<D> {
  try {
    const bytes =
      "desc" in detail ? toBinary(detail.desc, create(detail.desc, detail.value)) : detail.value
    return fromBinary(schema, bytes)
  } catch (cause) {
    throw new FailureDecodeError({ cause })
  }
}
