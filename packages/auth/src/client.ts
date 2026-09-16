"use client"

// Client public entry for `@plainworks/auth` — the browser/React-Native surface. It carries only
// identity and status (the `useSession` hooks) and the login/logout navigation that bounces to the
// BFF routes; the access and refresh tokens live exclusively on the server `./server` entry and
// never reach here. Re-export-only barrel over the DOM-free client concern modules. The per-module
// `"use client"` directive makes tsdown emit this (and only the client graph) as the `./client`
// entry, keeping the neutral `.` and token-bearing `./server` entries clean.
export type { AuthGates, CanProps, RequireAuthProps } from "./client/gates"
export { createAuthGates } from "./client/gates"
export type { AuthNavigate, AuthSubmit, LoginOptions, LogoutOptions } from "./client/navigation"
export { login, logout } from "./client/navigation"
export type { SessionContext, SessionProviderProps } from "./client/session-context"
export { createSessionContext } from "./client/session-context"
