import {
  create,
  type DescMessage,
  type DescMethodUnary,
  fromJson,
  type JsonValue,
  type MessageInitShape,
  type MessageShape,
  toJson,
} from "@bufbuild/protobuf"
import { BinaryWriter, base64Encode, WireType } from "@bufbuild/protobuf/wire"
import { isPositiveInteger } from "@plainworks/std"
import { type FailureCode, httpStatusFor, isFailureCode } from "@plainworks/std/failure"
import { PayloadTooLargeError, readBoundedBytes } from "@plainworks/std/web"
import { type HttpHandler, HttpResponse, http } from "msw"

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024

export interface ConnectUnaryOptions {
  /** Contract check for the decoded input and the handler's output; `undefined` means valid. */
  readonly validate?: (schema: DescMessage, message: unknown) => string | undefined
  /** Runs before the body is read; a returned response (denial, outage) answers the call. */
  readonly gate?: (request: Request) => Response | undefined
  /** Largest accepted request body, a positive safe integer. Defaults to 1 MiB. */
  readonly maxBodyBytes?: number
}

type UnaryResult<O extends DescMessage> = MessageInitShape<O> | Response

/**
 * An MSW handler for one Connect unary method over the JSON codec. It decodes and validates the
 * input, runs `handle`, and validates the output so that a fixture that drifts from the contract
 * fails loudly instead of reaching the client.
 *
 * @throws {RangeError} When `maxBodyBytes` is not a positive safe integer.
 */
export function connectUnary<I extends DescMessage, O extends DescMessage>(
  method: DescMethodUnary<I, O>,
  handle: (input: MessageShape<I>, request: Request) => UnaryResult<O> | Promise<UnaryResult<O>>,
  options: ConnectUnaryOptions = {},
): HttpHandler {
  const { validate, gate, maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = options
  if (!isPositiveInteger(maxBodyBytes)) {
    throw new RangeError("connectUnary: maxBodyBytes must be a positive safe integer")
  }
  return http.post(`*/${method.parent.typeName}/${method.name}`, async ({ request }) => {
    const gated = gate?.(request)
    if (gated !== undefined) return gated
    const body = await readBounded(request, maxBodyBytes)
    if (body === undefined) {
      return connectFailure("resource_exhausted", { message: "The request body is too large." })
    }
    let input: MessageShape<I>
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(body)
      input = fromJson(method.input, JSON.parse(text) as JsonValue)
    } catch {
      return connectFailure("invalid_argument", {
        message: `The request body is not valid JSON for ${method.input.typeName}.`,
      })
    }
    const invalid = validate?.(method.input, input)
    if (invalid !== undefined) {
      return connectFailure("invalid_argument", {
        message: `The request is not valid ${method.input.typeName}: ${invalid}`,
      })
    }
    const result = await handle(input, request)
    if (result instanceof Response) return result
    const output = create(method.output, result)
    const drift = validate?.(method.output, output)
    if (drift !== undefined) {
      return connectFailure("internal", {
        message: `Mock fixture drift in ${method.parent.typeName}/${method.name}: ${drift}`,
      })
    }
    return HttpResponse.json(toJson(method.output, output))
  })
}

/** The standard `google.rpc` details a {@link connectFailure} carries. */
export interface ConnectFailureOptions {
  /** Defaults to a generic message naming the code. */
  readonly message?: string
  /** One `google.rpc.ErrorInfo`: the machine-readable cause, its domain and string metadata. */
  readonly errorInfo?: {
    readonly reason: string
    readonly domain: string
    readonly metadata?: Readonly<Record<string, string>>
  }
  /** `google.rpc.BadRequest` field violations. */
  readonly violations?: readonly {
    readonly field: string
    readonly description: string
    readonly reason?: string
  }[]
  /** `google.rpc.RetryInfo` delay, a non-negative integer of milliseconds. */
  readonly retryAfterMs?: number
}

