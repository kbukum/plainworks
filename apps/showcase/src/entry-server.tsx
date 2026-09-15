// The conventional Vite SSR entry — a thin re-export of the render seam so a host (the dev server,
// a production SSR adapter) has one module to load. The logic lives in `./server/render`.

import { type RenderInput, type RenderResult, renderApp } from "./server/render"

export { type RenderInput, type RenderResult, renderApp }

/** The render entry's type — the dev server loads this module lazily and calls through it. */
export type RenderApp = typeof renderApp
