import type { WebAbortSignal, WebBodyInit, WebResponse } from "@plainworks/std"

/** An encoded request body plus the content type the codec serialized it as. */
export interface EncodedBody {
  readonly body: WebBodyInit
  readonly contentType: string
}

/**
 * The pluggable body encode/decode seam. JSON is the default ({@link jsonCodec}); a protocol that
 * speaks another format (or a future binary encoding) supplies its own codec without touching the
 * client, so the fetch plumbing is written once and the wire format slots in.
 *
 * Decoding stops at `unknown` on purpose: the wire is untrusted, so the codec never fabricates a
 * caller-chosen `T`. Producing a typed value is a separate, explicit step — the client runs an
 * injected Standard Schema validator (or the caller opts into an unchecked passthrough) at the
 * request boundary.
 */
export interface BodyCodec {
  /** Serialize a request body and report its content type. Throws a typed encode error on a non-serializable value. */
  encode(value: unknown): EncodedBody
  /**
   * Read and decode a response body into an untrusted `unknown`, or `undefined` for an
   * empty/no-content response. The body is read under `signal` — a bounded reader cancels the
   * stream when the caller's per-attempt timeout or cancellation fires, so a stalled body never
   * hangs the call or leaks a connection.
   */
  decode(response: WebResponse, signal?: WebAbortSignal): Promise<unknown>
}
