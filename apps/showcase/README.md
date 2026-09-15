# @plainworks/showcase

## Run it

```bash
bun install
bun run --filter @plainworks/showcase dev     # Vite dev server + mock /api backend
bun run --filter @plainworks/showcase build    # tsdown-free Vite client + server bundles
bun run --filter @plainworks/showcase test     # vitest (SSR + hydration + live-stream + nav/axe)
```

The showcase is a server-rendered **Tasks dashboard**. It prefetches query data, hydrates without a mismatch, applies the theme before paint, routes live events into state and cache updates, and uses the host's router-aware breadcrumb link.

The dev backend is the mocks package: `mockServerPlugin(createMockApi().handlers)` serves `/api/*` in Vite, and the same `createMockApi` handlers drive the SSR server and the tests (MSW, `onUnhandledRequest: "error"`) — no real network in any path.

## What it demonstrates

- **Composition through the kernel, host-first.** `createApp` on the neutral half resolves an `AppSnapshot`; `serializeSnapshot` embeds it; `deserializeSnapshot` + `AppProvider` on the client rebuild the exact provider tree. The *same* `<Showcase>` tree renders on the server (`renderToString`) and hydrates on the client (`hydrateRoot`) with zero React warnings.
- **Server-resolved state reaches the client intact.** The serialized snapshot rides in the HTML and drives the client.
- **Query prefetch survives SSR.** `prefetchQuery` + `dehydrateClient` on the server put the task rows straight into the server markup with no client refetch.
- **One stream, two sinks, one contract.** A single `@plainworks/channel` stream, decoded once, folds through a unified `EventSink` into both a scoped state slot and the TanStack query cache.
- **Zero-flash theme.** `resolveTheme` runs on the server from the theme cookie and writes the class onto `<html>` before any script runs; `ThemeProvider` reapplies it without a mismatch, and falls back to the default theme when no cookie is present.
- **Router-aware navigation via the ui injection point.** The breadcrumb's `render` prop takes the app's own link, which intercepts a plain left click and routes client-side while staying a real, keyboard-operable `<a href>` with no axe violations.

## Rough edges to know

- **The server builds the client capability registry.** SSR needs the *client* capabilities (query/theme/scopes) to resolve the snapshot the client will rehydrate, so `render.tsx` imports from `./client/*`. The `"use client"` split is about the *bundler graph*, not the SSR renderer, but it reads oddly that the server module pulls in client capability recipes. It works because the recipes are DOM-free React, but the naming invites a double-take.
- **The theme cookie couples an encoding across three seams.** `@plainworks/theme`'s `parseThemeCookie` (JSON-in-`decodeURIComponent`) and `@plainworks/state`'s `cookieScope` writer must agree byte-for-byte, and `parseCookieHeader` returns *raw* (undecoded) values. Getting the round-trip right (encode on write, decode on parse) is a real trap — a mismatched encoder produces a silent flash, not an error.
- **The kit ships Tailwind v4 *source* stylesheets, not compiled CSS.** `@plainworks/theme/styles.css` and `@plainworks/ui/*` are `@import "tailwindcss"` sources, so a consumer must add `@tailwindcss/vite` and compose them itself (here, `src/client/styles.css`). That is a reasonable design, but the "just import the CSS" expectation does not hold — the host owns the Tailwind build.
- **The breadcrumb `render` prop is progressively enhanced for host routers.** Injecting a host link uses typed `AnchorHTMLAttributes<HTMLAnchorElement>`, routing client-side while preserving native accessibility, keyboard operability, and valid anchor semantics.

## Layout

| Path | Responsibility |
|---|---|
| `src/app` | Host-neutral snapshot creation, task reads, validation, and theme resolution. |
| `src/server` | Server rendering and the HTML shell. |
| `src/client` | The shared render tree, client capabilities, live stream, router, and styles. |
| `src/entry-server.tsx` | SSR entry used by the development server and tests. |

The app consumes only published package exports. Nothing in `packages/` imports it, and its route tree stays local.

## CI

The app is wired into CI **by being a workspace member with the standard turbo tasks** — no bespoke job. The `verify` job in `.github/workflows/ci.yml` runs `bun run typecheck`, `build`, `test`, `lint`, `check-comments`, `check-boundaries`, and `check-versions` across the whole graph, so `@plainworks/showcase`'s SSR/hydration smoke test runs on every PR and is re-executed (via turbo's topological cache) whenever a consumed package changes. Being `"private": true`, it is excluded from `check-packaging` and the release publish set.