/**
 * A Connect unary error response for `code`: its HTTP status, Connect JSON body, and the requested
 * standard `google.rpc` details, binary encoded as the Connect protocol carries them.
 *
 * @throws {RangeError} When `code` is not a canonical code, a detail is empty, or `retryAfterMs`
 * is not a non-negative safe integer.
 */
export function connectFailure(code: FailureCode, options: ConnectFailureOptions = {}): Response {
  if (!isFailureCode(code)) {
    throw new RangeError(`connectFailure: ${JSON.stringify(code)} is not an error code`)
  }
  const { message = `The request failed: ${code}.`, errorInfo, violations, retryAfterMs } = options
  const details: { type: string; value: string }[] = []
  if (errorInfo !== undefined) {
    if (errorInfo.reason === "" || errorInfo.domain === "") {
      throw new RangeError("connectFailure: ErrorInfo needs a reason and a domain")
    }
    details.push(detail("google.rpc.ErrorInfo", encodeErrorInfo(errorInfo)))
  }
  if (violations !== undefined && violations.length > 0) {
    details.push(detail("google.rpc.BadRequest", encodeBadRequest(violations)))
  }
  if (retryAfterMs !== undefined) {
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0) {
      throw new RangeError("connectFailure: retryAfterMs must be a non-negative safe integer")
    }
    details.push(detail("google.rpc.RetryInfo", encodeRetryInfo(retryAfterMs)))
  }
  return HttpResponse.json(
    { code, message, ...(details.length === 0 ? {} : { details }) },
    { status: httpStatusFor(code) },
  )
}

function detail(type: string, bytes: Uint8Array) {
  return { type, value: base64Encode(bytes, "std_raw") }
}

// ErrorInfo: reason = 1, domain = 2, metadata (map<string, string>) = 3.
function encodeErrorInfo(info: NonNullable<ConnectFailureOptions["errorInfo"]>): Uint8Array {
  const writer = new BinaryWriter()
  writer.tag(1, WireType.LengthDelimited).string(info.reason)
  writer.tag(2, WireType.LengthDelimited).string(info.domain)
  for (const [key, value] of Object.entries(info.metadata ?? {}).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    writer.tag(3, WireType.LengthDelimited).fork()
    writer.tag(1, WireType.LengthDelimited).string(key)
    writer.tag(2, WireType.LengthDelimited).string(value)
    writer.join()
  }
  return writer.finish()
}

// BadRequest: field_violations = 1; FieldViolation: field = 1, description = 2, reason = 3.
function encodeBadRequest(violations: NonNullable<ConnectFailureOptions["violations"]>) {
  const writer = new BinaryWriter()
  for (const violation of violations) {
    writer.tag(1, WireType.LengthDelimited).fork()
    writer.tag(1, WireType.LengthDelimited).string(violation.field)
    writer.tag(2, WireType.LengthDelimited).string(violation.description)
    if (violation.reason !== undefined) {
      writer.tag(3, WireType.LengthDelimited).string(violation.reason)
    }
    writer.join()
  }
  return writer.finish()
}

// RetryInfo: retry_delay (google.protobuf.Duration) = 1; Duration: seconds = 1, nanos = 2.
function encodeRetryInfo(ms: number): Uint8Array {
  const writer = new BinaryWriter()
  writer.tag(1, WireType.LengthDelimited).fork()
  writer.tag(1, WireType.Varint).int64(Math.floor(ms / 1000))
  writer.tag(2, WireType.Varint).int32((ms % 1000) * 1_000_000)
  writer.join()
  return writer.finish()
}

async function readBounded(request: Request, limit: number): Promise<Uint8Array | undefined> {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN)
  if (Number.isFinite(declared) && declared > limit) return undefined
  try {
    return await readBoundedBytes(request.body, { maxBytes: limit, signal: request.signal })
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return undefined
    throw error
  }
}
