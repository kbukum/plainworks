/**
 * Decode the Retry-After header: integer seconds or a date relative to the injected current time.
 * Absent or malformed values carry no hint; an expired date permits an immediate retry.
 */
export function parseRetryAfterMs(headerValue: string | null, nowMs: number): number | undefined {
  if (headerValue === null) return undefined
  const trimmed = headerValue.trim()
  if (trimmed.length === 0) return undefined
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const dateMs = Date.parse(trimmed)
  if (Number.isNaN(dateMs)) return undefined
  return Math.max(0, dateMs - nowMs)
}
