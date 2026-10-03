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
  FailureDecodeError,
  failureCodeFor,
  failureCodes,
  isFailureCode,
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

/** Decode standard bytes, not Connect's optional debug JSON or lossy findDetails(). */
export function decodeRpcFailure(
  rawCode: number,
  message: string,
  details: readonly Detail[],
): Failure {
  if (!Number.isInteger(rawCode) || rawCode < 1 || rawCode > 16) {
    throw new FailureDecodeError()
  }
  let identity: ErrorInfo | undefined
  let retry: RetryInfo | undefined
  let badRequest: BadRequest | undefined
  for (const detail of details) {
    const type = "desc" in detail ? detail.desc.typeName : detail.type
    switch (type) {
      case ErrorInfoSchema.typeName: {
        const info = decodeDetail(ErrorInfoSchema, detail)
        if (info.domain !== "gokit.dev") break
        if (identity !== undefined) throw new FailureDecodeError()
        identity = info
        break
      }
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
  let code = failureCodeFor(rawCode, "rpc")
  let retryable = retry !== undefined || failureCodes[code].retryable
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
  let reason: string | undefined
  let traceId: string | undefined
  if (identity !== undefined && isFailureCode(identity.reason)) {
    code = identity.reason
    const verdict = identity.metadata.retryable
    if (failureCodes[code].rpc !== rawCode || (verdict !== "true" && verdict !== "false")) {
      throw new FailureDecodeError()
    }
    reason = identity.metadata.reason
    if (reason !== undefined && !isViolationReason(reason)) throw new FailureDecodeError()
    traceId = identity.metadata.traceId
    retryable = verdict === "true"
  }
  const violations: Violation[] = (badRequest?.fieldViolations ?? []).map((violation) => {
    const reason = violation.reason || "INVALID_VALUE"
    if (!isViolationReason(reason)) throw new FailureDecodeError()
    return { field: violation.field, reason, message: violation.description }
  })
  return {
    code,
    message,
    reason,
    traceId,
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
