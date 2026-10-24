# @plainworks/vite

> Link an app to a local plainworks checkout's source for fast feedback in the Vite dev server and Vitest.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add -d @plainworks/vite
```

## Usage

Turn the link on only for inner-loop runs. Builds, type checks and acceptance gates keep installing the packed kit, so they prove what consumers get.

```ts
// vite.config.ts
import { plainworksSource } from "@plainworks/vite"
import { defineConfig } from "vite"

const checkout = process.env.PLAINWORKS_SOURCE === "1" ? "../plainworks" : undefined

export default defineConfig({
  plugins: checkout === undefined ? [] : [plainworksSource({ checkout })],
})
```

With the link on:

- Each `@plainworks/*` import resolves through the checkout's own `exports` map under the `@plainworks/source` condition, so an edit to kit source shows up on the next reload or test run. Entries with no source file (vendored atoms, generated assets) resolve to the checkout's `dist`.
- Kit stylesheets (`@import "@plainworks/ui/styles.css"`) link the same way, through exact-match aliases, because CSS resolvers such as Tailwind's skip plugin hooks. Their `@source` globs then scan the checkout's `src`, so kit style edits and newly used utility classes show up without a repack.
- The kit's peers (React, TanStack Query, Connect and so on) resolve once, from the app. So do the kit's runtime dependencies that the app has installed, as they would after a packed install; without this, a dependency such as Base UI loads from the checkout and brings a second React. Add more with `dedupe`.
- The checkout joins the dev server's allowed folders.

The link fails instead of falling back to the installed copy: a missing checkout or an unknown subpath throws a `SourceLinkError`. When the installed kit's versions differ from the checkout's, Vite logs one warning so you know to repack before acceptance runs.

## Runtime

Node only. The plugin runs inside Vite or Vitest and reads the checkout with `node:fs`; it never enters an app's runtime graph.
