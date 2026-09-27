import "server-only"

// The login callback's decision: where the browser goes once the provider returns. A completed
// round trip returns to the captured target. A callback with no valid login transaction, because
// its cookie expired or sign-in began on another origin, lands on a recovery page rather than
// failing, and never restarts sign-in on its own: a browser that drops the cookie would loop.

import { isAuthErrorKind } from "@plainworks/auth"
import type { ServerSessionJar } from "@plainworks/auth/server"
import { SIGN_IN_INTERRUPTED_PATH } from "../neutral/constants"
import type { NextAuth } from "./auth"

/** Complete the login callback and return the path to redirect the browser to. */
export async function completeCallback(
  session: NextAuth["session"],
  jar: ServerSessionJar,
  params: Readonly<Record<string, string>>,
): Promise<string> {
  try {
    const result = await session.completeLogin(jar, { params })
    return result.returnTo
  } catch (error) {
    if (isAuthErrorKind(error, "auth/login-transaction")) {
      return SIGN_IN_INTERRUPTED_PATH
    }
    throw error
  }
}
