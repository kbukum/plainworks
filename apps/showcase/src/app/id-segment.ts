// The single path-safe id encoder shared by every act-on write. An id becomes a URL path segment,
// so a value that could escape the segment — empty, `.`/`..`, or carrying a slash — is rejected
// before it reaches the request, and the rest is percent-encoded. Keeping the rule in one neutral
// (server-safe) module means the order, task, and notification writers can never drift on what a
// safe id segment is. Neutral: it names no host global.

/**
 * Encode a resource id as a URL path segment, rejecting a value that could escape it. `kind` names
 * the resource for the thrown error (`Invalid order id: "…"`). Throws on an empty, `.`/`..`, or
 * slash-bearing id; otherwise returns the percent-encoded segment.
 */
export function encodeIdSegment(kind: string, id: string): string {
  const trimmed = id.trim()
  if (
    trimmed === "" ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new Error(`Invalid ${kind} id: "${id}"`)
  }
  return encodeURIComponent(trimmed)
}
