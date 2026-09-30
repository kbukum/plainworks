"use client"

// Re-export-only barrel for the client session: the session context, auth gates, and permission
// policies.
export {
  Can,
  canManageAccount,
  canManageNotifications,
  canManageOrders,
  canManageTasks,
  hasName,
  RequireAuth,
  SessionProvider,
  session,
  useIdentity,
} from "./session"
