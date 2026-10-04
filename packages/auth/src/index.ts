// Prelude for `@plainworks/auth`: the typed `AuthError` every module throws. Each other concern
// is its own subpath (`./adapter`, `./authz`, `./crypto`, `./csrf`, `./redirect`, `./session`,
// `./signer`). Token custody and the BFF helpers live
// on the server-quarantined `./server` entry, the React bindings on `./client`, and the browser
// navigator on `./form-post`. Re-export-only barrel; no React or DOM imports.
export type { AuthErrorCode } from "./errors"
export { AuthError, isAuthErrorKind } from "./errors"
