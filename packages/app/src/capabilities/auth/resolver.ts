import type { AuthSnapshot } from "@plainworks/auth/session"
import { type Capability, defineCapability } from "../../kernel/capability"

/** The default id of the auth capability: its snapshot key and its provider's join key. */
export const AUTH_CAPABILITY_ID = "auth"

/** Options for {@link createAuthResolver}. */
export interface AuthResolverOptions {
  /**
   * Read the signed-in user from the request's `Cookie` header, as `ServerSession.read` from
   * `@plainworks/auth/server` does. Return only the client-safe {@link AuthSnapshot}, never a
   * token.
   */
  readonly read: (cookieHeader: string) => Promise<AuthSnapshot>
  /** The capability id; defaults to {@link AUTH_CAPABILITY_ID}. */
  readonly id?: string
}

/**
 * The server half of the auth recipe. It resolves the signed-in user for the request, so the page
 * renders signed in or signed out from the first paint. The snapshot holds identity only; tokens
 * stay in the server session. Pair it with `createAuthCapability` on the client.
 */
export function createAuthResolver(options: AuthResolverOptions): Capability<AuthSnapshot> {
  const { read, id = AUTH_CAPABILITY_ID } = options
  return defineCapability<AuthSnapshot>({
    id,
    resolve: ({ headers }) => read(headers.get("cookie") ?? ""),
  })
}
