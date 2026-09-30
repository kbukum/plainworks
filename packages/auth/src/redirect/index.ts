// Re-export-only barrel for the redirect concern: return-target sanitizing and the session guard.
export type { AuthGuardConfig } from "./guard"
export { guardSession, unauthenticatedRedirect } from "./guard"
export { sanitizeReturnTo } from "./sanitize"
