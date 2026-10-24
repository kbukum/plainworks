import { create, toBinary } from "@bufbuild/protobuf"
import { base64Decode } from "@bufbuild/protobuf/wire"
import { Code, ConnectError } from "@connectrpc/connect"
import { type Failure, FailureDecodeError } from "@plainworks/std/failure"
import { expect, test } from "vitest"
import { connectFailureJson, createRpcFailureCases } from "../testing"
import {
  BadRequestSchema,
  ErrorInfoSchema,
  RetryInfoSchema,
} from "./gen/google/rpc/error_details_pb"
import { decodeRpcFailure, type RpcFailureDecoder } from "./rpc-details"
import { mapConnectError } from "./rpc-error"

test.each(createRpcFailureCases())("published adversarial case: $name", ({ error, expected }) => {
  const json = connectFailureJson(error)
  const incoming = new ConnectError(json.message, error.code)
  incoming.details = json.details.map((detail) => ({
    type: detail.type,
    value: base64Decode(detail.value),
  }))
  expect(mapConnectError(incoming)).toMatchObject(expected)
})

test("reads ErrorInfo of any domain, RetryInfo and BadRequest", () => {
  expect(
    decodeRpcFailure({
      code: "resource_exhausted",
      message: "Slow down",
      details: [
        {
          desc: ErrorInfoSchema,
          value: { domain: "example.test", reason: "QUOTA", metadata: { limit: "10" } },
        },
        { desc: RetryInfoSchema, value: { retryDelay: { seconds: 1n, nanos: 250_000_000 } } },
        {
          desc: BadRequestSchema,
          value: { fieldViolations: [{ field: "size", description: "Too big" }] },
        },
      ],
    }),
  ).toEqual({
    code: "resource_exhausted",
    message: "Slow down",
    reason: "QUOTA",
    domain: "example.test",
    metadata: { limit: "10" },
    violations: [{ field: "size", reason: "INVALID_VALUE", message: "Too big" }],
    retryable: true,
    retryAfterMs: 1250,
  })
})

test.each([
  ["unavailable", true],
  ["internal", false],
  ["resource_exhausted", false],
] as const)("without RetryInfo, %s retryable is %s", (code, retryable) => {
  expect(decodeRpcFailure({ code, message: "x", details: [] })).toMatchObject({
    retryable,
    reason: undefined,
    domain: undefined,
    metadata: {},
  })
})

test.each([
  { seconds: -1n },
  { seconds: 315_576_000_001n },
  { seconds: 1n, nanos: -1 },
  { nanos: 1_000_000_000 },
])("invalid RetryInfo duration is operational: %#", (retryDelay) => {
  expect(() =>
    decodeRpcFailure({
      code: "unavailable",
      message: "Unavailable",
      details: [{ desc: RetryInfoSchema, value: { retryDelay } }],
    }),
  ).toThrow(FailureDecodeError)
})

test("duplicate recognized details fail closed", () => {
  const retry = { desc: RetryInfoSchema, value: { retryDelay: { seconds: 1n } } }
  const info = { desc: ErrorInfoSchema, value: { domain: "a.test", reason: "A" } }
  for (const detail of [retry, info]) {
    expect(() =>
      decodeRpcFailure({ code: "unavailable", message: "x", details: [detail, detail] }),
    ).toThrow(FailureDecodeError)
  }
})

test("terminal authentication ignores retry permission and delay", () => {
  const error = mapConnectError(
    new ConnectError("Sign in", Code.Unauthenticated, undefined, [
      { desc: RetryInfoSchema, value: { retryDelay: { seconds: 1n } } },
    ]),
  )
  expect(error).toMatchObject({
    code: "unauthenticated",
    retryable: false,
    retryAfterMs: undefined,
    authentication: "unauthenticated",
  })
})

test("preserves protocol identity and serialized detail bytes", () => {
  const info = create(ErrorInfoSchema, { domain: "example.test", reason: "LOCKED" })
  const incoming = new ConnectError("Locked", Code.FailedPrecondition)
  incoming.details = [{ type: ErrorInfoSchema.typeName, value: toBinary(ErrorInfoSchema, info) }]
  const error = mapConnectError(incoming)
  expect(error).toMatchObject({
    code: "failed_precondition",
    rpcCode: "failed_precondition",
    rawCode: Code.FailedPrecondition,
    reason: "LOCKED",
    domain: "example.test",
  })
})

test("malformed known details are operational failures", () => {
  expect(() =>
    decodeRpcFailure({
      code: "invalid_argument",
      message: "bad",
      details: [{ type: BadRequestSchema.typeName, value: new Uint8Array([255]) }],
    }),
  ).toThrow(FailureDecodeError)
})

test("an injected decoder refines the standard failure and keeps the wire status", () => {
  const decode: RpcFailureDecoder = (input) => {
    const failure: Failure = decodeRpcFailure(input)
    return { ...failure, code: "not_found", reason: failure.metadata?.cause }
  }
  const error = mapConnectError(
    new ConnectError("Gone", Code.FailedPrecondition, undefined, [
      {
        desc: ErrorInfoSchema,
        value: { domain: "a.test", reason: "X", metadata: { cause: "GONE" } },
      },
    ]),
    decode,
  )
  expect(error).toMatchObject({ code: "not_found", rpcCode: "failed_precondition", reason: "GONE" })
})

test("a decoder that rejects the details yields an operational failure with its cause", () => {
  const source = new ConnectError("x", Code.Internal)
  const error = mapConnectError(source, () => {
    throw new FailureDecodeError()
  })
  expect(error).toMatchObject({ code: "internal", retryable: false })
  expect(error.cause).toBeInstanceOf(FailureDecodeError)
})
