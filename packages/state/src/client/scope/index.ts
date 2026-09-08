"use client"

export type { CookieJar, CookieScopeOptions } from "./cookie"
// Re-export-only barrel for the DOM **scope backends** — the host-backed scopes. Every module here
// carries `"use client"`; the neutral `memory` scope and serializers live in the server-safe `.`
// entry (`@plainworks/state`), and the unified scoped-state surface lives in the sibling
// `../scoped`.
export { cookieScope, createCookieScope } from "./cookie"
export type { UrlHost, UrlMode, UrlScopeOptions } from "./url"
export { createUrlScope, urlScope } from "./url"
export type { WebStorageKind, WebStorageLike, WebStorageScopeOptions } from "./web-storage"
export { createWebStorageScope, persistentScope, sessionScope } from "./web-storage"
