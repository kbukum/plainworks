import { boundMessage } from "./message"

/** What kind of runtime failure the page raised. */
export type RuntimeErrorKind = "pageerror" | "hydration" | "console" | "request"

/** One runtime failure observed while a test drove the page. */
export interface RuntimeError {
  readonly kind: RuntimeErrorKind
  readonly message: string
}

/** The console message fields the watcher reads. Playwright's `ConsoleMessage` satisfies it. */
export interface RuntimeConsoleMessage {
  type(): string
  text(): string
}

/** The routed request fields the watcher reads. Playwright's `Route` satisfies it. */
export interface RuntimeRoute {
  request(): { method(): string; url(): string }
  abort(errorCode?: string): Promise<void>
}

/** The page surface the watcher attaches to. Playwright's `Page` satisfies it. */
export interface RuntimeErrorPage {
  on(event: "pageerror", listener: (error: Error) => void): unknown
  on(event: "console", listener: (message: RuntimeConsoleMessage) => void): unknown
  route(
    match: (url: URL) => boolean,
    handler: (route: RuntimeRoute) => Promise<void>,
  ): Promise<unknown>
}

/** Options for {@link watchRuntimeErrors}. */
export interface RuntimeErrorWatchOptions {
  /**
   * The origins the page may reach, such as the app under test. A request to any other origin is
   * blocked and recorded, so the suite never depends on real network access.
   */
  readonly allowedOrigins: readonly string[]
}

/** The live record of a page's runtime failures. */
export interface RuntimeErrorWatch {
  /** Every failure recorded so far, in order, excluding the ones the test allowed. */
  readonly errors: readonly RuntimeError[]
  /** Accept failures whose message matches `pattern`, for a test that provokes them on purpose. */
  allow(pattern: RegExp): void
  /**
   * Take every failure recorded so far and clear the record. The caller then owns them, as a flow
   * does when it reports each failure against the checkpoint that raised it.
   */
  drain(): RuntimeError[]
  /** Throw one error that lists every recorded failure, if there is any. */
  expectNone(): void
}

// React names a server/client markup mismatch in the message it logs (or throws) for it.
const HYDRATION_MESSAGE = /hydrat/i

/**
 * Record everything that makes a visually plausible page wrong: an uncaught exception
 * (`pageerror`), a hydration mismatch, a console error, and a request that leaves the allowed
 * origins. Off-origin requests are aborted as well as recorded. Attach it before the first
 * navigation, and call {@link RuntimeErrorWatch.expectNone} when the test finishes.
 */
export async function watchRuntimeErrors(
  page: RuntimeErrorPage,
  options: RuntimeErrorWatchOptions,
): Promise<RuntimeErrorWatch> {
  const allowedOrigins = new Set(options.allowedOrigins.map((origin) => new URL(origin).origin))
  if (allowedOrigins.size === 0) {
    throw new RangeError("watchRuntimeErrors needs at least one allowed origin")
  }
  const allowed: RegExp[] = []
  const errors: RuntimeError[] = []
  const record = (kind: RuntimeErrorKind, raw: string): void => {
    const message = boundMessage(raw)
    if (allowed.some((pattern) => pattern.test(message))) return
    errors.push({ kind, message })
  }

  page.on("pageerror", (error) => {
    record(HYDRATION_MESSAGE.test(error.message) ? "hydration" : "pageerror", error.message)
  })
  page.on("console", (message) => {
    if (message.type() !== "error") return
    const text = message.text()
    record(HYDRATION_MESSAGE.test(text) ? "hydration" : "console", text)
  })
  await page.route(
    (url) =>
      (url.protocol === "http:" || url.protocol === "https:") && !allowedOrigins.has(url.origin),
    async (route) => {
      const request = route.request()
      record("request", `${request.method()} ${request.url()}`)
      await route.abort("blockedbyclient")
    },
  )

  return {
    errors,
    allow(pattern) {
      allowed.push(pattern)
    },
    drain() {
      return errors.splice(0)
    },
    expectNone() {
      if (errors.length === 0) return
      const detail = errors.map((error) => `${error.kind}: ${error.message}`).join("\n")
      throw new Error(`The page raised ${errors.length} runtime error(s):\n${detail}`)
    },
  }
}
