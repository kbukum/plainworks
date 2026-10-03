import { create, fromBinary, toBinary } from "@bufbuild/protobuf"
import { base64Decode } from "@bufbuild/protobuf/wire"
import { Code, ConnectError } from "@connectrpc/connect"
import { wireFailures } from "@plainworks/mocks/failure"
import { decodeFailure, FailureDecodeError } from "@plainworks/std/failure"
import { describe, expect, test } from "vitest"
import { connectFailureJson, createRpcFailureCases } from "../testing"
import {
  BadRequestSchema,
  ErrorInfoSchema,
  RetryInfoSchema,
} from "./gen/google/rpc/error_details_pb"
import { StatusSchema } from "./gen/google/rpc/status_pb"
import { decodeRpcFailure } from "./rpc-details"
import { mapConnectError } from "./rpc-error"

describe("gokit committed wire corpus", () => {
  for (const fixture of wireFailures) {
    test(fixture.wire.name, () => {
      const status = fromBinary(StatusSchema, base64Decode(fixture.wire.grpcStatus))
      const details = status.details.map((detail) => ({
        type: detail.typeUrl.slice(detail.typeUrl.lastIndexOf("/") + 1),
        value: detail.value,
      }))
      const expected = {
        ...decodeFailure(fixture.wire.vocabulary),
        ...("retryAfterMs" in fixture.wire.vocabulary
          ? { retryAfterMs: fixture.wire.vocabulary.retryAfterMs }
          : {}),
      }
      expect(decodeRpcFailure(status.code, status.message, details)).toEqual(expected)
      const json = fixture.wire.connectJson
      const error = new ConnectError(json.message, status.code)
      error.details = json.details.map((detail) => ({
        type: detail.type,
        value: base64Decode(detail.value),
      }))
      expect(mapConnectError(error)).toMatchObject(expected)
    })
  }
})

test.each(createRpcFailureCases())("published adversarial case: $name", ({ error, expected }) => {
  const json = connectFailureJson(error)
  const incoming = new ConnectError(json.message, error.code)
  incoming.details = json.details.map((detail) => ({
    type: detail.type,
    value: base64Decode(detail.value),
  }))
  expect(mapConnectError(incoming)).toMatchObject(expected)
})

test.each([
  { seconds: -1n },
  { seconds: 315_576_000_001n },
  { seconds: 1n, nanos: -1 },
  { nanos: 1_000_000_000 },
])("invalid RetryInfo duration is operational: %#", (retryDelay) => {
  expect(() =>
    decodeRpcFailure(Code.Unavailable, "Unavailable", [
      { desc: RetryInfoSchema, value: { retryDelay } },
    ]),
  ).toThrow(FailureDecodeError)
})

test("duplicate recognized details fail closed", () => {
  const detail = { desc: RetryInfoSchema, value: { retryDelay: { seconds: 1n } } }
  expect(() => decodeRpcFailure(Code.Unavailable, "Unavailable", [detail, detail])).toThrow(
    FailureDecodeError,
  )
})

test("terminal authentication ignores retry permission and delay", () => {
  const error = mapConnectError(
    new ConnectError("Sign in", Code.Unauthenticated, undefined, [
      {
        desc: ErrorInfoSchema,
        value: {
          domain: "gokit.dev",
          reason: "UNAUTHORIZED",
          metadata: { retryable: "true" },
        },
      },
      { desc: RetryInfoSchema, value: { retryDelay: { seconds: 1n } } },
    ]),
  )
  expect(error).toMatchObject({
    code: "UNAUTHORIZED",
    retryable: false,
    retryAfterMs: undefined,
    authentication: "unauthenticated",
  })
})

test("explicit false wins over a reordered standard hint", () => {
  const info = create(ErrorInfoSchema, {
    domain: "gokit.dev",
    reason: "SERVICE_UNAVAILABLE",
    metadata: { retryable: "false" },
  })
  const retry = create(RetryInfoSchema, { retryDelay: { seconds: 60n } })
  const details = [
    { type: ErrorInfoSchema.typeName, value: toBinary(ErrorInfoSchema, info) },
    { type: RetryInfoSchema.typeName, value: toBinary(RetryInfoSchema, retry) },
  ]
  for (const ordered of [details, [...details].reverse()]) {
    expect(decodeRpcFailure(Code.Unavailable, "Unavailable", ordered)).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      retryable: false,
      retryAfterMs: undefined,
    })
  }
})

test.each([
  { domain: "foreign.example", reason: "NOT_FOUND" },
  { domain: "gokit.dev", reason: "FUTURE_CODE" },
])("preserves protocol identity for $domain/$reason", (identity) => {
  const error = mapConnectError(
    new ConnectError("External", Code.PermissionDenied, undefined, [
      { desc: ErrorInfoSchema, value: identity },
    ]),
  )
  expect(error).toMatchObject({ code: "FORBIDDEN", rawCode: Code.PermissionDenied })
})

test("malformed known details are operational failures", () => {
  expect(() =>
    decodeRpcFailure(Code.InvalidArgument, "bad", [
      { type: BadRequestSchema.typeName, value: new Uint8Array([255]) },
    ]),
  ).toThrow(FailureDecodeError)
})

test("contradictory identity and missing retry verdict fail closed", () => {
  for (const value of [
    { domain: "gokit.dev", reason: "NOT_FOUND", metadata: { retryable: "false" } },
    { domain: "gokit.dev", reason: "INVALID_INPUT" },
  ]) {
    expect(() =>
      decodeRpcFailure(Code.InvalidArgument, "bad", [{ desc: ErrorInfoSchema, value }]),
    ).toThrow(FailureDecodeError)
  }
})
