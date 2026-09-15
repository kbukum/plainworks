/**
 * Open-redirect guard for a post-login `returnTo` (or any caller-supplied redirect target).
 * An attacker who controls the target of a redirect can bounce a freshly-authenticated user to an
 * external phishing origin, so a target is accepted **only** when it is a same-origin,
 * path-absolute reference — everything else collapses to the `fallback`.
 *
 * Accepted: a single-slash, path-absolute reference (`/dashboard`, `/tasks?page=2#top`). Rejected
 * (→ `fallback`): an absolute URL (`https://evil.test`), a scheme-relative URL (`//evil.test`), a
 * backslash-obscured variant (`/\evil.test`, `\\evil.test`), a control character, or anything not
 * starting with a single `/`. Pure and host-neutral — no `URL`/DOM parsing that would resolve
 * against an ambient origin.
 */
export function sanitizeReturnTo(candidate: string | undefined, fallback = "/"): string {
  if (candidate === undefined || candidate.length === 0) {
    return fallback
  }
  // Normalize backslashes so `\` cannot be used to smuggle a scheme-relative or host reference past
  // the checks below (browsers treat `\` as `/` in URLs).
  const normalized = candidate.replace(/\\/g, "/")
  // Must be path-absolute and NOT scheme-relative (`//host`), which would navigate cross-origin.
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return fallback
  }
  // Reject control characters (including a leading tab/newline that a browser would strip) and any
  // whitespace that could re-open a `//` or scheme parse after trimming.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the intended guard — a smuggled tab/newline/NUL in a redirect target must be rejected, not trusted.
  if (/[\u0000-\u001f\u007f\s]/.test(normalized)) {
    return fallback
  }
  return normalized
}
