import type { WebURL } from "@plainworks/std"

/**
 * How much of a sanitized URL is retained: the full `scheme://host/path` or the path alone. Use
 * `"path"` when the host is a constant of the application and repeating it adds no diagnostic
 * value — a single-origin demo backend, for example.
 */
export type HttpUrlScope = "absolute" | "path"

/**
 * Reduce a request or response URL to a form safe for the timeline: scheme, host, and path, or
 * just the path under {@link HttpUrlScope} `"path"`. Userinfo (`user:pass@`), the query string, and
 * the fragment are always dropped because each can smuggle a credential — an `access_token` query
 * param, a signed-URL signature, a fragment secret — even though header-only auth is the rule. A
 * value that does not parse is reduced to a fixed placeholder rather than echoed, since the raw
 * string could itself be a token.
 */
export function sanitizeHttpUrl(rawUrl: string, scope: HttpUrlScope = "absolute"): string {
  let parsed: WebURL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return "[unparsable-url]"
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "[unsupported-url]"
  }
  if (scope === "path") return parsed.pathname
  parsed.username = ""
  parsed.password = ""
  parsed.search = ""
  parsed.hash = ""
  return parsed.toString()
}
