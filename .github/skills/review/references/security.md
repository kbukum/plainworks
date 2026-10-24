# Security

plainworks ships auth and transport that consumers trust, so a gap here reaches every app. Trace each untrusted input from boundary to use, and each credential from custody to transport.

Rules: [Security and privacy](../../../engineering.md#security-and-privacy). Policy: [SECURITY.md](../../../../SECURITY.md). Decision: [ADR 0011](../../../../docs/adr/0011-opaque-browser-sessions.md).

**Changes:** every new input path and credential path. **Project:** auth, transports, fetch and stream code, cookie handling, and devtools redaction.

## Checks

| Finding | Severity |
|---|---|
| Untrusted input (payloads, decoded messages, URL params, model output) used without validation or a size and time bound | blocker |
| Credential in a URL, including SSE and WebSocket URLs | blocker |
| Any browser-held token, in memory or storage, or a fallback to one | blocker |
| Server custody importable from a `"use client"` module | blocker |
| Session cookie missing `__Host-`, `Secure`, `HttpOnly`, or `SameSite`; cookie-auth state changes without CSRF protection | blocker |
| OIDC without PKCE `S256`, inexact redirect match, open outbound hosts, or broken server-side refresh and rotation | blocker |
| `Math.random`, MD5, or SHA-1 for security; JWT without algorithm allow-list or `exp`, `iss`, `aud` checks | blocker |
| Token, secret, cookie, or full payload in logs, errors, or devtools; unbounded retention | blocker |
| Secret in source or fixtures | blocker |

The authoritative backend may be any stack; the contract is the opaque session and server custody, not Next or a particular database.

## Detection starters

```bash
rg -i "localStorage|sessionStorage" packages/*/src
rg -i "token=|access_token=|api_?key=" packages/*/src
rg -i "math\.random|md5|sha1|alg.*none" packages/*/src
rg -i "console\.\w+\(.*\b(token|secret|password|cookie)\b" packages/*/src
rg -i "sameSite|httpOnly|__Host-" packages/*/src
```
