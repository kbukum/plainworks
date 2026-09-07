/**
 * Self-contained structural types for the universal Web-platform surface every target runtime shares (Node 18+, Deno, edge, browser, worker). They are declared here — not pulled from the DOM or `@types/node` libs — so a host-independent package can name `fetch`/`Headers`/`Response`/`URL` in its public API and ship a `.d.ts` that typechecks standalone against ES-only libs, without forcing a consumer to install DOM or Node types or leaking host-only globals (`window`, `self`, `caches`) past the "assume no host" boundary.
 *
 * Only the members the kit actually uses are declared; the shapes are structural, so a real platform `Headers`/`Response`/`URL` (from the DOM lib or `@types/node`) satisfies them by duck typing. The repo-only ambient value shim (`types/universal-web.d.ts`) binds the matching runtime globals to these same types, keeping one source of truth. Extend only with APIs that are genuinely universal.
 */

/**
 * The subset of `AbortSignal` the kit reads: its aborted state, reason, `throwIfAborted`, and event
 * wiring. Every member is present on the platform `AbortSignal` across all target runtimes, so a real
 * signal satisfies it structurally; `throwIfAborted` is included so a caller passed one of these
 * signals (e.g. the operation signal from {@link withTimeout}) can still guard with it, exactly as a
 * native signal allows.
 */
export interface WebAbortSignal {
  readonly aborted: boolean
  readonly reason: unknown
  throwIfAborted(): void
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: string, listener: () => void): void
}

/** The `AbortController` surface the kit constructs to drive timeouts, deadlines, and cancellation. */
export interface WebAbortController {
  readonly signal: WebAbortSignal
  abort(reason?: unknown): void
}

/** Accepted initializers for a {@link WebHeaders} instance. */
export type WebHeadersInit =
  | readonly (readonly [string, string])[]
  | Record<string, string>
  | WebHeaders

/** The `Headers` surface the kit builds, merges, and reads for a request/response. */
export interface WebHeaders {
  append(name: string, value: string): void
  delete(name: string): void
  get(name: string): string | null
  has(name: string): boolean
  set(name: string, value: string): void
  forEach(callback: (value: string, key: string, parent: WebHeaders) => void): void
  entries(): IterableIterator<[string, string]>
  keys(): IterableIterator<string>
  values(): IterableIterator<string>
  [Symbol.iterator](): IterableIterator<[string, string]>
}

/** The request/response body payloads the kit sends: text, binary, or encoded form data. */
// `ArrayBufferView<ArrayBuffer>` (not a bare `ArrayBufferView`) pins the backing buffer to a plain
// `ArrayBuffer`, excluding `SharedArrayBuffer`-backed views — which the kit never sends and whose
// `[Symbol.toStringTag]` mismatch would otherwise widen the seam past the platform `BodyInit`.
export type WebBodyInit = string | ArrayBuffer | ArrayBufferView<ArrayBuffer> | WebURLSearchParams

/** The `fetch` init the kit passes: method, headers, body, and cancellation signal. */
export interface WebRequestInit {
  method?: string
  headers?: WebHeadersInit
  body?: WebBodyInit | null
  signal?: WebAbortSignal | null
}

/** The `Response` init the kit uses to build a synthetic response. */
export interface WebResponseInit {
  status?: number
  statusText?: string
  headers?: WebHeadersInit
}

/** The `Response` surface the kit reads: status, headers, final URL, and a streamed body. */
export interface WebResponse {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly headers: WebHeaders
  readonly url: string
  readonly redirected: boolean
  readonly bodyUsed: boolean
  readonly body: WebReadableStream<Uint8Array> | null
  clone(): WebResponse
  arrayBuffer(): Promise<ArrayBuffer>
  json(): Promise<unknown>
  text(): Promise<string>
}

/**
 * The `ReadableStreamDefaultReader` members a bounded body reader uses to pull and cancel bytes. The
 * done result's `value` is optional (`value?: undefined`) to mirror the platform reader exactly, so a
 * native `ReadableStreamDefaultReader` is structurally assignable.
 */
export interface WebReadableStreamDefaultReader<R = unknown> {
  read(): Promise<{ done: false; value: R } | { done: true; value?: undefined }>
  cancel(reason?: unknown): Promise<void>
  releaseLock(): void
}

/**
 * The byte-stream surface of `Response.body`: acquire a default reader or cancel the whole stream.
 * The kit only ever calls `getReader()` with no argument; a real platform stream (whose `getReader`
 * is overloaded) satisfies this single call signature by duck typing.
 */
export interface WebReadableStream<R = unknown> {
  getReader(): WebReadableStreamDefaultReader<R>
  cancel(reason?: unknown): Promise<void>
}

/** The `TextDecoder` surface used to turn bounded byte chunks into a string without buffering the whole body. */
export interface WebTextDecoder {
  decode(input?: ArrayBufferView | ArrayBuffer, options?: { readonly stream?: boolean }): string
}

/** The `URLSearchParams` surface the kit builds and serializes for query strings. */
export interface WebURLSearchParams {
  /** Number of parameter entries — present on the platform `URLSearchParams` across all targets. */
  readonly size: number
  append(name: string, value: string): void
  delete(name: string): void
  get(name: string): string | null
  getAll(name: string): string[]
  has(name: string): boolean
  set(name: string, value: string): void
  sort(): void
  forEach(callback: (value: string, key: string, parent: WebURLSearchParams) => void): void
  entries(): IterableIterator<[string, string]>
  keys(): IterableIterator<string>
  values(): IterableIterator<string>
  toString(): string
  [Symbol.iterator](): IterableIterator<[string, string]>
}

/** The `URL` surface the kit parses, inspects, and anchors request paths against. */
export interface WebURL {
  hash: string
  host: string
  hostname: string
  href: string
  readonly origin: string
  password: string
  pathname: string
  port: string
  protocol: string
  search: string
  readonly searchParams: WebURLSearchParams
  username: string
  toString(): string
  toJSON(): string
}

/** The universal `fetch` call signature the kit depends on. */
export type WebFetch = (input: string | WebURL, init?: WebRequestInit) => Promise<WebResponse>
