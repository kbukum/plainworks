/** A log that keeps only its most recent entries. */
export interface EvidenceLog<T> {
  readonly entries: readonly T[]
  remember(entry: T): void
}

/** A log of at most `limit` entries: each new one past the limit drops the oldest. */
export function createEvidenceLog<T>(limit: number): EvidenceLog<T> {
  const entries: T[] = []
  return {
    entries,
    remember(entry) {
      entries.push(entry)
      if (entries.length > limit) entries.shift()
    },
  }
}

/** The URL without its query and fragment, where a careless app might put a secret. */
export function withoutQuery(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return "(unparsable url)"
  }
}

/**
 * Snapshot the page's DOM as an inert file for a failure's evidence. It drops every script, every
 * `http-equiv` directive (so a refresh cannot navigate), and hidden and password field values,
 * then adds a policy that blocks script, plugins, frames, and `<base>`, so opening the file never
 * runs page code. The snapshot is cut at `maxChars`. Runs in the page, so it names nothing outside
 * its own body.
 */
export function snapshotDom(maxChars: number): string {
  const clone = document.documentElement.cloneNode(true)
  if (!(clone instanceof Element)) return ""
  for (const element of clone.querySelectorAll("script, meta[http-equiv]")) element.remove()
  for (const input of clone.querySelectorAll('input[type="hidden"], input[type="password"]')) {
    input.removeAttribute("value")
  }
  const policy = document.createElement("meta")
  policy.setAttribute("http-equiv", "Content-Security-Policy")
  policy.setAttribute(
    "content",
    "script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'",
  )
  let head = clone.querySelector("head")
  if (head === null) {
    head = document.createElement("head")
    clone.prepend(head)
  }
  head.prepend(policy)
  const html = `<!doctype html>\n${clone.outerHTML}\n`
  return html.length > maxChars
    ? `${html.slice(0, maxChars)}\n<!-- cut at ${maxChars} chars -->\n`
    : html
}
