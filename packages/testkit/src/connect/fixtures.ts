import { create } from "@bufbuild/protobuf"
import {
  type CountRequest,
  CountRequestSchema,
  type CountResponse,
  CountResponseSchema,
  type EchoRequest,
  EchoRequestSchema,
  type EchoResponse,
  EchoResponseSchema,
  EchoService,
} from "./gen/plainworks/testkit/v1/echo_pb"

export type { CountRequest, CountResponse, EchoRequest, EchoResponse }
/**
 * The canonical Connect fixture: a small `EchoService` with an idempotent unary `echo` (safe to
 * retry), a write unary `mutate` (never auto-retried), and a server-streaming `count` (never
 * retried; bounded by the resilience interceptor's idle timeout). Generated from
 * `proto/plainworks/testkit/v1/echo.proto` with `bun run gen:proto`;
 * `@plainworks/connect` and every request/response protocol test imports it from here so there is
 * one shared, editable schema instead of a hand-embedded descriptor.
 */
export {
  CountRequestSchema,
  CountResponseSchema,
  EchoRequestSchema,
  EchoResponseSchema,
  EchoService,
}

/** Build a typed `EchoRequest` message. */
export function echoRequest(message: string): EchoRequest {
  return create(EchoRequestSchema, { message })
}

/** Build a typed `EchoResponse` message. */
export function echoResponse(message: string): EchoResponse {
  return create(EchoResponseSchema, { message })
}

/** Build a typed `CountRequest` message. */
export function countRequest(count: number): CountRequest {
  return create(CountRequestSchema, { count })
}

/** Build a typed `CountResponse` message. */
export function countResponse(value: number): CountResponse {
  return create(CountResponseSchema, { value })
}
