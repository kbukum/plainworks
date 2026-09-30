import { readBoundedText, type WebRequest, type WebURLSearchParams } from "@plainworks/std/web"

/** The default cap for a BFF form body (16 KiB): a CSRF token and a return path fit easily. */
export const DEFAULT_FORM_BODY_BYTES: number = 16 * 1024

/** Options for {@link readFormBody}. */
export interface ReadFormBodyOptions {
  /** The most bytes to read. Defaults to {@link DEFAULT_FORM_BODY_BYTES}. */
  readonly maxBytes?: number
}

/**
 * Read a URL-encoded form body with a byte cap, before any CSRF or session work runs. Reading
 * stops when the client disconnects.
 *
 * @throws {PayloadTooLargeError} When the body passes the cap. Answer with `413`.
 * @throws {AbortError} When the request's signal aborts.
 */
export async function readFormBody(
  request: Pick<WebRequest, "body" | "signal">,
  options: ReadFormBodyOptions = {},
): Promise<WebURLSearchParams> {
  const text = await readBoundedText(request.body, {
    maxBytes: options.maxBytes ?? DEFAULT_FORM_BODY_BYTES,
    signal: request.signal,
  })
  return new URLSearchParams(text)
}
