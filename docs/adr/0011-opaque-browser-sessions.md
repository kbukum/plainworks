# 0011 — Opaque browser sessions, consumer-owned authority

**Status:** Accepted · **Date:** 2026-10-04 · **Supersedes:** [0002](./0002-bff-cookie-default-token-interop.md)

## Context

A browser needs to prove its session without holding provider credentials. Consumers may already have a backend session authority; the kit must not require another auth server or database.

## Decision

The browser sends an opaque `__Host-session` cookie with `Secure`, `HttpOnly`, `SameSite=Strict` and `Path=/`. Identity, provider tokens and refresh custody stay at the backend. Status publishes only identity, expiry and CSRF proof. Browser token fallback and signed identity-cookie sessions are not supported.

Consumers choose the authority and persistence. Core auth supplies contracts and a bounded memory default. The Next demo owns its SQLite integration; neither auth nor mocks requires the driver. Server JWT and API-key verifiers are separate server-edge capabilities, not browser session alternatives.

## Consequences

One browser root owns session state; React bindings and protected transports borrow it. Authoritative expiry, revocation and status failures stop protected work without stopping public requests. Legitimate OIDC provider refresh remains server-side.
