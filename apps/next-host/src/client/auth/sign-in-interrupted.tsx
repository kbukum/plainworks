"use client"

import { ErrorState } from "@plainworks/ui/feedback/error-state"
import type { ReactElement } from "react"
import { LOGIN_PATH } from "../../neutral/constants"

/**
 * The recovery view for a sign-in that could not finish. The user starts a fresh sign-in by choice,
 * never automatically, so a browser that keeps dropping the login cookie cannot loop.
 */
export function SignInInterrupted(): ReactElement {
  return (
    <ErrorState
      title="Sign-in didn't finish"
      description="The sign-in expired or was started from a different address. Sign in again from this page."
      action={{ label: "Sign in again", href: LOGIN_PATH }}
    />
  )
}
