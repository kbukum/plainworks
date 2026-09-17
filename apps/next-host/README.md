# @plainworks/next-host

The **second reference host**: a Next.js App Router / RSC application that assembles the same published `@plainworks/*` surfaces as the Vite `@plainworks/showcase`, over the same `@plainworks/demo` mock backend. Two genuinely different hosts on one kit is the proof of host-independence.

## Run it

```bash
bun install
bun run --filter @plainworks/next-host dev        # next dev (App Router) + in-process mock backend
bun run --filter @plainworks/next-host build      # next build (Turbopack)
bun run --filter @plainworks/next-host start       # next start (serves the production build)
bun run --filter @plainworks/next-host test        # vitest (auth flow + dispatch + client/axe)
```

Open `/` for the public overview, then sign in to reach the gated `/tasks` and `/account`. The in-process mock provider approves without a login page, so a click lands you straight back authenticated.

| Variable | Purpose |
|---|---|
| `APP_ORIGIN` (or `AUTH_REDIRECT_ORIGIN`) | The absolute origin the app is served on. Backs the `/api/*` base URL and the OIDC redirect URI. Defaults to `http://localhost:3000`. |
| `SESSION_SIGNING_KEY` | The HMAC key (32 bytes or more) for the identity-only session cookie. Unset, the host mints a random key at startup, so sessions do not survive a restart. |

The mock backend is a catch-all Route Handler (`/api/[...path]`) that dispatches each request through the published `@plainworks/mocks` handlers — the same seeded fixtures the browser's `/api/*` reads and the RSC prefetch reads, over real HTTP.

## What it demonstrates

- **The same kit under a different host.** The neutral composition kernel resolves an `AppSnapshot` in the RSC layout; a client `Providers` tree rebuilds the exact provider stack. The *same* surfaces — theme, query, channel, state, ui, auth — render under React Server Components and hydrate in the browser, not one line of the kit forked for Next.
- **The three-bucket architecture, by path.** `src/neutral` names no host global (constants, theme/task narrowing); `src/client` is `"use client"` (providers, chrome, list); `src/server` is server-only (session, identity provider, backend). The layout threads a serializable snapshot from server to client as a plain prop.
- **Token custody stays server-side.** Auth runs through `@plainworks/auth`'s `createServerSession` — Authorization Code + PKCE, an HMAC-signed **identity-only** session in a `__Host-` cookie. The BFF routes `/login`, `/auth/callback`, and `/logout` drive the flow; no token ever crosses to the client, and the token-custody modules carry the `server-only` marker so they cannot enter a client bundle.
- **Query prefetch survives RSC.** The gated Tasks page prefetches the list into a request-scoped query client and hands the dehydrated cache to a client `HydrationBoundary`, so the browser mounts the list under the identical key with no refetch flash.
- **A different router behind the same seam.** The section nav uses `next/link`; the `ui` breadcrumb `render` seam is backed by `router.push` from `next/navigation` — the same seam the showcase drives with a history router.

## Rough edges to know

- **`server-only` throws under plain Node.** The `server-only` package's non-`react-server` export throws at import, so it would break a Vitest run. Rather than omit the marker from the pure modules, every `src/server` module carries it uniformly (the token-custody boundary is enforced, not conventional) and `vitest.config.ts` aliases `server-only` to an empty stub for the test run — the build-time tripwire stays real while the modules remain unit-testable.
- **The mock backend is a singleton, on purpose.** Unlike the kit's per-request factories, the demo backend is one lazily-built instance — it *is* the external system, so its seeded stores must persist across requests. Every page and route that touches it is `dynamic = "force-dynamic"`; there is no static prerender of live backend data.
- **The browser query needs an absolute origin.** `@plainworks/http` resolves against an absolute base, so the server reads the origin from deployment configuration — `APP_ORIGIN` (or `AUTH_REDIRECT_ORIGIN`), defaulting to `http://localhost:3000` — and threads it to the client `HttpClientProvider`. A forwarded request header is never trusted for this, because it would let a caller aim the server-side fetch at an arbitrary host. Set the variable to the origin the app is actually served on; the OIDC redirect URI is built from the same value.
- **The kit ships Tailwind v4 *source* stylesheets.** `globals.css` composes `@plainworks/theme` and `@plainworks/ui` sources through `@tailwindcss/postcss`; the host owns the Tailwind build, the same way the showcase owns it through the Vite plugin.
- **Next needs `jsx: preserve`; Vitest does not.** The app's `tsconfig` sets `preserve` for Next's compiler, so `vitest.config.ts` overrides Vite's oxc transform to the automatic JSX runtime to compile the TSX under test. `typecheck` runs `next typegen` first so the generated route types exist in a clean checkout.

## Layout

| Path | Responsibility |
|---|---|
| `src/neutral` | Host-agnostic constants and the theme/task-read validation shared by every bucket. |
| `src/server` | Server-only request resolution, the auth composition, the mock-backend dispatch, and the BFF cookie plumbing. |
| `src/client` | The `"use client"` providers, app chrome, live stream, task list, and session gates. |
| `src/app` | The App Router tree: RSC layout and pages, the BFF route handlers, and the mock-backend catch-all. |

The app consumes only published package exports. Nothing in `packages/` imports it, and its route tree stays local.

## CI

The standard turbo gates (`typecheck`, `build`, `test`, `lint`, `check-comments`, `check-boundaries`, `check-versions`) run over this app as a workspace member in the `verify` job. A dedicated `hosts-smoke` job then **boots** both reference hosts and probes them over HTTP — the Vite showcase's SSR and the Next host's overview, mock backend, and session gate — proving they run, not just compile. Being `"private": true`, the app is excluded from `check-packaging` and the release publish set.
