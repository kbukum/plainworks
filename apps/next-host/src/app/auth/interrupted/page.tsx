import type { ReactElement } from "react"
import { SignInInterrupted } from "../../../client/auth"

/**
 * Where the login callback sends a sign-in it could not complete. Public, like the overview; the
 * app frame supplies the page title.
 */
export default function SignInInterruptedPage(): ReactElement {
  return <SignInInterrupted />
}
