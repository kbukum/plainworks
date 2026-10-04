import { isErr, isRecord } from "@plainworks/std"
import { isJson, stringifyJson, utf8ByteLength } from "@plainworks/std/encoding"
import { type StandardSchemaV1, validateWithSchema } from "@plainworks/std/seam"
import { AuthError } from "../../errors"
import type { StoredLogin, StoredSession } from "./seam"

const limits = { maxDepth: 32, maxNodes: 8192, maxBytes: 65_536 } as const

function reference(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128
}

export function encodeSessionRecord(value: unknown): string {
  if (!isJson(value, limits)) {
    throw new AuthError("auth/session-invalid", "session record must be bounded, lossless JSON")
  }
  return stringifyJson(value)
}

function decodeRecord(raw: string): Record<string, unknown> {
  try {
    if (raw.length > limits.maxBytes || utf8ByteLength(raw) > limits.maxBytes) {
      throw new AuthError("auth/session-invalid", "persisted record exceeds its size limit")
    }
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || !isJson(value, limits)) {
      throw new AuthError("auth/session-invalid", "invalid persisted record")
    }
    return value
  } catch (cause) {
    if (cause instanceof AuthError) throw cause
    throw new AuthError("auth/session-invalid", "invalid persisted JSON", { cause })
  }
}

export function decodeSessionMetadata(raw: string): StoredSession<unknown> {
  const record = decodeRecord(raw)
  if (
    !reference(record.reference) ||
    typeof record.expiresAt !== "number" ||
    !Number.isSafeInteger(record.expiresAt) ||
    (record.providerHandle !== undefined && !reference(record.providerHandle))
  ) {
    throw new AuthError("auth/session-invalid", "invalid persisted session metadata")
  }
  return {
    reference: record.reference,
    value: record.value,
    expiresAt: record.expiresAt,
    ...(record.providerHandle === undefined ? {} : { providerHandle: record.providerHandle }),
  }
}

export async function decodeSessionRecord<Value>(
  raw: string,
  schema: StandardSchemaV1<unknown, Value>,
): Promise<StoredSession<Value>> {
  const record = decodeSessionMetadata(raw)
  const checked = await validateWithSchema(schema, record.value)
  if (isErr(checked) || !isJson(checked.value, limits)) {
    throw new AuthError("auth/session-invalid", "invalid persisted session value")
  }
  return { ...record, value: checked.value }
}

export function decodeLoginRecord(raw: string): StoredLogin {
  const record = decodeRecord(raw)
  if (
    !reference(record.reference) ||
    typeof record.transaction !== "string" ||
    record.transaction.length === 0 ||
    typeof record.returnTo !== "string" ||
    record.returnTo.length > 2048 ||
    (record.previous !== undefined && !reference(record.previous)) ||
    typeof record.expiresAt !== "number" ||
    !Number.isSafeInteger(record.expiresAt)
  ) {
    throw new AuthError("auth/login-transaction", "invalid persisted login")
  }
  return {
    reference: record.reference,
    transaction: record.transaction,
    returnTo: record.returnTo,
    expiresAt: record.expiresAt,
    ...(record.previous === undefined ? {} : { previous: record.previous }),
  }
}
