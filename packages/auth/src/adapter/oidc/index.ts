// Re-export-only barrel for the OIDC Authorization Code + PKCE adapter. The runtime factory and its
// registration helper pull in the OAuth stack (`oauth4webapi`/`jose`) and custody refresh tokens,
// so they are surfaced only from the token-bearing `@plainworks/auth/server` entry — never the
// neutral `.` core. The config type and kind carry no runtime dependency and are also re-exported
// from `.`.
export { oidcAdapter } from "./adapter"
export type { OidcAdapterConfig } from "./config"
export { OIDC_ADAPTER_KIND } from "./config"
export { registerOidcAdapter } from "./register"
export type { LoginTransaction } from "./transaction"
