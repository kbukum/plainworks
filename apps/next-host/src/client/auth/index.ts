"use client"

// Re-export-only barrel for the client session, its gates, and the interrupted sign-in view.
export {
  Can,
  canManageAccount,
  session,
  useIdentity,
  useIsAuthenticated,
  useSession,
  useSessionRuntime,
} from "./session"
export { SignInInterrupted } from "./sign-in-interrupted"
