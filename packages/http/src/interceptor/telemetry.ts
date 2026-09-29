import { type Telemetry, type TelemetryAttributes, toTelemetryFailure } from "@plainworks/std/seam"
import type { WebResponse, WebURL } from "@plainworks/std/web"
import type { HttpInterceptor } from "./handler"

/** The operation name every request reports under. */
const OPERATION = "http.client.request"

/**
 * Describe a request URL without anything that can carry a credential: userinfo, query and
 * fragment are stripped, keeping scheme, host and path. A value that doesn't parse becomes a fixed
 * placeholder, since the raw string could itself be a token.
 */
function describeUrl(rawUrl: string): TelemetryAttributes {
  let parsed: WebURL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { "url.full": "[unparsable-url]" }
  }
  parsed.username = ""
  parsed.password = ""
  parsed.search = ""
  parsed.hash = ""
  return { "url.full": parsed.toString(), "server.address": parsed.hostname }
}

/**
 * Report each attempt through the {@link Telemetry} seam as an `http.client.request` operation,
 * with OpenTelemetry HTTP client attributes. A response of 400 or above fails with its status code
 * as the error type; a thrown error fails with its redacted kind and is rethrown. Headers and
 * bodies are never reported.
 */
export function telemetryInterceptor(telemetry: Telemetry): HttpInterceptor {
  return (next) => async (request) => {
    const operation = telemetry.start(OPERATION, {
      "http.request.method": request.method,
      ...describeUrl(request.url),
    })
    let response: WebResponse
    try {
      response = await next(request)
    } catch (error) {
      operation.fail(toTelemetryFailure(error))
      throw error
    }
    const status = { "http.response.status_code": response.status }
    if (response.status >= 400) {
      operation.fail({ type: String(response.status), message: `HTTP ${response.status}` }, status)
    } else {
      operation.finish(status)
    }
    return response
  }
}
