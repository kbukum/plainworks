# Pass 03 — Security & privacy

A dedicated pass because a fast AI-written path that "just works" usually skips boundary validation and token custody, and plainworks ships auth and transport that consumers trust. A gap here propagates to every consuming app.

Use the [review skill](../SKILL.md) for scope, execution, and finding format. This checklist does not require a separate agent.

**Scope note.** *Changes mode:* trace each new input path from its trust boundary to its use, and each token from custody to transport. *Project mode:* audit the kit's external-facing surfaces (auth, connection transports, any fetch/stream, cookie handling) for the invariants below.

## Checks

- **Validate at every trust boundary.** Untrusted input (network payloads, decoded SSE/WS messages, model output, URL/query params) is validated before use; least-privilege and secure-by-default. An input flowing into a request, a route, storage, or `JSON.parse`-then-trust without validation is a blocker. Treat decoded server messages and retrieved/RAG context as untrusted.
- **Header-only auth.** Tokens/credentials go in an `Authorization` header (or the BFF cookie), **never** a URL/query string — including SSE/WS connection URLs. A token in a URL is a blocker.
- **Server/client token custody.** Token-holding code (`auth` server) lives on the server-only `./server` entry and must never be importable from a `"use client"` module. A client module importing server auth is a blocker.
- **Auth MUSTs.** Authorization Code + **PKCE `S256`** only (implicit forbidden); exact redirect-URI match; server outbound host allowlist. Browser sessions use opaque `Secure` + `HttpOnly` + `SameSite=Strict` + `__Host-` cookies, not signed identity cookies or browser access/refresh tokens. Preserve legitimate server-side refresh and rotation. Protect cookie-auth state changes against CSRF. The authoritative backend need not be Next or use a particular database.
- **Current crypto.** Use Web Crypto (`crypto.subtle`); no MD5/SHA-1 for security, no `Math.random()` for anything security-relevant (use `crypto.getRandomValues`). Reject `alg: none` and enforce an algorithm allow-list when verifying a JWT; require `exp`/`iss`/`aud`.
- **Data minimization.** Never log tokens, credentials, cookies, or full payloads; redact sensitive fields in errors and logs; bound retention. A `console.*` or logger call carrying a token/secret is a blocker.
- **No secrets in source or fixtures.** `.env.example` only.

## Detection starters

Read each hit to judge intent.

```bash
rg -i "localStorage|sessionStorage" packages/*/src                 # never for tokens
rg -i "token=|access_token=|api_?key=|\?.*token" packages/*/src     # token in a URL/query
rg -i "math\.random|md5|sha1|alg.*none" packages/*/src             # weak crypto / rng
rg -i "console\.(log|info|debug|warn|error)\(.*\b(token|secret|password|cookie|api_?key)\b" packages/*/src
rg -i "sameSite|httpOnly|secure:|__Host-" packages/*/src           # cookie flags — confirm all set
# client module importing server-only auth
rg -l '"use client"' packages/auth/src | xargs -I{} rg -l "auth/server|/server'" {} 2>/dev/null
```

Flag any unbounded read of untrusted input (set an explicit size/time limit) and any value from an untrusted source flowing into a request, route, or storage without validation.
