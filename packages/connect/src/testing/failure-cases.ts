import { create, toBinary } from "@bufbuild/protobuf"
import { base64Encode } from "@bufbuild/protobuf/wire"
import { Code, ConnectError } from "@connectrpc/connect"
import type { FailureCode } from "@plainworks/std/failure"
import {
  BadRequestSchema,
  ErrorInfoSchema,
  RetryInfoSchema,
} from "../errors/gen/google/rpc/error_details_pb"
import { mapConnectError } from "../errors/rpc-error"

export interface RpcFailureCase {
  readonly name: string
  readonly error: ConnectError
  readonly expected: { readonly code: FailureCode; readonly retryable: boolean }
}

/** Serializer-backed adversarial inputs for client consumers, independent of optional debug JSON. */
export function createRpcFailureCases(): readonly RpcFailureCase[] {
  const identity = {
    desc: ErrorInfoSchema,
    value: { domain: "example.test", reason: "QUOTA_PAUSED", metadata: { tier: "free" } },
  }
  const retry = { desc: RetryInfoSchema, value: { retryDelay: { seconds: 60n } } }
  const malformed = new ConnectError("Malformed", Code.InvalidArgument)
  malformed.details = [{ type: BadRequestSchema.typeName, value: new Uint8Array([255]) }]
  return [
    ...[false, true].map(
      (reverse): RpcFailureCase => ({
        name: reverse ? "retry-first" : "retry-last",
        error: new ConnectError(
          "Exhausted",
          Code.ResourceExhausted,
          undefined,
          reverse ? [retry, identity] : [identity, retry],
        ),
        expected: { code: "resource_exhausted", retryable: true },
      }),
    ),
    {
      name: "identity-without-retry",
      error: new ConnectError("Denied", Code.PermissionDenied, undefined, [
        { desc: ErrorInfoSchema, value: { domain: "example.test", reason: "FUTURE_IDENTITY" } },
      ]),
      expected: { code: "permission_denied", retryable: false },
    },
    {
      name: "malformed-detail",
      error: malformed,
      expected: { code: "internal", retryable: false },
    },
    {
      name: "descriptor-paths",
      error: new ConnectError("Check your profile", Code.InvalidArgument, undefined, [
        {
          desc: BadRequestSchema,
          value: {
            fieldViolations: [
              {
                field: "display_name",
                reason: "INVALID_VALUE",
                description: "This name is already taken",
              },
              {
                field: "addresses[0].postal_code",
                reason: "INVALID_FORMAT",
                description: "Check this postal code",
              },
              {
                field: "",
                reason: "INVALID_VALUE",
                description: "Review your profile before saving",
              },
            ],
          },
        },
      ]),
      expected: { code: "invalid_argument", retryable: false },
    },
  ]
}

/** Actual Connect error JSON with base64 protobuf details, never debug data. */
export function connectFailureJson(error: ConnectError): {
  code: string
  message: string
  details: { type: string; value: string }[]
} {
  return {
    code: mapConnectError(error).rpcCode,
    message: error.rawMessage,
    details: error.details.map((detail) => {
      const type = "desc" in detail ? detail.desc.typeName : detail.type
      const bytes =
        "desc" in detail ? toBinary(detail.desc, create(detail.desc, detail.value)) : detail.value
      return { type, value: base64Encode(bytes).replace(/=+$/, "") }
    }),
  }
}
