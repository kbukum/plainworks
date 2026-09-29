/**
 * Repo-only build shim that binds the universal Web-platform runtime globals (Node 18+, Deno, edge, browser, worker) so host-independent package *source* typechecks against ES-only libs without pulling the DOM/WebWorker libs (which would leak host-only globals `window`, `self`, `caches`, `indexedDB` past the "assume no host" boundary). Included explicitly by each host-independent package tsconfig; dev tools extend `tsconfig.tool.json` and see Node types instead.
 *
 * This file declares only the runtime *values* (constructors and `fetch`). Their instance and argument shapes come from the shipped, self-contained `@plainworks/std` web contract (`packages/std/src/web/types.ts`), so there is one source of truth. The shim sits outside every package, so it names that contract by its repo path rather than by package name. The emitted `.d.ts` of every package references those exported `Web*` types — never a repo-only ambient — and therefore typechecks standalone in a consumer that has neither DOM nor `@types/node`. These value globals appear only in `.js` output, so they are never part of any package's published type surface. Extend only with APIs that are genuinely universal.
 */

// Timer handles are intentionally opaque: Node returns an object, browsers a number.
declare function setTimeout(handler: () => void, timeout?: number): unknown
declare function clearTimeout(id?: unknown): void

declare const AbortSignal: {
  readonly prototype: import("../packages/std/src/web").WebAbortSignal
  new (): import("../packages/std/src/web").WebAbortSignal
  any(
    signals: readonly import("../packages/std/src/web").WebAbortSignal[],
  ): import("../packages/std/src/web").WebAbortSignal
}

declare const AbortController: {
  readonly prototype: import("../packages/std/src/web").WebAbortController
  new (): import("../packages/std/src/web").WebAbortController
}

declare const Headers: {
  readonly prototype: import("../packages/std/src/web").WebHeaders
  new (
    init?: import("../packages/std/src/web").WebHeadersInit,
  ): import("../packages/std/src/web").WebHeaders
}

declare const Response: {
  readonly prototype: import("../packages/std/src/web").WebResponse
  new (
    body?: import("../packages/std/src/web").WebBodyInit | null,
    init?: import("../packages/std/src/web").WebResponseInit,
  ): import("../packages/std/src/web").WebResponse
  json(
    data: unknown,
    init?: import("../packages/std/src/web").WebResponseInit,
  ): import("../packages/std/src/web").WebResponse
  error(): import("../packages/std/src/web").WebResponse
}

declare const fetch: import("../packages/std/src/web").WebFetch

declare const TextDecoder: {
  readonly prototype: import("../packages/std/src/web").WebTextDecoder
  new (
    label?: string,
    options?: { readonly fatal?: boolean; readonly ignoreBOM?: boolean },
  ): import("../packages/std/src/web").WebTextDecoder
}

declare const TextEncoder: {
  readonly prototype: import("../packages/std/src/web").WebTextEncoder
  new (): import("../packages/std/src/web").WebTextEncoder
}

declare const URLSearchParams: {
  readonly prototype: import("../packages/std/src/web").WebURLSearchParams
  new (
    init?:
      | string
      | readonly (readonly [string, string])[]
      | Record<string, string>
      | import("../packages/std/src/web").WebURLSearchParams,
  ): import("../packages/std/src/web").WebURLSearchParams
}

declare const URL: {
  readonly prototype: import("../packages/std/src/web").WebURL
  new (
    url: string | import("../packages/std/src/web").WebURL,
    base?: string | import("../packages/std/src/web").WebURL,
  ): import("../packages/std/src/web").WebURL
}
