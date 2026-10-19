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

/** Values inside marked private regions, used only in memory to redact textual evidence. */
export function privateValues(): string[] {
  const values: string[] = []
  // Evidence text is usually trimmed (ARIA, console), so padded values would never match it.
  const add = (value: string | null) => {
    const trimmed = value?.trim()
    if (trimmed) values.push(trimmed)
  }
  for (const root of document.querySelectorAll("[data-ui-private]")) {
    for (const node of [root, ...root.querySelectorAll("*")]) {
      add(node.textContent)
      for (const attr of node.attributes) {
        if (["title", "value", "aria-label"].includes(attr.name)) add(attr.value)
      }
    }
  }
  return [...new Set(values)].sort((a, b) => b.length - a.length)
}

/** Remove private page values before any text reaches retained artifacts. */
export function redactPrivate(text: string, values: readonly string[]): string {
  let redacted = text
  for (const value of values) redacted = redacted.replaceAll(value, "[redacted]")
  return redacted
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
  for (const element of clone.querySelectorAll("[data-ui-private]")) {
    for (const attr of [...element.attributes]) element.removeAttribute(attr.name)
    element.textContent = "[redacted]"
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
