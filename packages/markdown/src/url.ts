const allowedProtocols = new Set(["http:", "https:", "mailto:"])

/**
 * The link policy for untrusted Markdown: returns `url` when it is an absolute `http`, `https` or
 * `mailto` URL, otherwise `undefined`. Relative URLs are refused too, so untrusted text cannot link
 * into the host application.
 */
export function safeMarkdownUrl(url: string): string | undefined {
  let protocol: string
  try {
    protocol = new URL(url).protocol
  } catch {
    // Not an absolute URL: refused by policy, not an error.
    return undefined
  }
  return allowedProtocols.has(protocol) ? url : undefined
}
