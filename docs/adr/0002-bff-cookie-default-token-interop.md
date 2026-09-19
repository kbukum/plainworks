# 0002 — The BFF session cookie is the default token interop

**Status:** Accepted · **Date:** 2026-09-19

## Context

A React app talking to an API needs to prove identity on each request. Storing a token in `localStorage` exposes it to any script on the page and is a standing XSS liability. Some backends, however, expect a bearer token directly and cannot sit behind a session-cookie BFF.

## Decision

The default is the **backend-for-frontend session cookie**: a `__Host-` `Secure` + `HttpOnly` + `SameSite` cookie the browser attaches automatically, with the token custody kept server-side and out of any client graph. Tokens never live in `localStorage` or `sessionStorage`, and never travel in a URL.

For backends that require a direct token, the `jwt` adapter (`auth/adapter/jwt`) verifies bearer tokens on the server edge. It is the opt-in path, not the default.

## Consequences

- The safe path is the default path: the common app never handles a raw token in the browser.
- Direct-token backends are still supported without weakening the default.
- Auth token-custody code must stay out of `"use client"` graphs, an invariant the boundary gate enforces.
