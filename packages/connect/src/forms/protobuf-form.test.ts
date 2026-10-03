import { toJson } from "@bufbuild/protobuf"
import { FailureDecodeError } from "@plainworks/std/failure"
import {
  BrokenRuleInputSchema,
  EditionsPresenceInputSchema,
  ProfileInputSchema,
  ProfileMode,
  Proto2PresenceInputSchema,
} from "@plainworks/testkit/connect"
import { expect, test } from "vitest"
import { createProtobufForm } from "./protobuf-form"

test("decodes form controls using JSON names and the real message descriptor", async () => {
  const schema = createProtobufForm(ProfileInputSchema)
  const result = await schema["~standard"].validate({
    label: "Ada",
    minimum: "2",
    maximum: "10",
    age: "",
    mode: "PROFILE_MODE_ACTIVE",
    scheduledAt: "2026-10-03T12:00:00Z",
    tags: ["a", "b"],
    "addresses[0].zip": "10001",
    "primaryAddress.zip": "90210",
    nickname: "",
  })
  expect(result).toMatchObject({
    value: {
      $typeName: ProfileInputSchema.typeName,
      displayName: "Ada",
      minimum: 2,
      maximum: 10,
      mode: ProfileMode.ACTIVE,
      tags: ["a", "b"],
      nickname: "",
      addresses: [{ postalCode: "10001" }],
      primaryAddress: { postalCode: "90210" },
      scheduledAt: { seconds: 1791028800n },
    },
  })
  if ("value" in result) expect(result.value).not.toHaveProperty("age")
})

test("binds custom, nested, repeated and empty protobuf paths without casing guesses", () => {
  const schema = createProtobufForm(ProfileInputSchema)
  expect(schema.fieldName?.("display_name", "protobuf")).toBe("label")
  expect(schema.fieldName?.("addresses[0].postal_code", "protobuf")).toBe("addresses[0].zip")
  expect(schema.fieldName?.("primary_address.postal_code", "protobuf")).toBe("primaryAddress.zip")
  expect(schema.fieldName?.("", "protobuf")).toBe("")
  expect(schema.fieldName?.("addresses[0].zip", "json")).toBe("addresses[0].zip")
  expect(() => schema.fieldName?.("missing", "protobuf")).toThrow(FailureDecodeError)
})

test("real Protovalidate returns semantic local and cross-field violations", async () => {
  const result = await createProtobufForm(ProfileInputSchema)["~standard"].validate({
    label: "",
    minimum: "10",
    maximum: "2",
    "addresses[0].zip": "",
  })
  expect(result).toMatchObject({
    issues: expect.arrayContaining([
      { path: ["label"], reason: "OUT_OF_RANGE", message: expect.any(String) },
      { path: ["addresses[0].zip"], reason: "OUT_OF_RANGE", message: expect.any(String) },
      { path: [], reason: "INVALID_VALUE", message: "Minimum must not exceed maximum" },
    ]),
  })
})

test("bad numeric input is a field error, while a broken validator is operational", async () => {
  const result = await createProtobufForm(ProfileInputSchema)["~standard"].validate({
    label: "Ada",
    minimum: "not a number",
    maximum: "2",
  })

  expect(result).toMatchObject({
    issues: [{ path: ["minimum"], reason: "INVALID_FORMAT", message: expect.any(String) }],
  })
  expect(() => createProtobufForm(BrokenRuleInputSchema)["~standard"].validate({})).toThrow(
    FailureDecodeError,
  )
})

test("preserves optional zero and numeric enum input", async () => {
  const result = await createProtobufForm(ProfileInputSchema)["~standard"].validate({
    label: "Ada",
    age: "0",
    mode: "1",
    scores: ["1", "2"],
    modes: ["1", "PROFILE_MODE_ACTIVE"],
  })
  expect(result).toMatchObject({
    value: {
      age: 0,
      mode: ProfileMode.ACTIVE,
      scores: [1, 2],
      modes: [ProfileMode.ACTIVE, ProfileMode.ACTIVE],
    },
  })
})

test.each([Proto2PresenceInputSchema, EditionsPresenceInputSchema])(
  "blank optional numbers preserve absence for $typeName",
  async (descriptor) => {
    const schema = createProtobufForm(descriptor)
    const omitted = await schema["~standard"].validate({ requiredCount: "1" })
    const blank = await schema["~standard"].validate({ requiredCount: "1", count: "" })
    expect(blank).toEqual(omitted)
    expect(blank).toHaveProperty("value")
    if ("value" in blank) expect(toJson(descriptor, blank.value)).not.toHaveProperty("count")
    const zero = await schema["~standard"].validate({ requiredCount: "1", count: "0" })
    expect(zero).toMatchObject({ value: { count: 0, requiredCount: 1 } })
    if ("value" in zero) expect(toJson(descriptor, zero.value)).toHaveProperty("count", 0)
    expect(await schema["~standard"].validate({ requiredCount: "" })).toMatchObject({
      issues: [{ path: ["requiredCount"], reason: "INVALID_FORMAT" }],
    })
  },
)

test("blank implicit-presence numbers remain invalid input", async () => {
  const result = await createProtobufForm(EditionsPresenceInputSchema)["~standard"].validate({
    requiredCount: "1",
    implicitCount: "",
  })
  expect(result).toMatchObject({
    issues: [{ path: ["implicitCount"], reason: "INVALID_FORMAT" }],
  })
})

test.each([
  { "addresses[1].zip": "12345" },
  { "addresses[99999999999999999999].zip": "12345" },
  { label: ["a", "b"] },
  { tags: Array.from({ length: 1001 }, () => "a") },
  { unknown: "value" },
  { age: "2147483648" },
  { scheduledAt: "invalid" },
  { addresses: "invalid" },
  { label: "Ada", email: "ada@example.test", phone: "1234" },
])("invalid or oversized controls fail validation: %#", async (input) => {
  const result = await createProtobufForm(ProfileInputSchema)["~standard"].validate(input)
  expect(result).toHaveProperty("issues")
})

test("nested boolean parse errors retain their full control path", async () => {
  const result = await createProtobufForm(ProfileInputSchema)["~standard"].validate({
    label: "Ada",
    "addresses[0].zip": "10001",
    "addresses[0].preferred": "invalid",
  })
  expect(result).toMatchObject({ issues: [{ path: ["addresses[0].preferred"] }] })
})
