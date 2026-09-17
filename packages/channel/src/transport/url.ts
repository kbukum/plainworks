import type { WebAbortSignal } from "@plainworks/std"
import { ChannelError } from "../error"

/** What an async {@link UrlSource} provider receives: the attempt's cancellation signal. */
export interface UrlContext {
  /** Aborts on connect timeout or caller close — a hanging discovery must not outlive its attempt. */
  readonly signal: WebAbortSignal
}

/**
 * A connection endpoint: a fixed string, or a provider resolved on **every** attempt for endpoint
 * discovery/rotation. The provider returns the endpoint only — a credential NEVER belongs in the
 * URL (a signed URL is still a credential: it leaks through logs, history, and referrers).
 * Auth flows through the channel's header seam, re-resolved per attempt.
 */
export type UrlSource = string | ((context: UrlContext) => string | Promise<string>)

/** Resolve a {@link UrlSource} to a concrete endpoint, rejecting a provider failure as a config error. */
export async function resolveUrl(source: UrlSource, signal: WebAbortSignal): Promise<string> {
  if (typeof source === "string") {
    return source
  }
  try {
    return await source({ signal })
  } catch (cause) {
    throw ChannelError.config("channel url provider failed", { cause })
  }
}
