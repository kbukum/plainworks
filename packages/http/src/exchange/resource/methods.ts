import type { InferSchemaOutput, StandardSchemaV1 } from "@plainworks/std"
import { type HttpMethod, withIdempotencyKey } from "../../method"
import type { RequestInput } from "../request-input"
import type { HttpResponse } from "../response"
import type { ResourceReadOptions, ResourceWriteOptions } from "./options"

/** The low-level `request` a resource method delegates to; it always reads the decoded `data` back. */
type RequestFn = (input: RequestInput) => Promise<HttpResponse<unknown>>

/** Options as they arrive at the impl — the schema the public overloads type but the base omits, plus the resource-owned fields a wider-typed value may still carry at runtime so the mapping can strip them. */
type SendOptions = ResourceWriteOptions & {
  readonly schema?: StandardSchemaV1
  readonly idempotent?: boolean
}

/**
 * The five resource helpers over {@link RequestInput} — `get`/`post`/`put`/`patch`/`delete`.
 * Each resolves to the **decoded body**: with a `schema` the untrusted body is validated at the
 * boundary and its inferred type is returned; without one it resolves to `unknown`. An empty
 * (`204`) response resolves to `undefined`. Use these for the common "give me the data" case; reach
 * for `request` when you need the full response (status, headers, final URL) or a method without a
 * helper (`HEAD`, `OPTIONS`). `GET`/`PUT`/`DELETE` are idempotent and retried by the client policy
 * automatically; `POST`/`PATCH` retry only when a {@link ResourceWriteOptions.idempotencyKey} is
 * given.
 */
export interface ResourceMethods {
  get<S extends StandardSchemaV1>(
    path: string,
    options: ResourceReadOptions & { readonly schema: S },
  ): Promise<InferSchemaOutput<S> | undefined>
  get(path: string, options?: ResourceReadOptions): Promise<unknown>

  post<S extends StandardSchemaV1>(
    path: string,
    options: ResourceWriteOptions & { readonly schema: S },
  ): Promise<InferSchemaOutput<S> | undefined>
  post(path: string, options?: ResourceWriteOptions): Promise<unknown>

  put<S extends StandardSchemaV1>(
    path: string,
    options: ResourceWriteOptions & { readonly schema: S },
  ): Promise<InferSchemaOutput<S> | undefined>
  put(path: string, options?: ResourceWriteOptions): Promise<unknown>

  patch<S extends StandardSchemaV1>(
    path: string,
    options: ResourceWriteOptions & { readonly schema: S },
  ): Promise<InferSchemaOutput<S> | undefined>
  patch(path: string, options?: ResourceWriteOptions): Promise<unknown>

  delete<S extends StandardSchemaV1>(
    path: string,
    options: ResourceWriteOptions & { readonly schema: S },
  ): Promise<InferSchemaOutput<S> | undefined>
  delete(path: string, options?: ResourceWriteOptions): Promise<unknown>
}

/**
 * Build the resource methods bound to a client's `request`. Each method presets its HTTP method,
 * folds an optional idempotency key into the headers (and marks the write retry-eligible), and
 * returns the decoded body — adding ergonomics without duplicating any transport logic.
 */
export function createResourceMethods(request: RequestFn): ResourceMethods {
  async function send(method: HttpMethod, path: string, options?: SendOptions): Promise<unknown> {
    const response = await request(toRequestInput(method, path, options))
    return response.data
  }

  function get(path: string, options?: SendOptions): Promise<unknown> {
    return send("GET", path, options)
  }
  function post(path: string, options?: SendOptions): Promise<unknown> {
    return send("POST", path, options)
  }
  function put(path: string, options?: SendOptions): Promise<unknown> {
    return send("PUT", path, options)
  }
  function patch(path: string, options?: SendOptions): Promise<unknown> {
    return send("PATCH", path, options)
  }
  function remove(path: string, options?: SendOptions): Promise<unknown> {
    return send("DELETE", path, options)
  }

  return { get, post, put, patch, delete: remove }
}

/**
 * Map resource options onto a {@link RequestInput}. The idempotency key becomes the
 * `Idempotency-Key` header and flips the request to retry-eligible; every other forwardable field
 * is a `RequestInput` field and passes straight through, so query building, timeout, retry, and
 * schema validation stay owned by `request` and a new `RequestInput` field is forwarded without
 * touching this mapping. The fields the resource layer owns are destructured out instead of spread,
 * so a wider-typed options value cannot smuggle a body into a read or `idempotent: true` into a
 * write without an idempotency key.
 */
function toRequestInput(method: HttpMethod, path: string, options?: SendOptions): RequestInput {
  if (options === undefined) {
    return { method, path }
  }
  const { idempotencyKey, headers, idempotent: _idempotent, body, ...rest } = options
  const forwarded: RequestInput = { ...rest, method, path }
  const mergedHeaders =
    idempotencyKey !== undefined ? withIdempotencyKey(headers, idempotencyKey) : headers
  return {
    ...forwarded,
    ...(mergedHeaders !== undefined ? { headers: mergedHeaders } : {}),
    ...(method !== "GET" && body !== undefined ? { body } : {}),
    ...(idempotencyKey !== undefined ? { idempotent: true } : {}),
  }
}
