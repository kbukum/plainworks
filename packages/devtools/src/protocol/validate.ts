import { err, hasProperty, isNonEmptyString, isRecord, ok, type Result } from "@plainworks/std"
import { isJson } from "../privacy"
import { ProtocolError } from "./error"
import type { DevtoolsMessage, DevtoolsRequest, MessageEnvelope, RequestEnvelope } from "./message"
import { isSeverity } from "./severity"
import { isCompatibleProtocol } from "./version"

/**
 * Validate an inbound host-to-client frame before the client acts on it. A wrong version or a
 * malformed shape is refused with a typed error; unknown *fields* on a known message are tolerated
 * so a future minor addition degrades safely rather than breaking an older peer.
 */
export function validateMessageEnvelope(value: unknown): Result<MessageEnvelope, ProtocolError> {
  const opened = openEnvelope(value, "message")
  if (!opened.ok) return opened
  const message = opened.value
  const checked = checkMessage(message)
  if (!checked.ok) return checked
  return ok({
    protocol: Number((value as { protocol: number }).protocol),
    message: checked.value as DevtoolsMessage,
  })
}

/**
 * Validate an inbound client-to-host frame before the host acts on it, with the same version and
 * shape guarantees as {@link validateMessageEnvelope}.
 */
export function validateRequestEnvelope(value: unknown): Result<RequestEnvelope, ProtocolError> {
  const opened = openEnvelope(value, "request")
  if (!opened.ok) return opened
  const request = opened.value
  const checked = checkRequest(request)
  if (!checked.ok) return checked
  return ok({
    protocol: Number((value as { protocol: number }).protocol),
    request: checked.value as DevtoolsRequest,
  })
}

function openEnvelope(
  value: unknown,
  slot: "message" | "request",
): Result<Record<string, unknown>, ProtocolError> {
  if (!isRecord(value)) return malformed(slot, "Envelope must be an object.")
  if (!isCompatibleProtocol(value.protocol)) {
    return err(
      new ProtocolError(
        "devtools/protocol-incompatible",
        `Unsupported protocol version: ${String(value.protocol)}.`,
        { cause: value.protocol },
      ),
    )
  }
  const payload = value[slot]
  if (!isRecord(payload) || !isNonEmptyString(payload.type)) {
    return malformed(slot, `Envelope ${slot} must be a typed object.`)
  }
  return ok(payload)
}

function checkMessage(
  message: Record<string, unknown>,
): Result<Record<string, unknown>, ProtocolError> {
  switch (message.type) {
    case "disposed":
      return ok(message)
    case "source-added":
      return requireSourceDescriptor(message)
    case "source-removed":
      return requireSourceId(message, "message")
    case "source-recovered":
      return requireSourceId(message, "message")
    case "source-failed":
      return requireAll(message, [
        () => requireSourceId(message, "message"),
        () => requireErrorSnapshot(message, "error", "message"),
      ])
    case "event":
      return requireAll(message, [
        () => requireSourceId(message, "message"),
        () => requirePositiveInteger(message, "seq", "message"),
        () => requireEvent(message),
      ])
    case "indicator":
      return requireAll(message, [
        () => requireSourceId(message, "message"),
        () => requireIndicator(message),
      ])
    case "dropped":
      return requireAll(message, [
        () => requireNullableSourceId(message, "message"),
        () => requireNonNegativeInteger(message, "count", "message"),
      ])
    case "detail-result":
      return requireResult(message, true)
    case "command-result":
      return requireResult(message, false)
    default:
      return malformed("message", `Unknown message type: ${String(message.type)}.`)
  }
}

function checkRequest(
  request: Record<string, unknown>,
): Result<Record<string, unknown>, ProtocolError> {
  switch (request.type) {
    case "cancel":
      return requireNonEmptyString(request, "requestId", "request")
    case "detail-request":
      return requireAll(request, [
        () => requireNonEmptyString(request, "requestId", "request"),
        () => requireSourceId(request, "request"),
        () => requireNonEmptyString(request, "ref", "request"),
      ])
    case "command-request":
      return requireAll(request, [
        () => requireNonEmptyString(request, "requestId", "request"),
        () => requireSourceId(request, "request"),
        () => requireNonEmptyString(request, "commandId", "request"),
        () => requireJson(request, "input", "request"),
      ])
    default:
      return malformed("request", `Unknown request type: ${String(request.type)}.`)
  }
}

function requireAll<T>(
  value: T,
  checks: readonly (() => Result<unknown, ProtocolError>)[],
): Result<T, ProtocolError> {
  for (const check of checks) {
    const result = check()
    if (!result.ok) return result
  }
  return ok(value)
}

function requireSourceId<T extends Record<string, unknown>>(
  value: T,
  slot: "message" | "request",
): Result<T, ProtocolError> {
  if (isSourceId(value.id)) return ok(value)
  return malformed(slot, "Invalid source id.")
}

