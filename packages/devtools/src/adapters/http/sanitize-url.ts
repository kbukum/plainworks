import type { WebURL } from "@plainworks/std"

/**
 * Reduce a request or response URL to a form safe for the timeline: scheme, host, and path only.
 * Userinfo (`user:pass@`), the query string, and the fragment are dropped because each can smuggle
 * a credential — an `access_token` query param, a signed-URL signature, a fragment secret — even
 * though header-only auth is the rule. A value that does not parse is reduced to a fixed
 * placeholder rather than echoed, since the raw string could itself be a token.
 */
export function sanitizeHttpUrl(rawUrl: string): string {
  let parsed: WebURL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return "[unparsable-url]"
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "[unsupported-url]"
  }
  parsed.username = ""
  parsed.password = ""
  parsed.search = ""
  parsed.hash = ""
  return parsed.toString()
}
