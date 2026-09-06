/**
 * Vite plugin for MSW mock API server
 *
 * This plugin uses Vite's configureServer hook to add middleware
 * that handles /api/* requests using MSW handlers.
 *
 * Benefits over browser-based MSW:
 * - More realistic (actual HTTP requests)
 * - Network tab works properly in DevTools
 * - No MSW runtime in browser bundle (saves ~3MB)
 * - Same code works for production (just change API URL)
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import type { RequestHandler } from "msw"
import type { Plugin, ViteDevServer } from "vite"

export interface MockServerPluginOptions {
  /**
   * API base path to intercept (default: '/api')
   */
  basePath?: string

  /**
   * Whether to enable the mock server (default: true in dev)
   */
  enabled?: boolean

  /**
   * Simulated network latency in ms (default: 0)
   */
  latency?: number

  /**
   * Maximum request body size in bytes (default: 1 MiB). Oversized bodies are rejected with 413.
   */
  maxBodyBytes?: number
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024

/** Marker error for a request body that exceeded the configured byte limit. */
class BodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`request body exceeded ${limit} bytes`)
    this.name = "BodyTooLargeError"
  }
}

/**
 * Creates a Vite plugin that serves mock API responses
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { mockServerPlugin } from '@plainworks/mocks/vite-plugin'
 * import { createMockApi } from '@plainworks/mocks'
 *
 * export default defineConfig({
 *   plugins: [
 *     mockServerPlugin(createMockApi().handlers),
 *   ],
 * })
 * ```
 */
export function mockServerPlugin(
  handlers: RequestHandler[],
  options: MockServerPluginOptions = {},
): Plugin {
  const {
    basePath = "/api",
    enabled = true,
    latency = 0,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  } = options

  // Validate eagerly so a bad option fails at config time, never silently mid-request.
  if (typeof basePath !== "string" || !basePath.startsWith("/")) {
    throw new RangeError('mockServerPlugin: basePath must start with "/"')
  }
  // Normalize: `/api/` == `/api`, and `/` means the whole origin. (A loop, not a regex: no
  // backtracking surface on config input.)
  let namespace = basePath
  while (namespace.length > 1 && namespace.endsWith("/")) {
    namespace = namespace.slice(0, -1)
  }
  if (namespace === "/") namespace = ""
  if (!Number.isFinite(latency) || latency < 0) {
    throw new RangeError("mockServerPlugin: latency must be a finite number >= 0")
  }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) {
    throw new RangeError("mockServerPlugin: maxBodyBytes must be a positive safe integer")
  }

  return {
    name: "vite-plugin-mock-server",

    // Only apply during dev server
    apply: "serve",

    configureServer(server: ViteDevServer) {
      if (!enabled) return

      // Add middleware to handle API requests
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const url = req.url || ""

          // Only intercept requests under the API base path. Match at a path-segment boundary on
          // the pathname so sibling routes like `/apiary` are left alone.
          const pathname = url.split("?")[0] ?? ""
          const inNamespace =
            namespace === "" || pathname === namespace || pathname.startsWith(`${namespace}/`)
          if (!inNamespace) {
            return next()
          }

          try {
            // Build full URL for MSW
            const protocol = "http"
            const host = req.headers.host || "localhost:5173"
            const fullUrl = `${protocol}://${host}${url}`

            // Convert Node request to Fetch API Request
            const method = req.method || "GET"
            const headers = new Headers()

            for (const [key, value] of Object.entries(req.headers)) {
              if (value) {
                headers.set(key, Array.isArray(value) ? value.join(", ") : value)
              }
            }

            // Read request body for non-GET requests (bounded — see readRequestBody)
            let body: string | undefined
            if (method !== "GET" && method !== "HEAD") {
              body = await readRequestBody(req, maxBodyBytes)
            }

            const request = new Request(fullUrl, {
              method,
              headers,
              ...(body !== undefined ? { body } : {}),
            })

            // Add latency if configured, tied to the request lifecycle: a client disconnect
            // cancels the wait and skips the response write instead of writing to a closed socket.
            let aborted = false
            const onClose = (): void => {
              aborted = true
            }
            req.on("close", onClose)
            try {
              if (latency > 0) {
                await new Promise<void>((resolve) => {
                  const timer = setTimeout(() => resolve(), latency)
                  req.once("close", () => {
                    clearTimeout(timer)
                    resolve()
                  })
                })
              }

              // Try to find a matching handler
              const response = await handleRequest(request, handlers)

              if (aborted) return

              if (response) {
                // Set response headers
                res.statusCode = response.status
                response.headers.forEach((value, key) => {
                  res.setHeader(key, value)
                })

                // Send response body
                const responseBody = await response.text()
                res.end(responseBody)
              } else {
                // The API namespace is terminal: the body stream is already consumed here, so
                // delegating to downstream middleware would hand it an exhausted request.
                res.statusCode = 404
                res.setHeader("Content-Type", "application/json")
                res.end(JSON.stringify({ error: `No mock handler for ${method} ${url}` }))
              }
            } finally {
              req.off("close", onClose)
            }
          } catch (error) {
            if (error instanceof BodyTooLargeError) {
              res.statusCode = 413
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ error: "Request body too large" }))
              return
            }
            console.error("[mock-server] Error handling request:", error)
            res.statusCode = 500
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ error: "Internal mock server error" }))
          }
        },
      )
    },
  }
}

/**
 * Read the request body from a Node.js IncomingMessage, rejecting once `maxBytes` is exceeded and
 * cleaning up listeners when the request aborts.
 */
function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    const cleanup = (): void => {
      req.off("data", onData)
      req.off("end", onEnd)
      req.off("error", onError)
      req.off("close", onClose)
    }
    let tooLarge = false
    const onData = (chunk: Buffer): void => {
      size += chunk.length
      if (size > maxBytes) {
        // Keep draining (discarding) instead of destroying the request: destroying kills the
        // socket, so the caller could never receive the 413 response.
        tooLarge = true
        chunks.length = 0
        return
      }
      if (!tooLarge) chunks.push(chunk)
    }
    const onEnd = (): void => {
      cleanup()
      if (tooLarge) {
        reject(new BodyTooLargeError(maxBytes))
        return
      }
      resolve(Buffer.concat(chunks).toString())
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onClose = (): void => {
      cleanup()
      reject(new Error("request aborted"))
    }

    req.on("data", onData)
    req.on("end", onEnd)
    req.on("error", onError)
    req.on("close", onClose)
  })
}

/**
 * Find and execute a matching MSW handler
 */
async function handleRequest(
  request: Request,
  handlers: RequestHandler[],
): Promise<Response | undefined> {
  // Generate a unique request ID for MSW
  const requestId = crypto.randomUUID()

  for (const handler of handlers) {
    // Use MSW's handler.run() method to check if handler matches
    const result = await handler.run({
      request: request as Parameters<typeof handler.run>[0]["request"],
      requestId,
    })

    if (result?.response) {
      return result.response
    }
  }

  return undefined
}

export default mockServerPlugin