function requireNullableSourceId<T extends Record<string, unknown>>(
  value: T,
  slot: "message" | "request",
): Result<T, ProtocolError> {
  if (value.id === null || isSourceId(value.id)) return ok(value)
  return malformed(slot, "Invalid source id.")
}

function isSourceId(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.kind) && isNonEmptyString(value.instance)
}

function requireSourceDescriptor<T extends Record<string, unknown>>(
  value: T,
): Result<T, ProtocolError> {
  const source = value.source
  if (
    !isRecord(source) ||
    !isSourceId(source.id) ||
    !isNonEmptyString(source.label) ||
    !Array.isArray(source.commands) ||
    !source.commands.every(isCommandDescriptor)
  ) {
    return malformed("message", "Invalid source descriptor.")
  }
  return ok(value)
}

function isCommandDescriptor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.label) &&
    (value.risk === "safe" || value.risk === "mutating" || value.risk === "destructive") &&
    typeof value.available === "boolean"
  )
}

function requireEvent<T extends Record<string, unknown>>(value: T): Result<T, ProtocolError> {
  const event = value.event
  if (
    !isRecord(event) ||
    !isNonEmptyString(event.kind) ||
    !isNonEmptyString(event.label) ||
    !isSeverity(event.severity) ||
    !isFiniteNumber(event.at) ||
    (hasProperty(event, "summary") && !isJson(event.summary)) ||
    (hasProperty(event, "detail") && !isNonEmptyString(event.detail))
  ) {
    return malformed("message", "Invalid source event.")
  }
  return ok(value)
}

function requireIndicator<T extends Record<string, unknown>>(value: T): Result<T, ProtocolError> {
  const indicator = value.indicator
  if (
    !isRecord(indicator) ||
    !isNonEmptyString(indicator.id) ||
    !isNonEmptyString(indicator.label) ||
    typeof indicator.value !== "string" ||
    !isSeverity(indicator.severity) ||
    !isFiniteNumber(indicator.updatedAt) ||
    (hasProperty(indicator, "target") && !isNonEmptyString(indicator.target))
  ) {
    return malformed("message", "Invalid status indicator.")
  }
  return ok(value)
}

function requireResult<T extends Record<string, unknown>>(
  value: T,
  detail: boolean,
): Result<T, ProtocolError> {
  const common = requireAll(value, [
    () => requireNonEmptyString(value, "requestId", "message"),
    () => requireBoolean(value, "ok", "message"),
  ])
  if (!common.ok) return common
  if (value.ok === false) return requireErrorSnapshot(value, "error", "message")
  if (value.ok !== true) return malformed("message", "Invalid request result.")
  const payload = requireJson(value, "value", "message")
  if (!payload.ok || !detail) return payload
  return requireNonNegativeInteger(value, "seq", "message")
}

function requireErrorSnapshot<T extends Record<string, unknown>>(
  value: T,
  key: string,
  slot: "message" | "request",
): Result<T, ProtocolError> {
  const snapshot = value[key]
  if (
    isRecord(snapshot) &&
    hasProperty(snapshot, "name") &&
    hasProperty(snapshot, "message") &&
    isJson(snapshot)
  ) {
    return ok(value)
  }
  return malformed(slot, `Field '${key}' must be a serializable error snapshot.`)
}

function requirePositiveInteger<T extends Record<string, unknown>>(
  value: T,
  key: string,
  slot: "message" | "request",
): Result<T, ProtocolError> {
  const candidate = value[key]
  return typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0
    ? ok(value)
    : malformed(slot, `Field '${key}' must be a positive integer.`)
}

function requireNonNegativeInteger<T extends Record<string, unknown>>(
  value: T,
  key: string,
  slot: "message" | "request",
): Result<T, ProtocolError> {
  const candidate = value[key]
  return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0
    ? ok(value)
    : malformed(slot, `Field '${key}' must be a non-negative integer.`)
}

function requireNonEmptyString<T extends Record<string, unknown>>(
  value: T,
  key: string,
  slot: "message" | "request",
): Result<T, ProtocolError> {
  return isNonEmptyString(value[key])
    ? ok(value)
    : malformed(slot, `Field '${key}' must be a non-empty string.`)
}

function requireJson<T extends Record<string, unknown>>(
  value: T,
  key: string,
  slot: "message" | "request",
): Result<T, ProtocolError> {
  return hasProperty(value, key) && isJson(value[key])
    ? ok(value)
    : malformed(slot, `Field '${key}' must be serializable.`)
}

function requireBoolean<T extends Record<string, unknown>>(
  value: T,
  key: string,
  slot: "message" | "request",
): Result<T, ProtocolError> {
  return typeof value[key] === "boolean"
    ? ok(value)
    : malformed(slot, `Field '${key}' must be a boolean.`)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function malformed(slot: "message" | "request", reason: string): Result<never, ProtocolError> {
  const kind = slot === "message" ? "devtools/message-malformed" : "devtools/request-malformed"
  return err(new ProtocolError(kind, reason))
}
